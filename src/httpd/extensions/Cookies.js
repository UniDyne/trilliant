
module.exports.Cookie = class {
    constructor(name, value) {
        this.name = name;
        this.value = value;

        this.Secure = false;
        this.HttpOnly = false;
        this.Expires = null;
        this.MaxAge = null;
        this.Path = null;
        this.Domain = null;
    }

    stringify() {
        var list = [];

        list.push( this.name + '=' + encodeURIComponent( this.value ) );

        if(this.Expires) list.push( 'Expires=' + this.Expires.toUTCString() );
        if(this.MaxAge) list.push( 'Max-Age=' + this.MaxAge );
        if(this.Domain) list.push( 'Domain=' + encodeURIComponent( this.Domain ) );
        if(this.Path) list.push( 'Path=' + encodeURIComponent( this.Path ) );
        if(this.Secure) list.push( 'Secure' );
        if(this.HttpOnly) list.push( 'HttpOnly' );

        return list.join('; ');
    }
};

module.exports.Cookies = class {
    constructor(request, response) {
        this.request = request;
        this.response = response;
        this.list = {};
        this.pending = [];

        request.Cookies = this;
        response.Cookies = this;

        var rc = request.headers.cookie;
        rc && rc.split(';').forEach(function(cookie) {
            var parts = cookie.split(/=(.+)/);
            this.list[parts[0].trim()] = decodeURI(parts[1].trim());
        }.bind(this));
    }

    setCookie(name, value) {
        var cookie = new module.exports.Cookie(name, value);
        this.pending.push(cookie);
        return cookie;
    }

    getCookie(name) {
        if(this.pending[name]) return this.pending[name].value;
        else return this.list[name];
    }

    writeCookies() {
        this.pending.forEach((c) => this.response.setHeader('Set-Cookie', c.stringify()));
    }
};

module.exports.WebExtension = class {
    constructor(webserver, config) {
        // on every request, add cookie functionality
        webserver.on('requestStart', (request, response) => new module.exports.Cookies(request, response));
        webserver.on('headers', (response) => response.Cookies.writeCookies());
    }
};
