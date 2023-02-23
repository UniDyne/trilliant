const { Cache } = require("./Cache");

// expiration cache works similar to cache
// still has a max size
// but entries also have expiration

exports.ExpirationCache = class ExpirationCache extends Cache {
    constructor(size, expiry) {
        super(size);
        this.defaultExpiry = expiry;
    }

    get(id) {
        let x = super.get(id);
        if(x == null) return null;
        if(x.expires < Date.now()) {
            this.flush(id);
            return null;
        }
        return x.entry;
    }

    set(id, entry, expiry) {
        if(expiry == null) expiry = this.defaultExpiry;
        super.set(id, new ExpirationCacheEntry(entry, expiry));
        return entry;
    }
};

class ExpirationCacheEntry {
    constructor(entry, expiry) {
        this.entry = entry;
        this.expires = Date.now() + expiry;
    }
};
