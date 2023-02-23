const path = require('path'),
    fs = require('fs'),
    fsPromises = require('fs/promises');

const { ExpirationCache } = require("./ExpirationCache");

// a special expiration cache that is backed by disk

exports.DiskCache = class DiskCache extends ExpirationCache {
    constructor(size, expiry, pathname) {
        super(size, expiry);
        this.pathname = pathname;

        this.addListener('deref', (id, entry) => {
            this.save(id, entry);
        });
    }

    save(id, entry) {
        if(entry.expiry <= Date.now()) return;
        fs.writeFileSync( path.join(this.pathname, id + '.cache'), JSON.stringify(entry), "utf8" );
    }

    delete(id) {
        fs.rm(path.join(this.pathname, id + '.cache'), e=>{});
        return null;
    }

    async get(id) {
        let x = super.get(x);
        if( x == null ) {
            // check to see if one is cached on disk
            let stat = await fsPromises.stat(path.join(this.pathname, id + '.cache'));
            if(stat == null) return null;
            if(stat.mtime <= Date.now() - this.defaultExpiry)
                return this.delete(id);

            try {
                x = JSON.parse(await fsPromises.readFile(path.join(this.pathname, id + '.cache')));
                if(x.expires <= Date.now())
                    return this.delete(id);
                
                // add it back to memory cache??
                return x.entry;
            } catch(e) {
                return this.delete(id);
            }
        }
    }
};
