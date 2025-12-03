const fs = require('fs'), path = require('path'), crypto = require('crypto');

const Plugin = require('./Plugin');
const { JWT } = require('../lib/JWT');

// #! TODO: Enable cache rules for descriptors
//const { getCanonicalJSON, getCacheKey } = require('../util/CacheUtils');

const MessageEnvelope = require('./MessageEnvelope');


/* symbol for passing user from JWT */
/* prevents serialization and injection */
const USER = Symbol.for("user");

const NEWJWT = Symbol();
const JWTARG = Symbol();

// tokens will automatically renew if within the timeout window
const SESSION_TIMEOUT = 20 * 60; // 20 min


module.exports.USER = USER;
module.exports.MessageEnvelope = MessageEnvelope;


// hack to get the directory of a subclass
// this is also used in Plugin, but calling
// that one will yield this class' directory
function getSubclassDir() {
    // temporarily patch prepareStackTrace
    const original = Error.prepareStackTrace;
    Error.prepareStackTrace = function(err, stack) { return stack; }

    let err = new Error();
    let current = err.stack.shift().getFileName(), callingModule = current;
    while(err.stack.length > 0 && callingModule == current)
        callingModule = err.stack.shift().getFileName();

    // put it back as it was
    Error.prepareStackTrace = original;

    return path.dirname(callingModule);
}


/*
    Proxy a function callback. This allows the returned data to be
    coerced into a MessageEnvelope to provide a consistent protocol.
    This also allows exceptions to be caught properly.
*/
async function callbackProxy(context, descriptor, args, callback) {
    await descriptor.fn.call(context, args, (...x) => {
        let result = x[0]; // first arg is result
        if(result == null) result = {};

        // MessageEnvelope has side channels for pagination and JWT
        // If this is not a MessageEnvelope, pack the result into one
        let env;
        if(!result[MessageEnvelope.ENVELOPE]) {
            // read common fields from result
            let msgid = result['msgid'],
                msg = result['msg']??result['mesg'],
                data = result['data']??result['result'],
                success = result['success'],
                pages = result['pages'];
            
            // if result was not encapsulated
            if(data == undefined && msg == undefined) data = result;

            // if result had a success flag that was false, use error envelope
            if(success != undefined && !success) env = MessageEnvelope.getErrEnvelope(msgid, msg);

            // Otherwise pack into normal envelope
            else env = MessageEnvelope.getDataEnvelope(data, msgid, msg);

            // second arg is pagination in older calls 
            if(pages == undefined && x[1]) pages = x[1];

            // set paginator
            if(pages != undefined || descriptor.paginate)
                MessageEnvelope.setEnvPagination(env, pages);
        
        } else env = result; // already an envelope

        // if a new jwt was created, pass it back in the result
        if(args[NEWJWT]) MessageEnvelope.setEnvToken(env, args[JWTARG]);

        // call original callback w/ envelope
        return callback(env);
    })
}

// Extend base Plugin
// this adds functionality for permission checks on event calls
// also adds MessageEnvelope protocol
module.exports.APIPlugin = class APIPlugin extends Plugin {
    constructor(data) {
        // fix home directory if not specified
        // this way getSubclassDir is never called in Plugin
        if(data && data.home === undefined)
            data.home = getSubclassDir();

        super(data);
    }

    /* override */
    wrapEvent(descriptor, fn) {
        return (async function(args, callback) {
            // verify JWT if present
            if(args.jwt) {
                if(!JWT.verify(args.jwt))
                    return callback(MessageEnvelope.getErrEnvelope(MessageEnvelope.MESG_NOLOGIN, "Invalid token."));
                
                // populate out-of-band user arg w/ token payload
                args[USER] = JWT.read(args.jwt);

                // if token is expiring soon, renew it automatically
                let ts = ((new Date()).getTime() / 1000) >> 0; // seconds as integer
                if(args[USER].exp - ts < SESSION_TIMEOUT) {
                    // populate the jwt and then set the out-of-band flag so it is sent to the client
                    args.jwt = renewJWT(args[USER]);
                    args[NEWJWT] = true;
                }

                // move jwt out-of-band
                args[JWTARG] = args.jwt;
                delete args.jwt;
            }


            // verify access
            if(descriptor.access) {
                if(!args[USER]) return callback(MessageEnvelope.getErrEnvelope(MessageEnvelope.MESG_NOLOGIN));

                if((args[USER].rights & descriptor.access) != descriptor.access)
                    return callback(MessageEnvelope.getErrEnvelope(MessageEnvelope.MESG_NOTAUTH));
            }

            /* event calls are async... MUST have await here or 
            this function terminates as soon as the call is scheduled
            and any exceptions will not be caught in try block */
            /* PROXY needed to auto-wrap results in MessageEnvelope */
            try { 
                return await callbackProxy(this, descriptor, args, callback);
            } catch(e) {
                console.log(e);
                // need to define this?
                return callback(MessageEnvelope.getErrEnvelope(null, "An error occurred while processing the request."));
            }
        }).bind(this);
    }
}