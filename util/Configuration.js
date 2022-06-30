const fs = require("fs");

module.exports = class Configuration {
    constructor(owner, cfgPath, defaults = {}) {
        this.owner = owner;
        this.path = cfgPath;

        let needCfg = true;
        try {
            fs.accessSync(cfgPath, fs.F_OK | fs.R_OK | fs.W_OK);
            needCfg = false;
        } catch(e){}

        if(!needCfg) try {
            let importedCfg = JSON.parse(fs.readFileSync(cfgPath));
            owner.emit("configLoad", importedCfg);
            Object.assign(defaults, importedCfg);
        } catch(e) { needCfg = true; }

        if(needCfg) {
            if(owner.resetConfig && typeof owner.resetConfig === "function")
                Object.assign(defaults, owner.resetConfig());
            else owner.emit("resetConfig", defaults);
        }
        
        this.cfg = defaults;
        if(needCfg) this.save();
    }

    save() {
        fs.writeFileSync(this.path, JSON.stringify(this.cfg), "utf8");
    }

    setConfigData(section, data) {
        if(section.startsWith("_"))
            throw new Error("Config access violation.");
        
        if(!this.cfg.hasOwnProperty(section) || typeof this.cfg[section] === "object")
            this.cfg[section] = data;
        else throw new Error("Invalid config section.");
    
        this.save();
    }

    getConfigData(section) {
        if(section.startsWith("_"))
            throw new Error("Config access violation.");
        
        if(this.cfg.hasOwnProperty(section)) return this.cfg[section];
        else return null;
    }
};