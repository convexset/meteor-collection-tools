/* eslint-disable no-console */
/* eslint-disable no-extra-parens */

import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { check, Match } from 'meteor/check';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { EJSON } from 'meteor/ejson';
import { SimpleSchema } from 'meteor/aldeed:simple-schema';

import { checkNpmVersions } from 'meteor/tmeasday:check-npm-versions';
checkNpmVersions({
	'package-utils': '^0.2.1',
	'underscore': '^1.8.3'
});
const PackageUtilities = require('package-utils');
const _ = require('underscore');

SimpleSchema.extendOptions({
	subSchemaTags: Match.Optional([String])
});

const __ct = function CollectionTools() {};

const CollectionTools = new __ct();


// Debug Mode
let _debugMode = false;
PackageUtilities.addPropertyGetterAndSetter(CollectionTools, 'DEBUG_MODE', {
	get: () => _debugMode,
	set: (value) => {
		_debugMode = !!value;
	},
});


function filterObject(o, getCheckableSchemaFunc, ignoreOffSchemaFields, prefix) {
	if (typeof prefix === 'undefined') {
		prefix = '';
	}
	const checkableSchema = getCheckableSchemaFunc(prefix);

	if (_.isArray(checkableSchema)) {
		if (_.isArray(o)) {
			if ((checkableSchema.length === 1) && (_.isFunction(checkableSchema[0]))) {
				return o;
			} else {
				return o.map(item => filterObject(item, getCheckableSchemaFunc, ignoreOffSchemaFields, prefix === '' ? '$' : `${prefix}.$`));
			}
		} else {
			if (ignoreOffSchemaFields) {
				return o;
			} else {
				throw new Meteor.Error('invalid-field', prefix);
			}
		}
	}

	const thisAsObj = {};
	_.forEach(o, (v, f) => {
		if (checkableSchema.hasOwnProperty(f)) {
			const typeInfo = checkableSchema[f];
			if (_.isFunction(typeInfo)) {
				thisAsObj[f] = o[f];
			} else if (_.isObject(typeInfo) && _.isDate(o[f])) {
				thisAsObj[f] = o[f];
			} else if (_.isObject(typeInfo) && _.isObject(o[f])) {
				thisAsObj[f] = filterObject(o[f], getCheckableSchemaFunc, ignoreOffSchemaFields, prefix === '' ? f : `${prefix}.${f}`);
			} else {
				thisAsObj[f] = o[f];
				// possibly a Match type... can't do instance checking...
				// throw new Meteor.Error('invalid-type-info', prefix === '' ? f : (prefix + '.' + f));
			}
		} else {
			// Keep if in schema or not ignoring off schema fields
			if (!ignoreOffSchemaFields) {
				thisAsObj[f] = o[f];
			}
		}
	});
	return thisAsObj;
}
PackageUtilities.addImmutablePropertyFunction(CollectionTools, '_filterObject', filterObject);

const baseConstructorPrototype = {
	_asPlainObject: function _asPlainObject(ignoreOffSchemaFields) {
		return filterObject(this, _.bind(this.constructor.getCheckableSchema, this.constructor), ignoreOffSchemaFields);
	},
	validate: function validate(useCheck, ignoreOffSchemaFields) {
		const thisAsPlainObject = this._asPlainObject(!!ignoreOffSchemaFields);
		if (!!useCheck) {
			return check(thisAsPlainObject, this.constructor.schema);
		} else {
			const ssContext = this.constructor.schema.newContext();
			const result = ssContext.validate(thisAsPlainObject);
			return {
				result: result,
				context: ssContext
			};
		}
	},
};


function applyRateLimitItem(name, type, rateLimit, rateLimitInterval) {
	if (typeof rateLimitInterval === 'undefined') {
		rateLimitInterval = 1000;
	}
	if (typeof rateLimitInterval === 'undefined') {
		rateLimitInterval = 1000;
	}
	DDPRateLimiter.addRule({
		type: type,
		name: name,
		connectionId: () => true,
	}, rateLimit, rateLimitInterval);
}

function applyRateLimitingToSpecificInstance(name, type, options, defaultOptions) {
	if (!!options.rateLimit && !!options.rateLimitInterval) {
		if ((options.rateLimit > 0) && (options.rateLimit > 0)) {
			applyRateLimitItem(name, type, options.rateLimit, options.rateLimitInterval);
		}
	} else {
		if (!!defaultOptions.defaultRateLimit && !!defaultOptions.defaultRateLimitInterval) {
			applyRateLimitItem(name, type, defaultOptions.defaultRateLimit, defaultOptions.defaultRateLimitInterval);
		}
	}
}


// create method and specify all elements of the method separately
const __allMethodNames = [];
PackageUtilities.addImmutablePropertyFunction(CollectionTools, 'createMethod', function createMethod(options) {
	options = _.extend({
		name: 'some-method-name',
		schema: {},
		authenticationCheck: () => true,  // (userId, id) => true,
		unauthorizedMessage: (opts, userId, id) => `unauthorized for ${userId}: ${opts.name} (_id: ${id})`,
		method: () => null,
		useRestArgs: false,
		finishers: [],
		serverOnly: false,
		rateLimit: 10,
		rateLimitInterval: 1000,
	}, options);

	if (__allMethodNames.indexOf(options.name) !== -1) {
		throw new Meteor.Error('repeated-method-name', options.name);
	}

	function doWorkViaApply(args) {
		// authenticate
		if (!_.isFunction(options.authenticationCheck) || options.authenticationCheck(Meteor.userId(), args[0])) {
			// run operation
			const ret = options.method.apply(this, args);

			// run finishers
			options.finishers.forEach(function(fn) {
				if (_.isFunction(fn)) {
					fn.apply({
						context: this,
						args: args,
						result: ret
					});
				}
			});

			// return result
			return ret;
		} else {
			throw new Meteor.Error('unauthorized', options.unauthorizedMessage(options, this.userId, args[0]));
		}
	}

	// method body
	let method;
	if (_.isArray(options.schema)) {
		// The usual methods with argument lists
		method = function generatedMethod() {
			// check arguments
			check(arguments, Match.Any);

			if (_debugMode) {
				console.log(`[CollectionTools|method|${options.name}] arguments:`, _.toArray(arguments));
				// console.log(`[CollectionTools|method|${options.name}] options:`, options);
			}

			let args = _.toArray(arguments);
			if (!options.useRestArgs) {
				if (args.length !== options.schema.length) {
					throw new Meteor.Error('validation-error-schema-length-mismatch', EJSON.stringify({
						args: args,
						schema: options.schema.map(x => _.isFunction(x) ? x.name : x),
					}));
				}
			} else {
				if (options.schema.length === 0) {
					throw new Meteor.Error('validation-error-invalid-schema-length-for-rest-args', EJSON.stringify({
						useRestArgs: options.useRestArgs,
						schema: options.schema.map(x => _.isFunction(x) ? x.name : x),
					}));
				}
				if (args.length < options.schema.length - 1) {
					throw new Meteor.Error('validation-error-schema-length-mismatch', EJSON.stringify({
						args: args,
						schema: options.schema.map(x => _.isFunction(x) ? x.name : x),
					}));
				}

				// to ensure that if there are no rest args, there still is
				// an empty array to check
				const restArgs = args.splice(options.schema.length - 1);
				if (_debugMode) {
					console.log(`[CollectionTools|method|${options.name}] restArgs:`, restArgs);
				}
				args.push(restArgs);
			}

			// quick check of all arguments
			_.forEach(args, function checkSchemaElement(v, idx) {
				check(v, options.schema[idx]);
			});

			// link rest arguments (so it doesn't show up as a lonely array)
			const restArgs = args.pop();
			args = args.concat(restArgs);

			// do work:
			if (_debugMode) {
				console.log(`[CollectionTools|method|${options.name}] doWorkViaApply with args:`, args);
			}
			return _.bind(doWorkViaApply, this)(args);
		};
	} else {
		// via destructuring...
		method = function generatedMethod(args) {
			// check arguments
			check(args, new SimpleSchema(options.schema));
			if (_debugMode) {
				console.log(`[CollectionTools|method-destructuring|${options.name}] arguments:`, _.toArray(args));
			}

			// do work
			if (_debugMode) {
				console.log(`[CollectionTools|method|${options.name}] doWorkViaApply with args:`, [args]);
			}
			return _.bind(doWorkViaApply, this)([args]);
		};
	}

	// declare method
	if ((!Meteor.isClient) || (!options.serverOnly)) {
		// Always declare on server !Meteor.isClient
		// Always declare is serverOnly = false
		// Only situation that fails is isClient=true & serverOnly=true
		Meteor.methods(_.object([
			[options.name, method]
		]));
	}

	// rate limit
	if (!!options.rateLimit && !!options.rateLimitInterval) {
		applyRateLimitItem(options.name, 'method', options.rateLimit, options.rateLimitInterval);
	}

	// add to list of method names
	__allMethodNames.push(options.name);
});

PackageUtilities.addImmutablePropertyFunction(CollectionTools, 'build', function build(options) {
	options = _.extend({
		collectionName: '',
		constructorName: '',
		setRestrictiveAllowDenyDefaults: true,
		schema: {},
		prototypeExtension: {},
		constructorExtension: {},
		transform: x => x,
		globalAuthFunction: () => true,  // (userId, documentId) => true,
		globalAuthFunction_fromConstructorAndCollection: null,
		methodPrefix: 'collections/',
		defaultRateLimit: 10,
		defaultRateLimitInterval: 1000,
	}, options, false);
	if (!options.collectionName) {
		options.collectionName = null;
	}
	if (options.methodPrefix === '') {
		const _cNSplit = String(options.collectionName).split('_');
		const _cn = (_cNSplit.length > 1) ? _cNSplit.splice(1).join('_') : _cNSplit[0];
		options.methodPrefix = `collections/${_cn}/`;
	}

	if (!_.isFunction(options.transform)) {
		throw new Meteor.Error('invalid-transform');
	}

	////////////////////////////////////////////////////////////
	// Basic Constructor
	////////////////////////////////////////////////////////////
	const ConstructorFunction = (function() {
		// for nice constructor names
		const name = (!!options.constructorName) ? options.constructorName : options.collectionName;
		let fn;
		let s = 'fn = function ';
		let constructorName = '';
		Array.prototype.forEach.call(name || '', function nameConstructorWithValidCharacters(c, idx) {
			// eslint-disable-next-line yoda
			if ((c === '_') || (('a' <= c) && (c <= 'z')) || (('A' <= c) && (c <= 'Z')) || ((idx !== 0) && ('0' <= c) && (c <= '9'))) {
				s += c;
				constructorName += c;
			}
		});
		s += '() {' + '\n';
		if (constructorName.length > 0) {
			// add protection in the form of...
			// if (!(this instanceof constructor)) { throw 'improper-constructor-invocation'; }'
			s += `    if (!(this instanceof ${constructorName})) { throw "improper-constructor-invocation"; }\n`;
		}
		s += '    return _.extend(this, options.transform.apply(this, _.toArray(arguments)));\n';
		s += '}\n';
		// jshint evil: true
		// eslint-disable-next-line no-eval
		eval(s);
		// jshint evil: false
		return fn;
	})();


	////////////////////////////////////////////////////////////
	// The Collection
	////////////////////////////////////////////////////////////
	const collection = new Mongo.Collection(options.collectionName, {
		transform: function(doc) {
			return new ConstructorFunction(doc);
		},
		defineMutationMethods: !options.setRestrictiveAllowDenyDefaults
	});
	PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'collection', collection);
	if (!!options.setRestrictiveAllowDenyDefaults && !!options.collectionName) {
		collection.allow({
			insert: () => false,
			update: () => false,
			remove: () => false
		});

		collection.deny({
			insert: () => true,
			update: () => true,
			remove: () => true
		});
	}


	////////////////////////////////////////////////////////////
	// Constructor Extension
	////////////////////////////////////////////////////////////
	const constructorExtension = _.isFunction(options.constructorExtension) ? options.constructorExtension(ConstructorFunction, collection) : options.constructorExtension;
	_.extend(ConstructorFunction,
		_.object(['find', 'findOne', 'insert', 'update', 'remove', 'upsert'].map(fnName => {
			// Mongo.Collection methods transposed and suitably named
			let fn;
			// jshint evil: true
			// eslint-disable-next-line no-eval
			eval(`fn = function ${fnName}() { /* ' + fnName + ' from Mongo.Collection */ return Mongo.Collection.prototype[fnName].apply(this.collection, _.toArray(arguments));};`);
			// jshint evil: false
			return [fnName, fn];
		})), {
			fetch: function findAndFetch() {
				return Mongo.Collection.prototype.find.apply(this.collection, _.toArray(arguments)).fetch();
			},
			__logAll__: function __logAll__(selector, fields, sortDef) {
				if (!selector) {
					selector = {};
				}
				if (!fields) {
					fields = {};
				}
				if (!sortDef) {
					sortDef = {};
				}
				const allItems = this.find(selector, {
					fields: fields,
					sort: sortDef
				}).fetch();
				console.log(`**** LOG ALL (${this.collection._name}) ****`);
				_.forEach(allItems, (v, k) => {
					const _id = v._id;
					delete v._id;
					console.log(`[${k}|${_id}]`, v);
				});
				console.log(`**** ${allItems.length} items ****`);
			}
		}, {
			mongoTransform: options.transform
		}, constructorExtension);

	////////////////////////////////////////////////////////////
	// The Prototype
	////////////////////////////////////////////////////////////
	(function() {
		ConstructorFunction.prototype = Object.create(baseConstructorPrototype);
		Object.defineProperty(ConstructorFunction.prototype, 'constructor', {
			value: ConstructorFunction,
			enumerable: false,
			writable: true,
			configurable: true
		});

		const prototypeExtension = _.isFunction(options.prototypeExtension) ? options.prototypeExtension(ConstructorFunction, collection) : options.prototypeExtension;
		Object.getOwnPropertyNames(prototypeExtension).forEach(key => {
			Object.defineProperty(ConstructorFunction.prototype, key, Object.getOwnPropertyDescriptor(prototypeExtension, key));
		});
	})();


	////////////////////////////////////////////////////////////
	// Global Auth Function
	////////////////////////////////////////////////////////////
	if (_.isFunction(options.globalAuthFunction_fromConstructorAndCollection)) {
		options.globalAuthFunction = options.globalAuthFunction_fromConstructorAndCollection(ConstructorFunction, collection);
	}


	////////////////////////////////////////////////////////////
	// Basic Schema Stuff
	////////////////////////////////////////////////////////////
	PackageUtilities.addPropertyGetter(ConstructorFunction, 'schema', function schema() {
		return new SimpleSchema(options.schema);
	});
	PackageUtilities.addPropertyGetter(ConstructorFunction, 'schemaDescription', function getSchemaDescription() {
		return this.schema._schema;
	});
	PackageUtilities.addPropertyGetter(ConstructorFunction, '_schemaDescription', function _getSchemaDescription() {
		return _.object(_.map(this.schemaDescription, (v, k) => {
			let kk = k;
			while (kk.indexOf('$') !== -1) {
				kk = kk.replace('$', '*');
			}
			return [kk, v];
		}));
	});
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getTypeInfo', function getTypeInfo(fieldSpec) {
		let match;
		const fieldSpecSplit = fieldSpec.split('.');
		_.forEach(ConstructorFunction._schemaDescription, (desc, f) => {
			if (!!match) {
				return;
			}
			const fSplit = f.split('.');
			if (fSplit.length !== fieldSpecSplit.length) {
				return;
			}

			for (let k = 0; k < fSplit.length; k++) {
				// give wildcards a pass
				if ((fSplit[k] !== fieldSpecSplit[k]) && (fSplit[k] !== '*')) {
					return;
				}
			}
			match = desc;
		});
		return match;
	});

	////////////////////////////////////////////////////////////
	// More Schema Stuff
	//  - default object
	//  - schema modification
	//  - generate "checkable" (and "introspectable") schema
	////////////////////////////////////////////////////////////
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getObjectWithDefaultValues', function getObjectWithDefaultValues(prefix = '', callConstructor = true) {
		// TODO: address nested simple schemas in getObjectWithDefaultValues

		const obj = {};
		// create schema limited to the prefix
		const schemaDesc = _.object(
			_.map(
				this.schemaDescription, (v, k) => [k, v]
			)
			.filter(x => x[0].substr(0, prefix.length) === prefix)
			.map(x => [x[0].substr(prefix.length), x[1]])
		);

		_.forEach(schemaDesc, (item, key) => {
			if (key.indexOf('.') === -1) {
				// Top Level only!!! Everything should be there.
				if ((!item.optional) && (typeof item.defaultValue === 'undefined')) {
					throw new Meteor.Error('default-value-not-found', key);
				}

				if (typeof item.defaultValue !== 'undefined') {
					obj[key] = _.isFunction(item.defaultValue) ? item.defaultValue() : item.defaultValue;
				}
			}
		});

		if ((prefix === '') && callConstructor) {
			return new ConstructorFunction(obj);
		} else {
			return obj;
		}
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getModifiedSchema', function getModifiedSchema(altSchemaElements, tag) {
		let k;
		const schemaDesc = this.schema._schema;
		const selectedSchemaDesc = {};

		if (typeof altSchemaElements === 'undefined') {
			// No alt. schema elements
			altSchemaElements = {};
		}

		for (k in altSchemaElements) {
			if (altSchemaElements.hasOwnProperty(k)) {
				if (!schemaDesc.hasOwnProperty(k)) {
					throw new Meteor.Error('alt-schema-entry-not-in-schema', k);
				}
			}
		}

		for (k in schemaDesc) {
			if ((!tag) || (schemaDesc[k].subSchemaTags && (schemaDesc[k].subSchemaTags.indexOf(tag) > -1))) {
				selectedSchemaDesc[k] = schemaDesc[k];
				if (k in altSchemaElements) {
					selectedSchemaDesc[k] = altSchemaElements[k];
				}
			}
		}
		return new SimpleSchema(selectedSchemaDesc);
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getCheckableSchema', function getCheckableSchema(prefix) {
		// Gets checkable and dig-in-able schemas
		const schemaDesc = this.schemaDescription;
		if (typeof prefix === 'undefined') {
			prefix = '';
		}

		const schemaItems = _.map(schemaDesc, (v, k) => k);
		schemaItems.sort();
		const obj = {};

		_.forEach(schemaItems, (field) => {
			const bks = field.split('.');
			let head = obj;
			_.forEach(bks, (f, idx) => {
				if (idx < bks.length - 1) {
					// Traverse
					head = head[(f === '$') ? 0 : f];
				} else {
					// Write something for the first time
					const effectiveField = (head instanceof Array) ? 0 : f;
					if (schemaDesc[field].type === Array) {
						head[effectiveField] = [];
					} else if (schemaDesc[field].type === Object) {
						head[effectiveField] = {};
					} else {
						head[effectiveField] = schemaDesc[field].type;
					}
				}
			});
		});

		let ret = obj;
		if (prefix !== '') {
			prefix.split('.').forEach((f) => {
				if (!!ret) {
					if ((f === '*') || (f === '$')) {
						ret = ret[0];
					} else {
						ret = ret[f];
					}
				}
			});
		}
		return ret;
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'filterWithTopLevelSchema', function filterWithTopLevelSchema(o, callFunctions, altSchemaElements, tag) {
		// If elements of o are functions, call without parameters
		callFunctions = !!callFunctions;

		const selectedSchema = ConstructorFunction.getModifiedSchema(altSchemaElements, tag);
		const selectedSchemaDesc = selectedSchema._schema;
		const filteredObject = {};
		for (const field in selectedSchemaDesc) {
			if (callFunctions && _.isFunction(o[field])) {
				filteredObject[field] = o[field]();
			} else {
				filteredObject[field] = o[field];
			}
		}
		return {
			selectedSchema: selectedSchema,
			filteredObject: filteredObject
		};
	});


	////////////////////////////////////////////////////////////
	// Publications
	////////////////////////////////////////////////////////////
	const __publicationList = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'publications', __publicationList);
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makePublication', function makePublication(pubName, _options) {
		if (!_options) {
			_options = {};
		}
		if (typeof __publicationList[pubName] !== 'undefined') {
			throw new Meteor.Error('publication-already-exists', pubName);
		}
		_options = _.extend({
			unblock: false,
			selector: {},
			selectOptions: {},
			alternativeAuthFunction: null,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);
		if (Meteor.isServer) {
			Meteor.publish(pubName, function() {
				if (_options.unblock) {
					this.unblock();
				}
				if (_.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction(this.userId) : options.globalAuthFunction(this.userId)) {
					return collection.find(_options.selector, _options.selectOptions);
				} else {
					this.ready();
					throw new Meteor.Error('unauthorized');
				}
			});

			// rate limit
			applyRateLimitingToSpecificInstance(pubName, 'subscription', _options, options);
		}
		// Add default pubName
		if (Object.keys(__publicationList).length === 0) {
			PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'defaultPublication', pubName);
		}
		__publicationList[pubName] = _options;
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makePublication_getById', function makePublicationGetId(pubName, _options) {
		if (!_options) {
			_options = {};
		}
		if (typeof __publicationList[pubName] !== 'undefined') {
			throw new Meteor.Error('publication-already-exists', pubName);
		}
		_options = _.extend({
			unblock: false,
			idField: '_id',
			selectOptions: {},
			alternativeAuthFunction: null,
			rateLimit: null,
			rateLimitInterval: null,
		}, _options);
		if (Meteor.isServer) {
			Meteor.publish(pubName, function(id) {
				check(id, String);
				if (_options.unblock) {
					this.unblock();
				}
				if (_.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction(this.userId, id) : options.globalAuthFunction(this.userId, id)) {
					return collection.find(_.object([
						[_options.idField, id]
					]), _options.selectOptions);
				} else {
					this.ready();
					throw new Meteor.Error('unauthorized');
				}
			});

			// rate limit
			applyRateLimitingToSpecificInstance(pubName, 'subscription', _options, options);
		}
		// Add default pubName by Id
		if (_.map(__publicationList, x => x).length === 0) {
			PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'defaultPublication_byId', pubName);
		}
		__publicationList[pubName] = _options;
	});


	////////////////////////////////////////////////////////////
	// Methods
	////////////////////////////////////////////////////////////
	const allMethods = {};
	const addMethods = {};
	const updateMethods = {};
	const removeMethods = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'allMethods', allMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'addMethods', addMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'updateMethods', updateMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'removeMethods', removeMethods);

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_add', function makeMethodAdd(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			unblock: false,
			entryPrefix: 'add',
			withParams: false,
			field: '',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);
		_options.field = _options.field.split('.')[0];

		if (typeof _options.entryName === 'undefined') {
			_options.entryName = _options.entryPrefix + (_options.field === '' ? '' : `-${_options.field}`);
		}

		const methodName = (_options.field === '') ? `${options.methodPrefix}${_options.entryPrefix}` : `${options.methodPrefix}${_options.field}/${_options.entryPrefix}`;
		if (typeof allMethods[_options.entryName] !== 'undefined') {
			throw new Meteor.Error('entry-name-already-exists', `${_options.entryName} for ${methodName}`);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		const schema = ConstructorFunction.getCheckableSchema();
		if ((_options.field !== '') && (!(schema[_options.field] instanceof Array))) {
			throw new Meteor.Error('not-document-or-top-level-array', _options.field);
		}

		let method;
		let _schema;
		if (_options.field === '') {
			if (!_options.withParams) {
				// add default document to collection
				_schema = [];
				method = function() {
					if (_options.unblock) {
						this.unblock();
					}
					const doc = ConstructorFunction.getObjectWithDefaultValues();
					return collection.insert(doc);
				};
			} else {
				// add document (passed in) to collection
				_schema = [String, schema];
				method = function(id, doc) {
					if (_options.unblock) {
						this.unblock();
					}
					return collection.insert(doc);
				};
			}
		} else {
			if (!_options.withParams) {
				// add default sub-document to array field
				_schema = [String];
				method = function(id) {
					if (_options.unblock) {
						this.unblock();
					}
					const subDoc = ConstructorFunction.getObjectWithDefaultValues(`${_options.field}.$.`);
					return collection.update(id, {
						$push: _.object([
							[_options.field, subDoc]
						])
					});
				};
			} else {
				// add sub-document (passed in) to array field
				_schema = [String, schema[_options.field][0]];
				method = function(id, subDoc) {
					if (_options.unblock) {
						this.unblock();
					}
					return collection.update(id, {
						$push: _.object([
							[_options.field, subDoc]
						])
					});
				};
			}
		}

		CollectionTools.createMethod({
			name: methodName,
			schema: _schema,
			authenticationCheck: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
			// unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
			method: method,
			useRestArgs: false,
			finishers: _options.finishers,
			serverOnly: _options.serverOnly,
			rateLimit: _options.rateLimit,
			rateLimitInterval: _options.rateLimitInterval,
		});

		allMethods[_options.entryName] = methodName;
		addMethods[_options.entryName] = methodName;
		return _options.entryName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_remove', function makeMethodRemove(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			unblock: false,
			entryPrefix: 'remove',
			field: '',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);
		_options.field = _options.field.split('.')[0];

		if (typeof _options.entryName === 'undefined') {
			_options.entryName = _options.entryPrefix + (_options.field === '' ? '' : `-${_options.field}`);
		}

		const methodName = options.methodPrefix + _options.entryName;
		if (typeof allMethods[_options.entryName] !== 'undefined') {
			throw new Meteor.Error('entry-name-already-exists', `${_options.entryName} for ${methodName}`);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		let method;
		let schema;
		if (_options.field === '') {
			// remove document
			schema = [String];
			method = function(id) {
				if (_options.unblock) {
					this.unblock();
				}
				return collection.remove(id);
			};
		} else if (_.isArray(ConstructorFunction.getCheckableSchema()[_options.field])) {
			// remove array entry
			schema = [String, Match.isNonNegativeInteger];
			// eslint-disable-next-line consistent-return
			method = function(id, idx) {
				if (_options.unblock) {
					this.unblock();
				}
				const subDoc = collection.findOne(id, {
					fields: _.object([
						[_options.field, 1]
					])
				});
				if (!!subDoc) {
					const arr = subDoc[_options.field];
					if (arr.length > idx) {
						arr.splice(idx, 1);
						return collection.update(id, {
							$set: _.object([
								[_options.field, arr]
							])
						});
					}
				}
			};
		} else {
			// unset entire field
			schema = [String];
			method = function(id) {
				if (_options.unblock) {
					this.unblock();
				}
				return collection.update(id, {
					$unset: _.object([
						[_options.field, '']
					])
				});
			};
		}

		CollectionTools.createMethod({
			name: methodName,
			schema: schema,
			authenticationCheck: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
			// unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
			method: method,
			useRestArgs: false,
			finishers: _options.finishers,
			serverOnly: _options.serverOnly,
			rateLimit: _options.rateLimit,
			rateLimitInterval: _options.rateLimitInterval,
		});

		allMethods[_options.entryName] = methodName;
		removeMethods[_options.field] = methodName;
		return _options.entryName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_updater', function makeMethodUpdater(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			unblock: false,
			field: '',
			type: Function,
			entryPrefix: 'update',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);

		if (typeof _options.entryName === 'undefined') {
			_options.entryName = _options.entryPrefix + (_options.field === '' ? '' : `-${_options.field}`);
		}

		const methodName = `${options.methodPrefix}${_options.entryPrefix}-${_options.field}`;
		if (_options.field === '') {
			throw new Meteor.Error('field-not-specified');
		}
		if (typeof allMethods[_options.entryName] !== 'undefined') {
			throw new Meteor.Error('method-for-field-already-exists', `${_options.field} for ${methodName}`);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		if (_debugMode) {
			console.log(`[CollectionTools|create-updateMethod|${_options.field}]`, _options.type);
		}

		CollectionTools.createMethod({
			name: methodName,
			schema: [String, _options.type, [Match.OneOf(Number, String)]],
			authenticationCheck: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
			// unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
			method: function(id, value, ...args) {
				if (_options.unblock) {
					this.unblock();
				}
				if (_debugMode) {
					console.log(`[CollectionTools|updateMethod|${_options.field}] id: ${id}; value:`, value, '; args:', args);
				}
				const fs = _options.field.split('.');
				let argIdx = 0;
				fs.forEach((f, idx) => {
					if (f === '*') {
						fs[idx] = args[argIdx];
						argIdx++;
					}
				});
				const thisField = fs.join('.');
				const setter = {
					$set: _.object([
						[thisField, value]
					])
				};
				return collection.update(id, setter);
			},
			useRestArgs: true,
			finishers: _options.finishers,
			serverOnly: _options.serverOnly,
			rateLimit: _options.rateLimit,
			rateLimitInterval: _options.rateLimitInterval,
		});

		allMethods[_options.entryName] = methodName;
		updateMethods[_options.field] = methodName;
		return methodName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethods_generalUpdater', function makeMethodsGeneralUpdater(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			unblock: false,
			entryName: 'general-update',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);

		const methodName = options.methodPrefix + _options.entryName;
		if (typeof allMethods[_options.entryName] !== 'undefined') {
			throw new Meteor.Error('method-for-field-already-exists', `${_options.field} for ${methodName}`);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		CollectionTools.createMethod({
			name: methodName,
			schema: [String, Object],
			authenticationCheck: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
			// unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
			method: function(id, updates) {
				if (_options.unblock) {
					this.unblock();
				}
				_.forEach(updates, (v, f) => {
					const typeInfo = ConstructorFunction.getTypeInfo(f);
					if (!typeInfo) {
						throw new Meteor.Error('invalid-field', f);
					}
					check(v, typeInfo.type);
				});
				this.unblock();
				return collection.update(id, {
					$set: updates
				});
			},
			finishers: _options.finishers,
			serverOnly: _options.serverOnly,
			rateLimit: _options.rateLimit,
			rateLimitInterval: _options.rateLimitInterval,
		});

		allMethods[_options.entryName] = methodName;
		return methodName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeGenericMethod_updaters', function makeGenericMethodUpdaters(_options = {}) {
		_options = _.extend({
			unblock: false,
			entryPrefix: 'update-gen',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
			considerFieldsByName: null,
			considerFieldsByFieldPrefix: null,
			excludeFieldsByName: [],
			excludeFieldsByFieldPrefix: [],
			primitiveTypesOnly: false,
			primitiveTypesIncludesDate: false,
		}, _options);

		const _schemaDesc = ConstructorFunction._schemaDescription;

		if (_debugMode) {
			console.log('[CollectionTools|makeGenericMethod_updaters] _options:', _options);
		}

		_.forEach(_schemaDesc, function createRelevantMeteorMethods(v, f) {
			// if (_debugMode) {
			// 	console.log(`[CollectionTools|makeGenericMethod_updaters] field: ${f}`);
			// }

			let considerField = true;
			if (_.isArray(_options.considerFieldsByName) || _.isArray(_options.considerFieldsByFieldPrefix)) {
				considerField = (_options.considerFieldsByName || []).indexOf(f) > -1;
				_.forEach(_options.considerFieldsByFieldPrefix || [], function testForInclusion(inclusionPrefix) {
					if (inclusionPrefix === f.substr(0, inclusionPrefix.length)) {
						considerField = true;
					}
				});
			}

			if (considerField) {
				if (_debugMode) {
					// console.log('[CollectionTools|makeGenericMethod_updaters] considering field:', f);
				}

				if (_options.excludeFieldsByName.indexOf(f) > -1) {
					if (_debugMode) {
						// console.log('[CollectionTools|makeGenericMethod_updaters] excluding field by name:', f);
					}
					return;
				}
				let createMethod = true;
				_.forEach(_options.excludeFieldsByFieldPrefix, function testForExclusion(exclusionPrefix) {
					if (exclusionPrefix === f.substr(0, exclusionPrefix.length)) {
						if (_debugMode) {
							// console.log('[CollectionTools|makeGenericMethod_updaters] excluding field by prefix:', f);
						}
						createMethod = false;
					}
				});
				if (!createMethod) {
					return;
				}

				if (_options.primitiveTypesOnly) {
					const primitivesList = [String, Boolean, Number];
					if (_options.primitiveTypesIncludesDate) {
						primitivesList.push(Date);
					}
					if (primitivesList.indexOf(v.type) === -1) {
						if (_debugMode) {
							// console.log('[CollectionTools|makeGenericMethod_updaters] excluding field (not primitive):', f);
						}
						return;
					}
				}

				if (f === '_id') {
					if (_debugMode) {
						console.log('[CollectionTools|makeGenericMethod_updaters] excluding _id');
					}
					return;
				} else {
					ConstructorFunction.makeMethod_updater({
						unblock: _options.unblock,
						field: f,
						type: ConstructorFunction.getCheckableSchema(f),
						entryPrefix: _options.entryPrefix,
						alternativeAuthFunction: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
						finishers: _options.finishers,
						serverOnly: _options.serverOnly,
					});
				}
			}
		});
	});

	return ConstructorFunction;
});

export { CollectionTools };
