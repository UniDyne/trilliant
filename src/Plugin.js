const EventEmitter = require('events'),
    fs = require('fs'),
    path = require('path');

const TokenHandler = require('./TokenHandler');
const MessageEnvelope = require('./MessageEnvelope');

const TOKEN = Symbol.for("TOKEN");
const USER = Symbol.for("USER");
const NEW_TOKEN = Symbol();

// tokens are renewed if within 20 min of end
const RENEWAL_WINDOW = 20 * 60;

let PlugDataMap = new WeakMap();

function getSubclassDir() {
    // override prepareStackTrace
    // error.stack will be <CallSite>[] rather than <string>
    const original = Error.prepareStackTrace;
    Error.prepareStackTrace = function(err, stack) { return stack; };
    
    var err = new Error();
    
    var current = err.stack.shift().getFileName(), callingModule = current;
    while(err.stack.length > 0 && callingModule == current)
        callingModule = err.stack.shift().getFileName();
    
    // put original function back
    Error.prepareStackTrace = original;
    
    return path.dirname(callingModule);
}

function attachServices(app, plug, servspec) {
    if(!servspec) return; // no services

    Object.keys(servspec).forEach(key => {
        var h = app.Services[key];
        if(!h) return console.log(`No handler for service '${key}'.`);
        h.register(plug, servspec[key]);
    });
}

// removes reserved arguments
function reservedArgFilter(descriptor, args) {
    Object.keys(args).filter( k => (/^_/).test(k) ).forEach( k => delete args[k] );
    return args;
}

// defaults the pagination parameters
function paginationArgFilter(descriptor, args) {
    args.pages = Object.assign({}, descriptor.pages, args.pages ?? {num: 1});
    
    if(!args.pages.count || args.pages.count <= 0) args.pages.count = 20;
    if(!args.pages.num || args.pages.num <= 0) args.pages.num = 1;
    return args;
}

function paginationResultFilter(descriptor, args) {
    // expecting first arg to be list of records
    // second arg should be pagination object

    if(args.length > 1 && typeof args[1] == 'object' && typeof args[0] == 'array') {
        // copy total to pagination object
        args[1].total = args[0].length > 0 ? args[0].page_total : 0;
        
        // remove pagination metadata from result array
        args[0].forEach(v => {
            delete v.page_total;
            delete v.page_row;
        });
    }

    return args;
}

function filterArgs(descriptor, args) { return descriptor.argFilters.reduce((pv, cv) => cv(descriptor, pv), args); }

function filterResult(descriptor, args) { return descriptor.resultFilters.reduce((pv, cv) => cv(descriptor, pv), args); }


module.exports = class Plugin extends EventEmitter {
    constructor(data) {
        super();
        if(data === undefined) data = {};
        if(data.home === undefined) data.home = getSubclassDir();
        console.log(this.constructor.name);
        PlugDataMap.set(this, data);

        this.homeDir = data.home;
    }


    start(args) {
        const data = PlugDataMap.get(this);
        this.App = args.App;
        attachServices(args.App, this, data.services);

        // config...

        
        if(data.events) this.initEvents(data);
    }

    initEvents(data) {
        var k = Object.keys(data.events);
        for(let i = 0, L = k.length; i < L; i++) {

            let descriptor = { id: k[i], fn: ()=>null };
            let spec = data.events[k[i]];

            // object may contain metadata used by subclass
            switch(typeof spec) {
                case "object":
                    Object.assign(descriptor, spec);
                    break;
                case "function":
                    descriptor.fn = spec;
                    break;
                case "string":
                    if(typeof this[spec] == "function")
                        descriptor.fn = this[spec];
                    break;
            }

            // arg filters are only set ONCE
            descriptor.argFilters = this.getArgFilters(descriptor);
            descriptor.resultFilters = this.getResultFilters(descriptor);

            // wrapping event allows subclass
            // to do preprocessing and other admin prior to execution
            // wrapping only happens ONCE
            // descriptor.fn = this.wrapEvent(descriptor, descriptor.fn);
            let wrappedFn = this.wrapEvent(descriptor, descriptor.fn);

            // double wrapping here ensures that args are filtered
            // before event is called
            this.on(descriptor.id, ( function (args, callback) {
                return wrappedFn.apply(this, [filterArgs(descriptor,args), (...result) => {
                    result = filterResult(descriptor, result);
                    return callback.apply(this, result);
                }]);
            } ).bind(this) );
        }
    }
    
    // return a bound function for the event
    // override this to perform additional setups
    wrapEvent(descriptor, fn) {
        return (async function(args, callback) {

            // for backward compat
            if(args.jwt) {
                args[TOKEN] = args.jwt;
                delete args.jwt;
            }

            if(args[TOKEN]) {
                if(!TokenHandler.validate_token(args[TOKEN]))
                    return callback(MessageEnvelope.getErrorEnvelope(MessageEnvelope.MESG_NOLOGIN, "Invalid token."));
                args[USER] = TokenHandler.read_token(args[TOKEN]);

                const ts = ((new Date()).getTime() / 1000) >> 0; // seconds as integer
                if(args[USER].exp - ts < RENEWAL_WINDOW) {
                    args[TOKEN] = TokenHandler.renew_token(args[USER]);
                    args[NEW_TOKEN] = true;
                }
            }

            if(descriptor.access) {
                if(!args[USER]) return callback(MessageEnvelope.getErrorEnvelope(MESG_NOLOGIN));

                if((args[USER].rights & descriptor.access) != descriptor.access)
                    return callback(MessageEnvelope.getErrorEnvelope(MESG_NOTAUTH));
            }
            
            try {
                return await callbackProxy(this, descriptor, args, callback);
            } catch(e) {
                console.log(e);
                return callback(MessageEnvelope.getErrorEnvelope(null, "An error occurred while processing the request."));
            }
            
        }).bind(this);
    }

    /*
        Proxy a function callback. This allows the returned data to be
        coerced into a MessageEnvelope to provide a consistent protocol.
        This also allows exceptions to be caught properly.
    */
    async callbackProxy(context, descriptor, args, callback) {
        await descriptor.fn.call(context, args, (...x) => {
            let result = x[0];
            if(result == null) result = {};

            let env;
            // coerce to envelope
            if(!result[MessageEnvelope.ENVELOPE]) {
                // read common fields from result
                let msgid = result['msgid'],
                    msg = result['msg']??result['mesg'],
                    data = result['data']??result['result'],
                    success = result['success'],
                    pages = result['pages'];
                
                // if result was not encapsulated
                if(data == undefined && msg == undefined) data = result;

                // if result had a success flag that was false, use error envelope
                if(success != undefined && !success) env = MessageEnvelope.getErrorEnvelope(msgid, msg);

                // Otherwise pack into normal envelope
                else env = MessageEnvelope.getDataEnvelope(data, msgid, msg);

                // second arg is pagination in older calls 
                if(pages == undefined && x[1]) pages = x[1];

                // set paginator
                if(pages != undefined || descriptor.paginate)
                    MessageEnvelope.setPagination(env, pages);
            } else env = result; // already an envelope

            if(args[NEW_TOKEN]) MessageEnvelope.setToken(env, args[TOKEN]);

            return callback(env);
        });
    }


    // override this for additional filters
    // call super.getArgFilters() to get the defaults
    getArgFilters(descriptor) {
        let argFilters = [reservedArgFilter];
        if(descriptor.paginate) {
            descriptor.pages ??= { count: 20 };
            argFilters.push(paginationArgFilter);
        }
        return argFilters;
    }

    getResultFilters(descriptor) {
        let resultFilters = [];
        if(descriptor.paginate) resultFilters.push(paginationResultFilter);
        return resultFilters;
    }

    getPlugData() { return PlugDataMap.get(this); }
}
