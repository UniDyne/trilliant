const path = require('path'),
    fs = require('fs');

module.exports = class Service {
    constructor(app, config) {
        this.App = app;

        // if string, is filename for config JSON
        // service configs are relative to app root
        if(typeof config == 'string') try {
            config = JSON.parse(fs.readFileSync(path.join(app.Env.appPath, config), "utf8"));
        } catch(e) {
            console.log(`Unable to load config: ${config}`);
            config = null;
        }

        this.Config = config;

    }

    // start / stop handlers
    start() {}
    stop() {}
    
    // override this to handle plugin registrations
    register(plug, data) {}
};