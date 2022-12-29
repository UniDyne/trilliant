const EventEmitter = require('events'),
    fs = require('fs'),
    path = require('path');

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
    if(!args.pages) args.pages = descriptor.pages || {};
    if(!args.pages.count) args.pages.count = 20;
    if(!args.pages.num) args.pages.num = 1;
    return args;
}

function filterArgs(descriptor, args) { return descriptor.argFilters.reduce((pv, cv) => cv(descriptor, pv), args); }


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

            // wrapping event allows subclass
            // to do preprocessing and other admin prior to execution
            // wrapping only happens ONCE
            descriptor.fn = this.wrapEvent(descriptor, descriptor.fn);

            // double wrapping here ensures that args are filtered
            // before event is called
            this.on(descriptor.id, ( function (args, callback) {
                return descriptor.fn.apply(this, [filterArgs(descriptor,args), callback]);
            } ).bind(this) );
        }
    }
    
    // return a bound function for the event
    // override this to perform additional setups
    wrapEvent(descriptor, fn) {
        return (function(args, callback) {
            return fn.apply(this, (args, callback));
        }).bind(this);
    }

    // override this for additional filters
    // call super.getArgFilters() to get the defaults
    getArgFilters(descriptor) {
        let argFilters = [reservedArgFilter];
        if(descriptor.paginate) argFilters.push(paginationArgFilter);
        return argFilters;
    }

    getPlugData() { return PlugDataMap.get(this); }
}
