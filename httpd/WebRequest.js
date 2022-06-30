const http = require('http');

class WebRequest extends http.IncomingMessage {
    setResponse(res) { this.res = res }
}

module.exports = WebRequest;

