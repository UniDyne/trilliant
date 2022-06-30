
 const
	fs = require("fs"),
	path = require("path");

 const {Cache} = require('./Cache');

// change template cache to have max size, use as queue
const TMPL_CACHE_SIZE = 8;

// Template processing regex
const RX_EACH = /\{%EACH ([A-Za-z0-9_\.]*)\}(.*?)\{%ENDEACH\}/smg;
const RX_IF = /\{%IF ([A-Za-z0-9_\.]*)\}(.*?)\{%ENDIF\}/smg;
const RX_VARS = /\{\{([a-z0-9_\.]*)\}\}/gi;


const TemplateCache = new Cache(TMPL_CACHE_SIZE);



function processSegment(tmpl, scope) {
	var output = tmpl;

	// scope evaluator
	var scopeEval = str => str.replace(/^\s+|\s+$/g,'').split('.').reduce((o,i) => o[i], scope);

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
		var out = "";
		var x = scopeEval(g);
		if(x) out += processSegment(t, scope);
		return out;
	});


	// variables
	output = output.replace(RX_VARS, (w,g) => scopeEval(g) || w);

	return output;
}

/**
	Template engine with variables and includes. Syntax is similar to what
	is used by Liquid / Jekyll. Currently, a very minimal set of features
	is supported. Focus is on speed rather than flexibility. The template
	engine is for templating rather implementing logic. As such, this engine
	uses RegEx rather than implementing a lexer / parser.
*/
export class Template {
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
			this.dirname = path.dirname(tmplstr);

			this.tmpl = fs.readFileSync(tmplstr.substr(1), 'utf8');

			TemplateCache.set(filename, this);
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
		var output = this.tmpl.replace(/\{%([a-z0-9_\.]*)%\}/gi, (w,g) => {
			var filename = path.join(this.dirname, g.replace(/^\s+|\s+$/g,''));
			var tmpl = TemplateCache.get(filename);
			if(tmpl == null) tmpl = new Template(`:${filename}`);
			return tmpl.process(scope);
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
export function procTemplate(file, scope) {
	var dirname = (App && App.Env) ? App.Env.appPath : process.cwd();
	var filename = path.join(dirname, "tmpl", file);
	var tmpl = TemplateCache.get(filename);
	if(tmpl == null) tmpl = new Template(`:${filename}`);
	return tmpl.process(scope);
}
