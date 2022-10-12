
 const
	fs = require("fs"),
	path = require("path");

 const {Cache} = require('./Cache');

// change template cache to have max size, use as queue
const TMPL_CACHE_SIZE = 8;

// Template processing regex
const RX_EACH = /\{%EACH\s+([A-Za-z0-9_\.]*)\s*\}(.*?)\{%ENDEACH\}/sg;
const RX_IF = /\{%IF\s+([A-Za-z0-9_\.]*)\s*\}(.*?)\{%ENDIF\}/sg;
const RX_VARS = /\{\{\s*([a-z0-9_\.]*)\s*(\|\s*([a-z0-9_]+)]s*)?\}\}/gi;
const RX_WIDGET = /\{\{\$\s*([a-z0-9_\.]*)\s*([\w =":\.\/]+)?\$\}\}/gi;
const RX_WIDGET_ARGS = /\s*(\w+)="([\w \.\-\/\:]+?)"\s*/gi;

const TemplateCache = new Cache(TMPL_CACHE_SIZE);


const Filters = {
	fixed: v => (0+v).toFixed(2),
	integer: v => parseInt(v),
	json: v => JSON.stringify(v, null, 4)
};

exports.addFilter = (name, fn) => Filters[name] = fn;


//naive widget implementation for now
const Widgets = {
	test: function() { return JSON.stringify(arguments, null, 4); }
};

exports.addWidget = (name, fn) => Widgets[name] = fn;


function processSegment(tmpl, scope) {
	var output = tmpl;

	// scope evaluator
	var scopeEval = str => str.replace(/^\s+|\s+$/g,'').split('.').reduce((o,i) => i==='' ? o : o[i], scope);

	// iterators
	output = output.replace(RX_EACH, (w,g,t) => {
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
	output = output.replace(RX_IF, (w,g,t) => {
		var x = scopeEval(g);
		if(x == undefined || x == null || x === false) return "";
		if(x.hasOwnProperty('length') && x.length === 0) return "";
		return processSegment(t, scope);
	});


	// variables
	output = output.replace(RX_VARS, (w,g,t,f) => {
		let v = scopeEval(g);
		if(v == undefined) return w;
		if(v == null) return '';
		
		// if scope defines function, use that
		if(f && scope[f] && typeof scope[f] === 'function') return scope[f](v);

		// otherwise, check filters
		if(f && Filters[f]) return Filters[f](v);

		// no function/filter
		return v;
	});

	return output;
}

/**
	Template engine with variables and includes. Syntax is similar to what
	is used by Liquid / Jekyll. Currently, a very minimal set of features
	is supported. Focus is on speed rather than flexibility. The template
	engine is for templating rather implementing logic. As such, this engine
	uses RegEx rather than implementing a lexer / parser.
*/
exports.Template = class Template {
	/**
		Create template. If tmplstr parameter starts with ':', it is
		assumed to be a file path. The template will be loaded from file
		and cached. Otherwise, the string is assumed to be a literal template
		and will not be cached.
		
		If using a file path, the file extension is optional and will be
		assumed to be '.tmpl'. The extensionless form is typically used
		for includes.
		@param {string} tmplstr - Path to template or the template string. 
	*/
	constructor(tmplstr) {
		if(tmplstr.substr(0,1) == ':') {
			// check for file extension - add htm if there is not one
			if(!(/\.[a-z]{3,4}$/gi).test(tmplstr)) tmplstr = `${tmplstr}.tmpl`;
			this.filename = tmplstr.substr(1);
			this.dirname = path.dirname(this.filename);

			this.tmpl = fs.readFileSync(tmplstr.substr(1), 'utf8');

			TemplateCache.set(this.filename, this);
		} else {
			this.tmpl = tmplstr;

			// needs to be app path... for includes
			if(App && App.Env) this.dirname = App.Env.appPath;
			else this.dirname = __dirname;
			this.filename = null;
		}
	}

	/**
		Process template using the given scope.
		@param {Object} scope - The scope to be used to populate the template.
		@return {string} The populated template string.
	*/
	process(scope) {
		// first process all includes...
		var output = this.tmpl.replace(/\{%\s*(\$?[a-z0-9_\.]*)\s*%\}/gi, (w,g) => {
			
			var filename = g.replace(/^\s+|\s+$/g,'');
			/* if the filename is a variable, process variable */
			if(filename.startsWith('$')) filename = filename.replace(/^\$/,'').split('.').reduce((o,i) => o[i], scope);
			filename = path.join(this.dirname, filename);
			
			var tmpl = TemplateCache.get(filename);
			if(tmpl == null) tmpl = new Template(`:${filename}`);
			return tmpl.process(scope);
		});

		output = output.replace(RX_WIDGET, (w,g,a) => {
			if(Widgets[g]) {
				let args = {scope:scope};
				if(a) a.replace(RX_WIDGET_ARGS, (w,k,v) => args[k] = v);
				return Widgets[g](args);
			}
			return w;
		});

		output = processSegment(output, scope);

		return output;
	}
}

/**
	Processes a template file and returns the result. Makes use of the
	template cache so repeated processing of the same template file does
	not incur additional disk access penalty.

	If using the framework's App, path will be assumed to be relative to
	the appPath. Otherwise, it is assumed to be relative to process.cwd.

	@param {string} file - Template file path.
	@param {Object} scope - The scope to be used to populate the template.
	@return {string} The populated template string.
*/
exports.procTemplate = function procTemplate(file, scope) {
	var dirname = (App && App.Env) ? App.Env.appPath : process.cwd();
	var filename = path.join(dirname, "tmpl", file);
	var tmpl = TemplateCache.get(filename);
	if(tmpl == null) tmpl = new Template(`:${filename}`);
	return tmpl.process(scope);
}
