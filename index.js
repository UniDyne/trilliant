
module.exports = {
    Application: require('./src/Application'),
    Plugin: require('./src/Plugin'),

    ServiceWrapper: require('./src/services/ServiceWrapper'),
    WebService: require('./src/services/WebService'),
    SQLService: require('./src/services/SQLService'),


    JWT: require('./src/httpd/RFC7519.js')
};
