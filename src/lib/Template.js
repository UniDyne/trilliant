/**
 * Template engine with variables and includes.
 */

 const
 fs = require("fs"),
 path = require("path");

// change template cache to have max size, use as queue
const TMPL_CACHE_SIZE = 8;
const CacheEntries = {};
const CacheIndex = [];

function checkCache(id) {
    if(CacheEntries[id]) {
        var i = CacheIndex.findIndex(e => e==id);
        if(i >= 0) CacheIndex.splice(i, 1);
        CacheIndex.push(id);
        return CacheEntries[id];
    } else return null; 
}

function setCache(id, entry) {
    CacheEntries[id] = entry;
    CacheIndex.push(id);
    while(CacheIndex.length > TMPL_CACHE_SIZE) {
        var id = CacheIndex.shift();
        delete CacheEntries[id];
    }
    return entry;
}



function processSegment(tmpl, scope) {
 var output = tmpl;

 // scope evaluator
 var scopeEval = str => str.replace(/^\s+|\s+$/g,'').split('.').reduce((o,i) => o[i], scope);

 // iterators
 output = output.replace(/\{%EACH ([A-Za-z0-9_\.]*)\}(.*?)\{%ENDEACH\}/smg, (w,g,t) => {
    var out = "";
    var x = scopeEval(g);

    if(x.length) {
        for(var i = 0; i < x.length; i++) {
            out += processSegment(t, x[i]);
        }
    } else {
        for(var i in x)
             out += processSegment(t, i);
    }
    return out;
 });

 // conditional
 output = output.replace(/\{%IF ([A-Za-z0-9_\.]*)\}(.*?)\{%ENDIF\}/smg, (w,g,t) => {
    var out = "";
    var x = scopeEval(g);
    if(x) out += processSegment(t, scope);
    return out;
 });
 

 // variables
 output = output.replace(/\{\{([A-Za-z0-9_\.]*)\}\}/g, (w,g) => scopeEval(g) || w);

 return output;
}

class Template {
 constructor(tmplstr) {
    if(tmplstr.substr(0,1) == ':') {
        // check for file extension - add htm if there is not one
        if(!(/\.[a-z]{3,4}$/gi).test(tmplstr)) tmplstr = `${tmplstr}.htm`;
        this.filename = tmplstr.substr(1);
        this.dirname = path.dirname(tmplstr);

        this.tmpl = fs.readFileSync(tmplstr.substr(1), 'utf8');
        
        setCache(filename, this);
    } else {
        this.tmpl = tmplstr;

        // needs to be app path... for includes
        if(App && App.Env) this.dirname = App.Env.appPath;
        else this.dirname = __dirname;
        this.filename = null;
    }
 }

 process(scope) {
     // first process all includes...
     var output = this.tmpl.replace(/\{%([A-Za-z0-9_\.]*)%\}/g, (w,g) => {
        var filename = path.join(this.dirname, g.replace(/^\s+|\s+$/g,''));
        var tmpl = checkCache(filename);
        if(tmpl == null) tmpl = new Template(`:${filename}`);
        return tmpl.process(scope);
     });

     output = processSegment(output, scope);
     
     return output;
 }
}

module.exports = {
    Template: Template,
    process: function(file, scope) {
        var dirname = (App && App.Env) ? App.Env.appPath : __dirname;
        var filename = path.join(dirname, "tmpl", file);
        var tmpl = checkCache(filename);
        if(tmpl == null) tmpl = new Template(`:${filename}`);
        return tmpl.process(scope);
    }
}
