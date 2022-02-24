const http = require('http'),
    fs = require('fs'),
    path = require('path');

const HTTP_MESSAGES = require('./HttpMessages');
const MIME_TYPES = require('./MimeTypes');

const MAX_CHUNK_LEN = 1024 * 1024; // 1 MB

class WebResponse extends http.ServerResponse {

    setStatusCode(code) { this.statusCode = code; }
    setMimeType(mime) { this.mimeType = mime; }
    setRequest(req) { this.req = req; }

    //
    sendResponseCode(code, data) {
        var header = {"Content-Type": "text/plain"};

        // location header for redirects
        if(code != 304 && code >= 300 && code < 400)
            this.setHeader('Location', data);

        // auth header for 401
        if(code == 401)
            this.setHeader('WWW-Authenticate', getAuthHeader(data));

        this.writeHead(code, header);
        if(HTTP_MESSAGES[code]) this.write(`${code} ${HTTP_MESSAGES[code]}\n`);
        if(data && code == 500) this.write(JSON.stringify(data));
        this.end();
    }


    sendFile(filename) {
        fs.stat(filename, (err, stat) => {
            if(err) return this.sendResponseCode(404);

            // directory => default page
            if(stat.isDirectory()) return this.sendFile(path.join(filename, 'index.html'));

            //#! move ETags...?
            // Need to hook something here... expand ETags to non-files...
            // use extension?
            //var etag = calcETag(filename, stat);
            //this.setHeader("ETag", etag);
            //this.setHeader("Cache-Control", `max-age=${this.Config.cacheAge}`);

            this.emit('headers'); /* */

            var statusOK = 200, start, end;
            var headers = {
                "Content-Type": this.getMimeType(filename),
                "Content-Length": stat.size,
                "Accept-Ranges": "bytes"
            };


            if(this.req.headers['range']) {
                var match = (/bytes=([0-9]+)-([0-9]+)?/).exec(this.req.headers['range']);
                if(!match) return this.sendResponseCode(416);
                start = parseInt(match[1]), end = match[2] ? parseInt(match[2]) : start + MAX_CHUNK_LEN, end = Math.min(end, stat.size-1);
                if(start >= end || end >= stat.size || end - start > MAX_CHUNK_LEN) return this.sendResponseCode(416);
            }

            
            try {
                if(start !== undefined && end !== undefined) {
                  var fd = fs.openSync(filename);  
                  fs.read(fd, Buffer.allocUnsafe(end - start), 0, end - start, start, (err, bytes, buff) => {
                    if(err) return this.sendResponseCode(500, err);

                    statusOK = 206; // partial
                    headers["Content-Length"] = bytes;
                    headers["Content-Range"] = `bytes ${start}-${start+bytes-1}/${stat.size}`;
                    
                    this.writeHead(statusOK, headers);
                    this.write(buff, "binary");
                    this.end();
                  });
                } else {
                    this.writeHead(statusOK, headers);
                    fs.createReadStream(filename).pipe(this);
                }
            } catch(e) { console.log(e); }
        });
    }


    sendJSON(data) {
        this.writeHead(200, {"Content-Type": MIME_TYPES.json});
        this.emit('headers'); /* */
        this.write(JSON.stringify(data));
        this.end();
    }
}

module.exports = WebResponse;

