const crypto = require("crypto"),
    path = require('path'),
    fs = require('fs');

const Util = require('./Utils');

/*================================================================
	RFC7519 - JWT
================================================================*/


// generate default keys
// this means tokens will NOT work after server restart or across multiple nodes
// to avoid this, use key files in config
let { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
	namedCurve: 'sect239k1',
	publicKeyEncoding:  { type: 'spki', format: 'pem' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});


module.exports = {
    setKeyPair: function(pubKey, prvKey) {
        privateKey = prvKey;
        publicKey = pubKey;
    },

    saveKeyPair: function() {
        fs.writeFileSync(path.join(process.cwd(), 'jwt_pub.pem'),publicKey);
        fs.writeFileSync(path.join(process.cwd(), 'jwt_pvt.pem'),privateKey);
    },

    create: function(username, claims = {}) {
        var head = { typ: 'JWT', alg: 'HS256' };
        var ts = ((new Date()).getTime()/1000) >> 0;
        var body = Object.assign(claims, {
            jti: Util.createUUID(),
            iat: ts,
            exp: ts + (8 * 60 * 60), // 8 hours
            sub: username
        });
        
        var jwt = [];
        jwt.push(Util.btoa(JSON.stringify(head)));
        jwt.push(Util.btoa(JSON.stringify(body)));
        
        // create signature
        var sign = crypto.createSign('SHA256');
        sign.write(jwt[0] + ':' + jwt[1]);
        sign.end();
        jwt.push(sign.sign(privateKey, 'base64'));
        
        return jwt.join('.');
    },

    verify: function(jwt) {
        jwt = jwt.split('.');
        
        if(jwt.length != 3) return false;
        
        var body = JSON.parse(Util.atob(jwt[1]));
        
        // confirm timestamp
        var ts = ((new Date()).getTime()/1000) >> 0;
        if(body.iat > ts || body.exp < ts) return false;
        
        // confirm signature
        var verify = crypto.createVerify('SHA256');
        verify.update(jwt[0]+':'+jwt[1]);
        if(!verify.verify(publicKey, jwt[2], 'base64')) return false;
        
        return true;
    },

    read: function(jwt) { return JSON.parse(Util.atob(jwt.split('.')[1])); }
};
