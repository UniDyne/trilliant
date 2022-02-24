/*================================================================
	NINJA Requests
    NINJA = Ninja Is Not Janky Ajax
    NINJA = Ninja Is Node JSON API
    
    This module adds "channels" to the web server that are
    essentially web-addressable function calls.

    Uses events to establish notion of message passing. This
    allows queuing and asynchronicity.
================================================================*/
const EventEmitter = require("events");

function registerChannel(channel) { this.channels[channel.id] = channel; }

function ninjaHandler(request, response, uri) {
    // CORS Handler
    var cors = this.getNinja().getConfig('cors');
    if(cors && cors.length > 0 && request.headers['origin']) {
        if(cors.indexOf(request.headers['origin'].replace(/^https?:\/\//,'')) >= 0) {
            response.setHeader('Access-Control-Allow-Origin', request.headers['origin']);
            response.setHeader('Access-Control-Allow-Methods', "POST, OPTIONS");
            response.setHeader('Access-Control-Allow-Headers', "Content-Type");
        }
    }

    if(request.method == "OPTIONS")
        return response.sendResponseCode(204);

    if(request.method != "POST")
        return response.sendResponseCode(500);
    
    try {
        // parse the post body as json
        var body = "";
        request.on('data', (chunk) => body += chunk);
        request.on('end', () => {
            
            var edata = JSON.parse(body), event = this.getNinja().getConfig('regex').exec(uri.pathname)[1].split('/');
            
            if(event.length > 2)
                return response.sendResponseCode(500, "Invalid request.");
            
            // no such channel
            if(!this.channels[event[0]])
                    return response.sendResponseCode(500, "Invalid request. (47)");
            
            // if channel only, use doc handler, if allowed
            if(event.length == 1) {
                if(this.getNinja().getConfig('docs'))
                    return docHandler(response, this.channels[event[0]]);
                else return response.sendResponseCode(500, "Invalid request. (52)");
            }

            if(this.channels[event[0]].listenerCount(event[1]) == 0)
                return response.sendResponseCode(500, "Invalid request. (58)");
           
            // NOTE: Ninja methods execute OUTSIDE of the web context. This is by design.
            // The request and response scopes are not accessible from within a Ninja method.
            return this.channels[event[0]].emit(event[1], edata, rdata => this.jsonHandler(request, response, rdata));
        });
    } catch(e) { return response.sendResponseCode(500, e); }
}

function docHandler(response, channel) {
    response.writeHead(200, {"Content-Type": "text"});

    // iterate available methods and doc attributes
    //#!

    response.end();
}

/* Required "WebExtension" export for server plugin */
module.exports.WebExtension = class {
    constructor(webserver, config) {

        if(!config.regex)
            config.regex = new RegExp("^/ninja/(.*)$");

        if(typeof config.regex === 'string')
            config.regex = new RegExp(config.regex);
        

        webserver.registerRoute(config.regex, ninjaHandler.bind(webserver));
        webserver.channels = {};
        webserver.registerChannel = registerChannel.bind(webserver);
        webserver.getNinja = () => this;

        // keep config from getting modified arbitrarily
        this.getConfig = (key) => config[key];
    }
};

/* Channel */
module.exports.Channel = class extends EventEmitter {
    constructor(id, events) {
        this.id = id;
        var k = Object.keys(events);
        for(var i = 0, L = k.length; i < L; i++) {
            if(typeof events[k[i]] == "function")
                this.on(k[i], events[k[i]].bind(this));
            else
                this.on(k[i], this[events[k[i]]]);
        }
    }
};