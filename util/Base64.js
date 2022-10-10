// Convenience functions for Base64
const fs = require('fs');

module.exports = {
    atob: function(str) {
		return Buffer.from(str, 'base64').toString('utf8');
	},
	
	btoa: function(str) {
		return Buffer.from(str).toString('base64');
    },
    
    getFileBase64: function (filePath) {
		return fs.readFileSync(filePath).toString('base64');
    }
};