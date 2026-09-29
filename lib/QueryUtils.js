const crypto = require('crypto');

/**
 * Produce a consistent JSON-like string for an object regardless of key order.
 * Used to build cache keys from query arguments.
 */
function getCanonicalJSON(obj) {
    if(obj instanceof Date) {
        return obj.getTime();
    } else if(obj !== null && typeof obj === 'object') {
        const keys = Object.keys(obj).sort();
        return '{' + keys.map(k => `"${k}":${getCanonicalJSON(obj[k])}`).join(',') + '}';
    } else if(typeof obj === 'function') {
        return 'null';
    } else return JSON.stringify(obj);
}

/**
 * Cache key for one execution of one query definition.
 */
function getCacheKey(uuid, obj) {
    return crypto.createHash('sha256')
        .update([uuid, getCanonicalJSON(obj)].join('::'))
        .digest('hex');
}

const RX_PARAM = /@([a-z0-9_]+)/gi;

/**
 * Rewrite `@name` placeholders using the given function.
 *
 * @param {string} sql
 * @param {(name:string, position:number) => string} placeholder Returns the replacement text; position is 1-based.
 * @returns {{sql: string, argmap: string[]}} Rewritten SQL and the parameter names in positional order (duplicates included).
 */
function mapNamedParams(sql, placeholder) {
    const argmap = [];
    sql = sql.replace(RX_PARAM, (w, name) => {
        argmap.push(name);
        return placeholder(name, argmap.length);
    });
    return { sql, argmap };
}

module.exports = { getCanonicalJSON, getCacheKey, mapNamedParams };
