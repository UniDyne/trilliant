const fs = require("fs"),
    path = require("path"),
    EventEmitter = require("events");

const Configuration = require("../util/Configuration");
const PlugManager = require("./PlugManager");
const Logging = require("../util/Logging");

function initEnv() {
    const appPath = process.cwd();//path.dirname(require.main.filename);
    /* load manifest */
    const appName = (function() {
        let name = "app";
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(appPath, "package.json")));
            if(manifest.name !== undefined) name = manifest.name;
        } catch(e) {}
        return name;
    })();
    const cfgPath = path.join(appPath, 'etc', appName+'.cfg');

    return {
        appPath: appPath,
        appName: appName,
        cfgPath: cfgPath
    };
}

module.exports = class Application extends EventEmitter {
    constructor(defaults, svcList) {
        super();

        global.App = this;

        Logging.activateDebugHook();

        this.Env = initEnv();
        this.Config = new Configuration(this, this.Env.cfgPath, defaults);

        this.Services = {};

        this.loadServices(svcList);
        this.loadPlugs();
    }

    loadServices(svcList) {
        Object.keys(svcList).forEach(key => {
            let sw;

            // if service is of type string, then require
            // otherwise, assume it is a type
            try {
                if(typeof svcList[key].service === "string") {
                    if(svcList[key].service.startsWith("./")) {
                        sw = require(path.join(this.Env.appPath, svcList[key].service)); // it's a module in the app
                    } else { // it's an npm package
                        // compliant packages *should* expose a Service class...
                        let pkg = require(svcList[key].service);
                        sw = pkg.TrilliantService ? pkg.TrilliantService : pkg;
                    }
                } else sw = svcList[key].service; // it's a class
            } catch(e) {
                console.log(`Unable to load service "${key}".`);
            }
            // all services must accept App, Config arguments
            try { this.Services[key] = new sw(this, svcList[key].config); }
            catch(e) { console.log(`Unable to instantiate service "${key}".`); }
        });

        Object.values(this.Services).forEach(svc => { if(typeof svc.start === "function") svc.start(); });
    }

    loadPlugs() {
        console.log("Loading plugs");

        this.PlugManager = new PlugManager(this);
        this.PlugManager.load();
        this.PlugManager.init();
        
        this.PlugManager.start();
    }

    isDebug() {
        return this.Config.cfg.debug;
    }
};
