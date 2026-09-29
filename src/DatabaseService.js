const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto');

const Service = require('./Service');
const { DiskCache } = require('../lib/DiskCache');
const { getCacheKey, mapNamedParams } = require('../lib/QueryUtils');

const LAMBDA = () => {};

/**
 * Base class for database services.
 *
 * Handles what every database service needs: loading query definitions
 * (inline or from files), `@name` parameters, result caching, and callback-
 * or promise-style query functions. Subclasses supply the driver:
 *
 *   async connect(config)              open the connection/pool (optional)
 *   async disconnect()                 close it (optional)
 *   async execute(sql, params, def)    run one statement, resolve its result (usually an array of row objects)
 *
 * and may set `static paramStyle`:
 *
 *   'question' (default)  `@name` -> `?`, params passed as an array
 *   'dollar'              `@name` -> `$1`, `$2`..., params passed as an array
 *   'native'              SQL untouched, params passed as the caller's object
 *
 * or override `placeholder(name, position, queryDef)` for finer control.
 *
 * `connect()` is started from the constructor, after the subclass
 * constructor has run. Failures are logged and kept in `this.error`
 * instead of becoming unhandled rejections; queries issued while
 * connecting wait for it, and fail with the connect error if it failed.
 */
module.exports = class DatabaseService extends Service {
    static paramStyle = 'question';

    #connecting;
    #cache;

    constructor(app, config) {
        super(app, config);

        this.running = false;
        this.error = null;

        this.#connecting = Promise.resolve().then(() => this.connect(this.Config));
        // handled here so a failed connect never crashes the process;
        // callers awaiting `ready` or running a query still see the error
        this.#connecting.catch(e => {
            this.error = e;
            this.logError('failed to connect', e);
        });
    }

    /** Resolves once connected; rejects if connecting failed. */
    get ready() { return this.#connecting; }

    /* ---- driver hooks ---- */

    async connect(config) {}
    async disconnect() {}
    async execute(sql, params, queryDef) {
        throw new Error(`${this.constructor.name} does not implement execute()`);
    }

    // How a raw execute() result is presented to callers. By default it is
    // the result itself; override for drivers with a different public shape
    // (results are cached raw, before these are applied).
    toCallbackArgs(result, queryDef) { return [result]; }   // callback(err, ...args)
    toPromiseResult(result, queryDef) { return result; }

    // replacement text for one `@name` in SQL; position is 1-based
    placeholder(name, position, queryDef) {
        return this.constructor.paramStyle === 'dollar' ? `$${position}` : '?';
    }

    /* ---- lifecycle ---- */

    start() { this.running = true; }
    stop() { this.running = false; }

    /** Stop, and release the connection(s). */
    async exit() {
        this.stop();
        try { await this.#connecting; } catch(e) { return; } // never connected
        await this.disconnect();
    }

    /* ---- logging ---- */

    logError(message, err) {
        console.log(`[${this.constructor.name}] ${message}:`, (err && err.message) || err);
    }

    // errors are Error objects, so log message rather than JSON.stringify (which gives "{}")
    handleError(err, job) {
        this.logError(`query "${job && job.queryDef && job.queryDef.id}" failed`, err);
    }

    /* ---- queries ---- */

    register(plug, data) {
        let q;

        if(typeof data === 'string')
            q = JSON.parse( fs.readFileSync(path.join(plug.homeDir, data)) );
        else q = data;

        plug.Queries = this.loadQueries(q, plug.homeDir);
    }

    /**
     * Turn a list of query definitions into a hash of query functions by id.
     *
     * A definition is { id, sql, params?, usePromise?, cache?: {expiry}, callback? }.
     * If sql starts with ':' the rest is a file path relative to baseDir.
     * Callback-style functions are (args, callback(err, rows)); promise-style
     * ones (usePromise) are (args) => Promise<rows>.
     */
    loadQueries(queryList, baseDir) {
        const queries = {};

        // default basedir is the one above node_modules
        if(!baseDir) baseDir = path.join(__dirname, '..', '..');

        for(const def of queryList) {
            // assign unique ID for caching
            def.uuid = crypto.randomUUID();

            if(def.sql.startsWith(':'))
                def.sql = fs.readFileSync(path.join(baseDir, def.sql.substring(1)), 'utf8');

            if(!def.params) def.params = [];

            if(this.constructor.paramStyle !== 'native')
                ({ sql: def.sql, argmap: def.argmap } = mapNamedParams(def.sql, (n, i) => this.placeholder(n, i, def)));

            queries[def.id] = def.usePromise ? this.#promiseQuery(def) : this.#callbackQuery(def);
        }

        return queries;
    }

    #resultCache() {
        if(!this.#cache) {
            const dir = path.join(process.cwd(), 'cache');
            fs.mkdirSync(dir, { recursive: true });
            this.#cache = new DiskCache(16, 60 * 60 * 1000, dir);
        }
        return this.#cache;
    }

    #createJob(queryDef, params, callback) {
        const job = {
            queryDef,
            params: params || {},
            callback: callback || queryDef.callback
        };

        if(queryDef.cache) job.cacheKey = getCacheKey(queryDef.uuid, params);

        return job;
    }

    // a broken cache must not break queries
    async #cached(job) {
        if(!job.cacheKey) return null;
        try { return await this.#resultCache().get(job.cacheKey); }
        catch(e) { return null; }
    }

    #store(job, rows) {
        if(!job.cacheKey) return;
        try { this.#resultCache().set(job.cacheKey, rows, job.queryDef.cache.expiry); }
        catch(e) { this.logError('unable to cache result', e); }
    }

    // runs the job; resolves rows or rejects. Never throws synchronously.
    async #run(job) {
        await this.#connecting;
        const def = job.queryDef;
        const args = this.constructor.paramStyle === 'native'
            ? job.params
            : def.argmap.map(x => job.params[x]);
        return this.execute(def.sql, args, def);
    }

    #callbackQuery(queryDef) {
        return async (obj, optcallback) => {
            const job = this.#createJob(queryDef, obj, optcallback);
            const callback = job.callback || LAMBDA;

            const hit = await this.#cached(job);
            if(hit != null) return callback(null, ...this.toCallbackArgs(hit, queryDef));

            this.#run(job).then(result => {
                this.#store(job, result);
                callback(null, ...this.toCallbackArgs(result, queryDef));
            }, err => {
                this.handleError(err, job);
                callback(err, null);
            }).catch(e => this.logError(`callback for "${queryDef.id}" threw`, e));
        };
    }

    #promiseQuery(queryDef) {
        return async obj => {
            const job = this.#createJob(queryDef, obj);

            const hit = await this.#cached(job);
            if(hit != null) return this.toPromiseResult(hit, queryDef);

            try {
                const result = await this.#run(job);
                this.#store(job, result);
                return this.toPromiseResult(result, queryDef);
            } catch(err) {
                this.handleError(err, job);
                throw err;
            }
        };
    }
};
