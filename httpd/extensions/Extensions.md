# Extensions

Extensions are modules that plug into the web server to add functionality. They can extend the web server by adding handlers and other functionality to it and they may listen for particular events and add functionality that way.

An Extension module must expose a class named WebExtension in order to work properly. This class is instantiated and configured when the web server is being created.

Extensions to instance may be specified in the appropriate section of the web server configuration. Extension strings starting with "#" are assumed to reference built-in extensions in this extensions directory. Any other strings are assumed to be either node module references or include paths.

Any module that does not contain a WebExtension reference will not be loaded properly. However, any code that would have run during require() will still execute.

## NinjaExtension

This extension is used to expose a set of methods to the web through a 'channel' path. Essentially, this allows minimal-effort creation of web-facing APIs.

## Cookies

This adds cookie functionality to the web server by hooking the request and response events.
