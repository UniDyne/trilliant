
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
    [UNKNOWN_ERROR, "Unknown error."],
    [MESG_NOLOGIN, "Not logged in."],
    [MESG_NOTAUTH, "Not authorized."]
]);

function registerMessages(msgList) {
    if(Array.isArray(msgList))
        return registerMsgArr(msgList);
    else if(typeof msgList == 'object' && msgList.constructor.name == 'Map')
        return registerMsgMap(msgList);
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

        if(Array.isArray(m)) {
            if(m.length != 2) throw TypeError("Invalid message kv array.");
            if(MESSAGES.has(m[0])) throw Error("Duplicate message ID.");
            MESSAGES.set(m[0], m[1]);
        } else if(typeof m == 'object') {
            if(m.hasOwnProperty('id') && m.hasOwnProperty('msg')) {
                if(MESSAGES.has(m['id'])) throw Error("Duplicate message ID.");
                MESSAGES.set(m['id'], m['msg']);
            } else throw TypeError("Invalid message kv object.");
        } else throw TypeError();
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

function getErrorEnvelope(msgid=UNKNOWN_ERROR, msg) {
    if((msg == null || msg == '') && MESSAGES.has(msgid)) msg = MESSAGES.get(msgid);

    const env = {
        success: false,
        msgid: msgid,
        msg: msg
    };

    env[ENVELOPE] = true;

    return env;
}

function setPagination(env, pages) {
    if(!pages) pages = {};
    if(!pages.count) pages.count = 20;
    if(!pages.num) pages.num = 1;

    env.pages = pages;
}

//#! flesh this out later
function setToken(env, token) {
    env.token = token;
    // compatibility
    env.jwt = token;
}

function setState(env, state) {
    env.state = state;
}


module.exports = {
    ENVELOPE,
    MESG_NOLOGIN,
    MESG_NOTAUTH,

    registerMessages,

    getDataEnvelope,
    getErrorEnvelope,

    setPagination,
    setToken,
    setState
};
