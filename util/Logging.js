const fs = require("fs"),
    path = require("path"),
    cluster = require("cluster"),
    process = require("process");



// Adapted from:
// https://stackoverflow.com/questions/16697791/nodejs-get-filename-of-caller-function/29581862
function getCallingModule() {
    // save original
    const original = Error.prepareStackTrace;
    Error.prepareStackTrace = function(err,stack) { return stack; }

    var err = new Error(), current = err.stack.shift().getFileName(), callingModule = current;
    while(err.stack.length > 0 && callingModule == current)
        callingModule = err.stack.shift().getFileName();
    
    // put it back
    Error.prepareStackTrace = original;
    return path.basename(callingModule,'.js');
}


function mkDateCode(wtime) {
    const d = new Date();
    const code = ''+d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2);
    return wtime?code+('0'+d.getHours()).slice(-2)+('0'+d.getMinutes()).slice(-2):code;
}


// Log file: log/<script>_<yyyymmdd>.log under the working directory.
// One append stream is held open and reused, and replaced when the date rolls over.
//
// Processes that are children (cluster workers or forked processes) each
// write to their own file, log/<script>_<yyyymmdd>_<pid>.log, so workers
// never interleave writes to one file.
let current = null; // { stream, code }

function isChildProcess() {
    return cluster.isWorker || typeof process.send === 'function';
}

function openLog(code) {
    const dir = path.join(process.cwd(), 'log');
    fs.mkdirSync(dir, { recursive: true });

    const script = process.argv[1] ? path.basename(process.argv[1], '.js') : 'trilliant';
    const suffix = isChildProcess() ? `_${process.pid}` : '';
    const stream = fs.createWriteStream(path.join(dir, `${script}_${code}${suffix}.log`), { flags: 'a' });

    // a logging failure must never take the process down (or recurse: the
    // debug hook logs uncaught errors); drop the stream and reopen on the next line
    stream.on('error', err => {
        console.error(`Unable to write log: ${err.message}`);
        if(current && current.stream === stream) current = null;
    });

    return { stream, code };
}

function getLogStream() {
    const code = mkDateCode(false);

    if(current && current.code !== code) {
        current.stream.end();
        current = null;
    }
    if(!current) current = openLog(code);

    return current.stream;
}

/**
 * Flush and close the log. Call before process.exit(); lines written
 * but not yet flushed are otherwise lost. The next log call reopens it.
 * @returns {Promise<void>}
 */
function closeLog() {
    return new Promise(resolve => {
        if(!current) return resolve();
        const { stream } = current;
        current = null;
        stream.end(resolve);
    });
}

// timestamp / module / level / message / data
function logToFile(level, message, data) {
    const logData = [
        new Date().toISOString(),
        getCallingModule(),
        level,
        message,
        JSON.stringify(data, replaceErrors)
    ];

    try { getLogStream().write(`${logData.join('\t')}\n`); }
    catch(e) { console.error(`Unable to write log: ${e.message}`); }
}

function replaceErrors(k, v) {
    if(v instanceof Error) {
        var error = {};
        Object.getOwnPropertyNames(v).forEach(key => error[key] = v[key]);
        return error;
    }
    return v;
}


// hook process for uncaught exceptions
function activateDebugHook() {
    process.on('uncaughtException', function(err) {
        if(typeof err == 'string')
            return module.exports.debug(err);
        if(err.hasOwnProperty('message'))
            return module.exports.debug(err.message, err);
        return module.exports.debug('Unknown', err);
    });

    process.on('unhandledRejection', function(reason) {
        if(typeof reason == 'string')
            return module.exports.debug(reason);
        if(typeof reason == 'object' && reason.hasOwnProperty('message'))
            return module.exports.debug(reason.message, reason);
        return module.exports.debug('Unknown', reason);
    });

    process.on('multipleResolves', function(type, promise, reason) {
        return module.exports.debug(`Multiple resolves of type ${type}`, reason);
    });
}

function dumpActiveHandles() {
    return module.exports.debug("Dumping active handles.", process._getActiveHandles());
}

function dumpActiveRequests() {
    return module.exports.debug("Dumping active requests.", process._getActiveRequests());
}


module.exports = {
    status: function(message) {
        console.log(`\x1b[36m${message}\x1b[0m`);
    },

    info: function(message) {
        console.info(`\x09${message}`);
    },

    croak: function(message, data) {
        console.error(`\x1b[1;41;5m${message}\x1b[0m`);
        logToFile('CROAK', message, data);
    },

    error: function(message, data) {
        console.error(`\x1b[31;5m${message}\x1b[0m`);
        logToFile('ERROR', message, data);
    },

    warn: function(message, data) {
        console.error(`\x1b[33m${message}\x1b[0m`);
        logToFile('WARN', message, data);
    },

    debug: function(message, data) {
        console.log(`\x09\x1b[35m${message}\x1b[0m`);
        console.log(data);
        logToFile('DEBUG', message, data);
    },
        
    close: closeLog,

    activateDebugHook: activateDebugHook,
    dumpActiveHandles: dumpActiveHandles,
    dumpActiveRequests: dumpActiveRequests
};
