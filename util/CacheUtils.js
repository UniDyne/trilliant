


// utility method to consistetly produce the same JSON structures
// used for generating cache keys
function getCanonicalJSON(obj) {
    if(typeof obj === 'object') {
        var keys = [];
        for(var k in obj) keys.push(k);
        keys.sort();

        return '{' + keys.reduce(function(prev, cur, i) {
            return prev + (i>0?',':'') + '"' + cur + '":' + getCanonicalJSON(obj[cur]);
        }, '') + '}';
    } else if(typeof obj === 'function') {
        return null;
    } else return JSON.stringify(obj);
}

// use to generate a cache key for a given combination of call arguments
function getCacheKey(channel, event, args) {
    let hash = crypto.createHash('sha256');
    let cargs = getCanonicalJSON(args);
    console.log(cargs);
    hash.update( [channel, event, cargs].join('::') );
    return hash.digest('hex');
}


module.exports = {
    getCanonicalJSON,
    getCacheKey
};
