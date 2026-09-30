const EventEmitter = require("events");

/**
    Simple cache handler that uses a queue-like mechanism to keep most
    recently referenced items in the cache and dereferences items once
    they "age" out of the queue.
*/
exports.Cache = class Cache extends EventEmitter {
    /**
        Create cache of given size. The size is immutable. 
        @param {number} size 
    */
    constructor(size) {
        super();

        // A Map iterates in insertion order, so it doubles as the recency
        // queue: the first key is the least recently used. Touching a key
        // means deleting and re-inserting it, which is O(1).
        this.Entries = new Map();

        Object.defineProperty(this, 'CACHE_SIZE', {
            writable: false,
            configurable: false,
            value: size
        });
    }

    // Next id to evict. Starting a fresh iterator on every eviction is slow:
    // a Map keeps deleted slots until it is rebuilt, and touching entries
    // (delete + re-insert) leaves many of them at the front for a new iterator
    // to skip over. One iterator kept between evictions only skips each slot
    // once. That is valid because inserts always go to the end, so nothing is
    // ever added behind the iterator; it only needs replacing once exhausted.
    #evictor = null;

    #oldest() {
        for(let attempt = 0; attempt < 2; attempt++) {
            if(this.#evictor === null) this.#evictor = this.Entries.keys();
            const next = this.#evictor.next();
            if(!next.done) return next.value;
            this.#evictor = null;
        }
    }

    /**
        Retrieve an item from cache.
        @param {string} id - The id of the stored item.
        @return {any} Cached item or null if not found.
    */
    get(id) {
        if(!this.Entries.has(id)) return null;

        const entry = this.Entries.get(id);
        this.Entries.delete(id);
        this.Entries.set(id, entry);
        return entry;
    }

    /**
        Add an item to cache.
        @param {string} id - The id of the item to be stored.
        @param {any} entry - The item to be cached.
        @return {any} The entry is returned so this call may be chained.
    */
    set(id, entry) {
        // 260807-DB : Fix for duplicate cache keys
        // delete first so an existing key moves to the most recent position
        this.Entries.delete(id);
        this.Entries.set(id, entry);

        while(this.Entries.size > this.CACHE_SIZE) {
            const oldId = this.#oldest();
            this.emit('deref', oldId, this.Entries.get(oldId));
            this.Entries.delete(oldId);
        }
        return entry;
    }

    /**
        Flush an item from cache.
        @param {string} id - The id of the item to remove.
        @return {any} The item removed from cache or null if not present.
    */
    flush(id) {
        if(!this.Entries.has(id)) return null;

        const item = this.Entries.get(id);
        this.Entries.delete(id);
        return item;
    }

    /** Ids in the cache, least recently used first. */
    get Index() {
        return [...this.Entries.keys()];
    }
}
