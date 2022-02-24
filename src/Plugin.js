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

        
        initEvents(data);
    }

    initEvents(data) {
        // register internal events
        if(data.events) {
            var k = Object.keys(data.events);
			for(var i = 0, L = k.length; i < L; i++) {
				if(typeof data.events[k[i]] == "function")
					this.on(k[i], data.events[k[i]].bind(this));
				else
					this.on(k[i], this[data.events[k[i]]]);
			}
        }
    }

    getPlugData() { return PlugDataMap.get(this); }
}
