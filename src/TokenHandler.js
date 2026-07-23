const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const { JWT } = require('../lib/JWT');

const TOKEN = Symbol("TOKEN");
const NEW_TOKEN = Symbol();


const SESSION_EXPIRATION_HOURS = 8;
const SESSION_EXPIRATION_MS = SESSION_EXPIRATION_HOURS * 60 *  60 * 1000;
const SECRETS_FILE = path.join(path.dirname(require.main.filename), 'etc/token_secrets.json');

const SECRETS = [];
const SECRETS_DATA = new Map();

// key loader
// this must be called if you intend to use TokenHandler
function init_tokens() {
    if(fs.existsSync(SECRETS_FILE)) try {
        let sec_file = JSON.parse(fs.readFileSync(SECRETS_FILE));
        let ts = (new Date()).valueOf() - 2500;
        
        Object.keys(sec_file).forEach( k => {
            let v = sec_file[k];
            if(v.end > ts) {
                SECRETS.push(v.id);
                SECRETS_DATA.set(v.id, v);
            }
        } );
    } catch(e) {}
    if(SECRETS.length == 0 || SECRETS_DATA.size == 0)
        create_secret();
}

function create_secret() {
    let id = crypto.randomUUID();
    let { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime239v3',
        publicKeyEncoding:  { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    let ts = (new Date()).valueOf();

    const secret = {
        id: id,
        public: publicKey,
        private: privateKey,
        start: ts,
        end: ts + SESSION_EXPIRATION_MS
    };
    SECRETS.push(secret.id);
    SECRETS_DATA.set(secret.id, secret);

    save_secrets();

    return secret.id;
}

// key rotator
function rotate_secret() {
    let ts = (new Date()).valueOf() + 2500;
    
    // remove expired secrets
    SECRETS.splice(0, SECRETS.length, ...SECRETS.filter(x => {
        let sec = SECRETS_DATA.get(x);
        if(sec && sec.end > ts) return true;
        SECRETS_DATA.delete(x);
        return false;
    }));

    const secret = SECRETS.reduce( (p,c,i) => {
        if(p == null) return c;
        if(c.end > p.end) return c;
        return p;
    }, null);

    if(secret != null)
        return secret;

    return create_secret();
}

// key saver
function save_secrets() {
    fs.writeFile(SECRETS_FILE, JSON.stringify(Object.fromEntries(SECRETS_DATA)), err => {
        console.log('Unable to save secrets file.');
        console.log(err);
    });
}

function renew_token(payload) {
    const secret = rotate_secret();
    payload.iss = secret;

    return JWT.create(payload.sub, payload, secret.private);
}

function create_token(username, payload) {
    const secret = rotate_secret();
    payload.iss = secret;

    const token = JWT.create(username, payload, SECRETS_DATA.get(secret).private);
    return token;
}

function validate_token(token) {
    // first, we need to decode the payload (for iss and other fields)
    const payload = JWT.read(token);
    const ts = ((new Date()).valueOf()/1000) >> 0;

    // check the fields before validating sig
    if(!payload.iss || !SECRETS_DATA.has(payload.iss))
        return false;

    if(!JWT.verify(token, SECRETS_DATA.get(payload.iss).public))
        return false;

    return true;
}

function read_token(token) {
    return JWT.read(token);
}


module.exports = {
    TOKEN,
    init_tokens,
    create_token,
    validate_token,
    renew_token,
    read_token
};
