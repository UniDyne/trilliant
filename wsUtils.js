
const {Cookie, Cookies} = require("./httpd/Cookies");

module.exports = {
    JWT: require("./httpd/RFC7519"),
    
    Cookie: Cookie,
    Cookies: Cookies
};
