const fs = require("fs"),
    path = require("path"),
    EventEmitter = require("events");

const Configuration = require("./util/Configuration");
const PlugManager = require("./PlugManager");

const { Output } = require("unidyne-utils");

function initEnv() {
    const appPath = path.dirname(require.main.filename);
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

        Output.activateDebugHook();

        this.Env = initEnv();
        this.Config = new Configuration(this, this.Env.cfgPath, defaults);

        this.Services = {};

        this.loadServices(svcList);
        this.loadPlugs();
    }

    loadServices(svcList) {
        Object.keys(svcList).forEach(key => {
            // if service is of type string, then require
            // otherwise, assume it is a type
            const sw = (typeof svcList[key].service === "string") ? require(path.join(this.Env.appPath, svcList[key].service)) : svcList[key].service;
            //const sw = require(path.join(this.Env.appPath, svcList[key].service));
            this.Services[key] = new sw(this, svcList[key].config);
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
