const http = require("http"),
    https = require("https"),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    cluster = require("cluster");

const EventEmitter = require("events");

const CONFIG_DEFAULTS = require('./DefaultConfig');
const MIME_TYPES = require('./MimeTypes');
const { RedirectProxy } = require("./RedirectProxy");

/***
    HTTP Helper Methods
***/

// convenience method
function loadConfigFile(filename) { return JSON.parse(fs.readFileSync(filename)); }


function requestHandler(request, response) {
    var uri = url.parse(request.url, true);
    var pathname = decodeURI(uri.pathname);
    var query = uri.query;
    
    response.setRequest(request);
    request.setResponse(response);
    
    this.emit('requestStart', request, response, pathname);
    
    response.on('finish', () => this.emit('requestEnd', request, response));

    // only implementing GET and POST
    //#! add HEAD
    if(request.method != "GET" && request.method != "POST")
        return response.sendResponseCode(405);    
    
    // check for route handler
    for(var i = 0; i < this.routes.length; i++) {
        if(this.routes[i].rx.test(pathname))
            return this.routes[i].handler(request, response, {pathname: pathname, query: query}, this);
    }

    // normalize to prevent directory traversal
    pathname = path.normalize(pathname);
    //console.log(`[Path]: ${pathname}`);
    // check for virtual path
    var vp = pathname.split(path.sep)[1];
    if(this.virtualPaths[vp])
        filename = path.join( this.virtualPaths[vp], pathname.replace(path.sep+vp,'') );
    else filename = path.join( this.webroot, pathname );

    return this.staticHandler(request, response, filename);
}

/* @deprecated */
function staticHandler(request, response, filename) { response.sendFile(filename); }

/* @deprecated */
function jsonHandler(request, response, data) { response.sendJSON(data); }


function loadConfiguration(conf) {
    var dir = __dirname;

    if(typeof conf === 'string') {
        dir = path.dirname(conf);
        conf = loadConfigFile(conf);
    }

    if(conf.hasOwnProperty('rootpath'))
        conf.rootpath = path.join(dir, conf.rootpath);
    else conf.rootpath = dir;
    
    if(conf.hasOwnProperty('virtual_paths')) {
        for(var i = 0; i < conf['virtual_paths'].length; i++) {
            if(!conf['virtual_paths'][i].absolute) conf['virtual_paths'][i].actual = path.join(process.cwd(), conf['virtual_paths'][i].actual);
            this.registerPath(conf['virtual_paths'][i].virtual, conf['virtual_paths'][i].actual);
        }
    }

    if(conf.hasOwnProperty('mimetypes') && typeof conf.mimetypes === 'string') try {
        // merge mime type confiuration
        Object.assign(MIME_TYPES, loadConfigFile(path.join(dir, conf.mimetypes)));
        
    } catch(e) { console.error(e); }

    // read SSL cert data
    if(conf.hasOwnProperty('ssl') && conf.secure) try {
        conf.ssl.key = fs.readFileSync(path.join(dir, conf.ssl.key));
        conf.ssl.cert = fs.readFileSync(path.join(dir, conf.ssl.cert));
    } catch(e) { console.error('Failed to load SSL certificates.'); console.error(e); }

    // read JWT data
    if(conf.hasOwnProperty('jwt')) {
        const JWT = require('./RFC7519');
        JWT.setKeyPair(
            fs.readFileSync(path.join(dir, conf.jwt.publicKey)),
            fs.readFileSync(path.join(dir, conf.jwt.privateKey))
        );
    }

    // merge configuration
    Object.assign(this.Config, conf);
}

function loadExtensions(extlist) {
    for(var i = 0; i < extlist.length; i++) try {
        if(typeof extlist[i] == "string")
            getExtInstance(this, extlist[i], {});
        else {/* It's an extension / config pair */
            if((extlist[i].enabled !== undefined && extlist[i].enabled === false) || (extlist[i].disabled !== undefined && extlist[i].disabled === true)) continue;
            getExtInstance(this, extlist[i].extension, extlist[i].config);
        }
    } catch(e) {
        console.log(`Error loading extension ${i}.`);
        console.error(e);
    }
}

function getExtInstance(self, extPath, config) {
    // if starts with #, use internal extension
    if(extPath.substr(0,1) == "#") extPath = `./extensions/${extPath.substr(1)}`;
    
    const {WebExtension} = require(extPath);
    return new WebExtension(self, config);
}

module.exports.WebServer = class extends EventEmitter {

    constructor(conf) {
        super();

        this.routes = [];
        this.virtualPaths = {};

        this.Config = CONFIG_DEFAULTS;

        loadConfiguration.apply(this, [conf]);

        this.setRoot(this.Config.rootpath);
        //this.addr = this.Config.address || Utils.getAddress();
        this.setPort(this.Config.port);

        
        this.requestHandler = requestHandler.bind(this);
        this.staticHandler = staticHandler.bind(this);
        this.jsonHandler = jsonHandler; // unbound
        
        if(this.Config.extensions && this.Config.extensions.length > 0)
            loadExtensions.apply(this, [this.Config.extensions]);
    }

    setPort(port) {
        if(!port) port = 10000 + Math.floor(Math.random()*10000);
        this.port = port;

        if(this.server) {
            this.stop();
            this.start();
        }

        return this.port;
    }

    setRoot(rootpath) { this.webroot = rootpath; }

    registerPath(virtpath, actualpath) { this.virtualPaths[virtpath] = actualpath; }

    unregisterPath(virtpath) { delete this.virtualPaths[virtpath]; }

    registerRoute(rx, handler) {
        if(typeof rx === 'string') rx = new RegExp(rx);
        this.routes.push({rx:rx, handler:handler});
    }


/*
    // for workers
    standby() {
        // use subclasses of IncomingMessage and ServerResponse...
        var options = {
            IncomingMessage: require('./WebRequest'),
            ServerResponse: require('./WebResponse')
        };

        if(!this.Config.secure || !this.Config.ssl) this.server = new http.Server(options, this.requestHandler);
        else {
            options.key = this.Config.ssl.key;
            options.cert = this.Config.ssl.cert;
            
            this.server = new https.Server(options, this.requestHandler);
        }
    }

    listen(socket) { this.server.listen(socket); }
*/


    // for main or standalone

    start() {

        // use subclasses of IncomingMessage and ServerResponse...
        var options = {
            IncomingMessage: require('./WebRequest'),
            ServerResponse: require('./WebResponse')
        };

        if(!this.Config.secure || !this.Config.ssl) this.server = new http.Server(options, this.requestHandler);
        else {
            options.key = this.Config.ssl.key;
            options.cert = this.Config.ssl.cert;
            
            this.server = new https.Server(options, this.requestHandler);
            if(this.Config.useRedirect) this.proxy = new RedirectProxy(this.port, this.server);
        }

        if(this.Config.cluster && cluster.isMaster)
            return this.startWorkers();

        if(this.proxy) this.proxy.start();
        else this.server.listen(this.port);
        console.log(`Server listening on port ${this.port}.`);
    }

    startWorkers() {
        let numCores = require('os').cpus().length;
        console.log(`Starting ${numCores - 1} workers.`);

        this.workers = [];

        for(let i = 0; i < numCores - 1; i++) {
            this.workers.push(cluster.fork());

            this.workers[i].on('message', (mesg) => {
                console.log(mesg); //#! add message handling...
            });
        }

        // process is clustered on a core and process id is assigned
        cluster.on('online', function(worker) {
            console.log(`Worker ${worker.process.pid} is listening.`);
        });

        // if any of the worker process dies then start a new one by simply forking another one
        cluster.on('exit', (worker, code, signal) => {
            console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
            console.log('Starting a new worker');
            cluster.fork();
            this.workers.push(cluster.fork());
            // to receive messages from worker process
            this.workers[this.workers.length-1].on('message', (mesg) => {
                console.log(mesg); //#! add message handling...
            });
        });

    }

    stop() {
        if(!this.server) return;
        this.server.close();
        this.server = null;

        console.log(`Server stopped on port ${this.port}.`);
    }
};
