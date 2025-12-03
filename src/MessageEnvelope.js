
// Defines "MessageEnvelope" protocol


const ENVELOPE = Symbol();


/****
 * MESSAGES
****/

/* standard message IDs */
const MESG_NOLOGIN = -1,
    MESG_NOTAUTH = -2,
    UNKNOWN_ERROR = -9999;

/* Messages */
/* TODO: Make this configurable w/ i18n */
const MESSAGES = new Map([
    [UNKNOWN_ERROR, "Unknown error."]
    [MESG_NOLOGIN, "Not logged in."],
    [MESG_NOTAUTH, "Not authorized."]
]);

function registerMessages(msgList) {
    if(typeof msgList == 'object' && msgList.constructor.name == 'Map')
        return registerMsgMap(msgList);
    else if(typeof msgList == 'array')
        return registerMsgArr(msgList);
    else throw TypeError();
}

function registerMsgMap(msgMap) {
    msgMap.forEach( (v,k) => {
        if(MESSAGES.has(k)) throw Error("Duplicate message ID.");
        MESSAGES.set(k, v);
    });
}

function registerMsgArr(msgList) {
    for(let i = 0, L = msgList.length; i < L; i++) {
        let m = msgList[i];

        switch(typeof m) {
            case 'array':
                if(m.length != 2) throw TypeError("Invalid message kv array.");
                if(MESSAGES.has(m[0])) throw Error("Duplicate message ID.");
                MESSAGES.set(m[0], m[1]);
                break;
            case 'object':
                if(m.hasOwnProperty('id') && m.hasOwnProperty('msg')) {
                    if(MESSAGES.has(m['id'])) throw Error("Duplicate message ID.");
                    MESSAGES.set(m['id'], m['msg']);
                } else throw TypeError("Invalid message kv object.");
                break;
            default:
                throw TypeError();
        }
    }
}




function getDataEnvelope(data=null, msgid=0, msg='') {
    // if nonzero msgid and msg != ''
    // we need to populate the message, if one is defined.
    if(msgid != 0 && msg == '' && MESSAGES.has(msgid))
        msg = MESSAGES.get(msgid);

    const env = {
        success: true,
        msgid: msgid,
        msg: msg,
        data: data
    };

    env[ENVELOPE] = true;

    return env;
}

function getErrEnvelope(msgid=UNKNOWN_ERROR, msg) {
    if(MESSAGES.has(msgid)) msg = MESSAGES.get(msgid);

    const env = {
        success: false,
        msgid: msgid,
        msg: msg
    };

    env[ENVELOPE] = true;

    return env;
}

function setEnvPagination(env, pages) {
    if(!pages) pages = {};
    if(!pages.count) pages.count = 20;
    if(!pages.num) pages.num = 1;

    env.pages = pages;
}

//#! flesh this out later
function setEnvToken(env, token) {
    env.jwt = token;
}

function setEnvState(env, state) {
    env.state = state;
}


module.exports = {
    ENVELOPE,
    MESG_NOLOGIN,
    MESG_NOTAUTH,

    registerMessages,

    getDataEnvelope,
    getErrEnvelope,

    setEnvPagination,
    setEnvToken,
    setEnvState
};
