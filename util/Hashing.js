const crypto = require('crypto');


module.exports = {
    md5: function (str) {
		let hash = crypto.createHash('MD5');
		hash.update(str);
		return hash.digest('hex');
	},
	
	sha256: function (str) {
		let hash = crypto.createHash('SHA256');
		hash.update(str);
		return hash.digest('hex');
    },

	getFileHash: function (pathname, callback, algo = 'md5', encoding = 'hex') {
		let hash = crypto.createHash(algo);
		let input = fs.createReadStream(pathname);
		hash.setEncoding(encoding);
		input.on('end', function() {
			hash.end();input.close();
			callback(hash.read());
		});
		input.pipe(hash);
	}
}