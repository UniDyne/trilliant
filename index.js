const { Cache } = require('./lib/Cache');
const { ExpirationCache } = require('./lib/ExpirationCache');
const { DiskCache } = require('./lib/DiskCache');
const { JWT } = require('./lib/JWT');


module.exports = {
    Application: require('./src/Application'),
    Plugin: require('./src/Plugin'),
    ServiceWrapper: require('./src/ServiceWrapper'),

    JWT: JWT,

    Cache: Cache,
    ExpirationCache: ExpirationCache,
    DiskCache: DiskCache
};
