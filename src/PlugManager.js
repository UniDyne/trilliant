const fs = require("fs"),
    path = require("path");

const { Output } = require("unidyne-utils");


module.exports = class PlugManager {
    constructor(app) {
        this.App = app;
        this.Plugs = [];

        if(!this.App.Config.cfg.hasOwnProperty("_plugs"))
            this.App.Config.cfg._plugs = {};

        this._plugs = this.App.Config.cfg._plugs;
        this.plugMap = {};
        this.plugPath = path.join(this.App.Env.appPath, "plugs");
    }

    load() {
        const files = fs.readdirSync(this.plugPath);

        for(let i = 0; i < files.length; i++) {
            const st = fs.statSync(path.join(this.plugPath, files[i]));
            if(!st.isDirectory()) continue;

            try {
                const plugPkg = JSON.parse(fs.readFileSync(path.join(this.plugPath, files[i], "package.json"), "utf8"));

                if(plugPkg.plugdef === undefined) {
                    Output.warn(`Invalid plugin: ${files[i]}`);
                    continue;
                }

                // set to default config
                if(plugPkg.plugdef.config !== undefined && this.App.Config.getConfigData(files[i]) == null) {
                    this.App.Config.setConfigData(files[i], plugPkg.plugdef.config);
                }

                // set plug config schema if defined...
                // #! add this later


                // add entry to config
                if(!this._plugs.hasOwnProperty(files[i])) {
                    this._plugs[files[i]] = {
                        enabled: plugPkg.plugdef.enabled,
                        name: plugPkg.name,
                        version: plugPkg.version,
                        auth: plugPkg.plugdef.auth || 0 // default is public
                    };
                } else if(this._plugs[files[i]].version != plugPkg.version) {
                    this._plugs[files[i]].version = plugPkg.version;
                    this._plugs[files[i]].updated = true; // ?? consume this...
                }
            } catch(e) {
                Output.error(`Could not load plugin: ${files[i]}`, e);
            }

            this.App.Config.save();
        }

    }

    init() {
        let j = 0;
        for(let i in this._plugs) {
            if(!this._plugs[i].enabled) continue;
            try {
                const plg = require(path.join(this.plugPath, i));
                this.Plugs.push({ id: i, instance: new plg() });
                this.plugMap[i] = j++;
            } catch(e) {
                this._plugs[i].enabled = false;
                Output.error(`Plugin ${i} could not be loaded and has been disabled.`, e);
            }
        }

        Output.debug('PlugMap', this.plugMap);
    }

    start() {
        for(let i = 0; i < this.Plugs.length; i++) this.Plugs[i].instance.start({
            App: this.App,
            Config: this.App.Config.getConfigData(this.Plugs[i].id),
            console: console // in case console has been changed by context
        });
    }

    stop() {
        for(let i = 0; i < this.Plugs.length; i++)
            this.Plugs[i].instance.stop();
    }

    getAuthPlugs(authFlags) {
        return this.Plugs.reduce((result, current) => {
            if((this._plugs[current.id].auth & authFlags) == this._plugs[current.id].auth)
                result.push(current.id);
            
            return result;
        }, []);
    }

    getPlug(plugID) {
        return this.Plugs[this.plugMap[plugID]].instance;
        //let x = this.Plugs.findIndex(p => p.id == plugID);
        //return x < 0 ? null : this.Plugs[x];
    }
};
