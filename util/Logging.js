const fs = require("fs"),
    path = require("path"),
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


// need to create a log file
// timestamp / module / level / message / data
// THIS IS NOT SAFE FOR CLUSTER OR FORK
// add functionality to use a PID?
// hook process exit to close the file?
function logToFile(level, message, data) {
    const logData = [
        new Date().toISOString(),
        getCallingModule(),
        level,
        message,
        JSON.stringify(data, replaceErrors)
    ];

    try { fs.mkdirSync(path.join(process.cwd(), 'log')); } catch(e) {}

    const logFile = path.join(process.cwd(), 'log', `${path.basename(process.argv[1], '.js')}_${mkDateCode(false)}.log`);

    // append
    const out = fs.createWriteStream(logFile, {flags:'a+'});
    out.write(`${logData.join('\t')}\n`);
    out.close();
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
        if(err.hasOwnProperty('message'))
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
        
    activateDebugHook: activateDebugHook,
    dumpActiveHandles: dumpActiveHandles,
    dumpActiveRequests: dumpActiveRequests
};
