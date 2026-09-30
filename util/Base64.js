// Convenience functions for Base64
const fs = require('fs');

module.exports = {
    atob: function(str, b64url = false) {
		return Buffer.from(str, b64url ? 'base64url': 'base64').toString('utf8');
	},
	
	btoa: function(str, b64url=false) {
		return Buffer.from(str).toString(b64url ? 'base64url' : 'base64');
    },
    
    getFileBase64: function (filePath, b64url=false) {
		return fs.readFileSync(filePath).toString(b64url ? 'base64url' : 'base64');
    }
};