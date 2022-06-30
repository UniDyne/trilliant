/**
    Dummy interface for services.
    Extend this to implement a new service.
*/
export class ServiceWrapper {
    constructor(app, config) {
        this.App = app;
    }

    start() {}
    stop() {}

    register(plug, data) {}
};
