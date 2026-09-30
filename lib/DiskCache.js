const path = require('path'),
    fs = require('fs'),
    fsPromises = require('fs/promises');

const { ExpirationCache } = require("./ExpirationCache");

// a special expiration cache that is backed by disk
//
// Entries evicted from the memory cache are written to disk. A disk hit
// goes back into the memory cache with whatever lifetime it has left.
//
// The entry's own `expires` is the only expiry that matters. So that an
// expired file need not be opened to find that out, the file's mtime is
// set to the entry's expiry time when it is saved.

exports.DiskCache = class DiskCache extends ExpirationCache {
    constructor(size, expiry, pathname) {
        super(size, expiry);
        this.pathname = pathname;

        this.addListener('deref', (id, entry) => {
            this.save(id, entry);
        });
    }

    file(id) { return path.join(this.pathname, id + '.cache'); }

    // best effort: a cache that can't write just misses later
    save(id, entry) {
        if(entry.expires <= Date.now()) return;
        try {
            fs.mkdirSync(this.pathname, { recursive: true });
            fs.writeFileSync( this.file(id), JSON.stringify(entry), "utf8" );
            fs.utimesSync(this.file(id), new Date(), new Date(entry.expires));
        } catch(e) {}
    }

    delete(id) {
        fs.rm(this.file(id), e=>{});
        return null;
    }

    async get(id) {
        let x = super.get(id);
        if( x != null ) return x;

        // check to see if one is cached on disk
        let stat = null;
        try {
            stat = await fsPromises.stat(this.file(id));
        } catch(e) {}
        
        if(stat == null) return null;

        // mtime is the expiry time; no need to open a file that has expired
        if(stat.mtimeMs <= Date.now())
            return this.delete(id);

        try {
            x = JSON.parse(await fsPromises.readFile(this.file(id)));
        } catch(e) {
            return this.delete(id);
        }

        // the entry is authoritative
        const remaining = x.expires - Date.now();
        if(!(remaining > 0)) return this.delete(id);

        // put it back in memory for the time it has left
        super.set(id, x.entry, remaining);
        return x.entry;
    }
};
