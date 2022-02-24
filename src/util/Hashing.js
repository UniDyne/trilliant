const crypto = require('crypto');

module.exports = {
    md5: function (str) {
		var hash = crypto.createHash('MD5');
		hash.update(str);
		return hash.digest('hex');
	},
	
	sha256: function (str) {
		var hash = crypto.createHash('SHA256');
		hash.update(str);
		return hash.digest('hex');
    }
}