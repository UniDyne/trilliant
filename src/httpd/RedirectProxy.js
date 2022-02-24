const net = require('net'),
    http = require('http');

// Kick connection to HTTPS
function redirectHandler(req, res) {
    const host = req.headers['host'];
    res.writeHead(301, { "Location": `https://${host}${req.url}` });
    res.end();
}


module.exports.RedirectProxy = class {
    constructor(port, ws) {
        
        this.redirector = http.createServer(redirectHandler);
        this.ws = ws;
        this.port = port;

        this.server = net.createServer(socket => {
            socket.once('data', buffer => this.detectProtocol(socket, buffer) );
        });
        
    }

    detectProtocol(socket, buffer) {
        // pause socket
        socket.pause();

        let byte = buffer[0];
        let ssl = false;

        // first byte in tls handshake is 22
        if(byte === 22) ssl = true;

        // rewind the socket stream
        socket.unshift(buffer);

        if(ssl) this.ws.emit('connection', socket);
        else this.redirector.emit('connection', socket);

        // resume the socket async
        process.nextTick( () => socket.resume() );
    }

    start() {
        this.server.listen(this.port, () => console.log("Redirect proxy started."));
    }

};
