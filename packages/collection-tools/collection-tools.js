/* global SimpleSchema: true */
/* global check: true */
/* global Match: true */
/* global DDPRateLimiter: true */

/* global CollectionTools: true */
/* global PackageUtilities: true */

SimpleSchema.extendOptions({
	subSchemaTags: Match.Optional([String])
});

var __ct = function CollectionTools() {};

CollectionTools = new __ct();

function filterObject(o, getCheckableSchemaFunc, ignoreOffSchemaFields, prefix) {
	if (typeof prefix === "undefined") {
		prefix = "";
	}
	var checkableSchema = getCheckableSchemaFunc(prefix);

	if (_.isArray(checkableSchema)) {
		if (_.isArray(o)) {
			if ((checkableSchema.length === 1) && (_.isFunction(checkableSchema[0]))) {
				return o;
			} else {
				return o.map(item => filterObject(item, getCheckableSchemaFunc, ignoreOffSchemaFields, prefix === "" ? '$' : (prefix + ".$")));
			}
		} else {
			if (ignoreOffSchemaFields) {
				return o;
			} else {
				throw new Meteor.Error('invalid-field', prefix);
			}
		}
	}

	var thisAsObj = {};
	_.forEach(o, function(v, f) {
		if (checkableSchema.hasOwnProperty(f)) {
			var typeInfo = checkableSchema[f];
			if (_.isFunction(typeInfo)) {
				thisAsObj[f] = o[f];
			} else if (_.isObject(typeInfo) && _.isDate(o[f])) {
				thisAsObj[f] = o[f];
			} else if (_.isObject(typeInfo) && _.isObject(o[f])) {
				thisAsObj[f] = filterObject(o[f], getCheckableSchemaFunc, ignoreOffSchemaFields, prefix === "" ? f : (prefix + '.' + f));
			} else {
				thisAsObj[f] = o[f];
				// possibly a Match type... can't do instance checking...
				// throw new Meteor.Error('invalid-type-info', prefix === "" ? f : (prefix + '.' + f));
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

var baseConstructorPrototype = {
	_asPlainObject: function _asPlainObject(ignoreOffSchemaFields) {
		return filterObject(this, _.bind(this.constructor.getCheckableSchema, this.constructor), ignoreOffSchemaFields);
	},
	validate: function validate(useCheck, ignoreOffSchemaFields) {
		var thisAsPlainObject = this._asPlainObject(!!ignoreOffSchemaFields);
		if (!!useCheck) {
			return check(thisAsPlainObject, this.constructor.schema);
		} else {
			var ssContext = this.constructor.schema.newContext();
			var result = ssContext.validate(thisAsPlainObject);
			return {
				result: result,
				context: ssContext
			};
		}
	},
};


function applyRateLimitItem(name, type, rateLimit, rateLimitInterval) {
	if (typeof rateLimitInterval === "undefined") {
		rateLimitInterval = 1000;
	}
	if (typeof rateLimitInterval === "undefined") {
		rateLimitInterval = 1000;
	}
	DDPRateLimiter.addRule({
		type: type,
		name: name,
		connectionId: () => true,
	}, rateLimit, rateLimitInterval);
}

function applyRateLimiting_SpecificInstance(name, type, options, defaultOptions) {
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
var __allMethodNames = [];
PackageUtilities.addImmutablePropertyFunction(CollectionTools, 'createMethod', function createMethod(options) {
	options = _.extend({
		name: "some-method-name",
		schema: {},
		authenticationCheck: (userId, id) => true,
		unauthorizedMessage: (opts, userId, id) => "unauthorized for " + userId + ": " + opts.name,
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

	function doWork_viaApply(args) {
		// authenticate
		if (!_.isFunction(options.authenticationCheck) || options.authenticationCheck(Meteor.userId(), args[0])) {
			// run operation
			var ret = options.method.apply(this, args);

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
	var method;
	if (_.isArray(options.schema)) {
		// The usual methods with argument lists
		method = function() {
			// check arguments
			check(arguments, Match.Any);

			var args = _.toArray(arguments);
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
				var restArgs = args.splice(options.schema.length - 1);
				args.push(restArgs);
			}
			_.forEach(args, function(v, idx) {
				// check all properly
				check(v, options.schema[idx]);
			});

			// do work: 
			return _.bind(doWork_viaApply, this)(args);
		};
	} else {
		// via destructuring...
		method = function(args) {
			// check arguments
			check(args, new SimpleSchema(options.schema));

			// do work
			return _.bind(doWork_viaApply, this)([args]);
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
		collectionName: "",
		constructorName: "",
		setRestrictiveAllowDenyDefaults: true,
		schema: {},
		prototypeExtension: {},
		constructorExtension: {},
		transform: x => x,
		globalAuthFunction: (userId, documentId) => true,
		globalAuthFunction_fromConstructorAndCollection: null,
		methodPrefix: 'collections/',
		defaultRateLimit: 10,
		defaultRateLimitInterval: 1000,
	}, options, false);
	if (options.collectionName === "") {
		options.collectionName = null;
	}
	if (options.methodPrefix === "") {
		var _cNSplit = String(options.collectionName).split('_');
		var _cn = (_cNSplit.length > 1) ? _cNSplit.splice(1).join('_') : _cNSplit[0];
		options.methodPrefix = 'collections/' + _cn + '/';
	}

	if (!_.isFunction(options.transform)) {
		throw new Meteor.Error("invalid-transform");
	}

	////////////////////////////////////////////////////////////
	// Basic Constructor
	////////////////////////////////////////////////////////////
	var ConstructorFunction = (function() {
		// for nice constructor names
		var name = (!!options.constructorName) ? options.constructorName : options.collectionName;
		var fn;
		var s = 'fn = function ';
		var constructorName = '';
		Array.prototype.forEach.call(name, function(c, idx) {
			if ((c === '_') || (('a' <= c) && (c <= 'z')) || (('A' <= c) && (c <= 'Z')) || ((idx !== 0) && ('0' <= c) && (c <= '9'))) {
				s += c;
				constructorName += c;
			}
		});
		s += '(doc) {' + '\n';
		if (constructorName.length > 0) {
			// add protection in the form of...
			// if (!(this instanceof constructor)) { throw "improper-constructor-invocation"; }'
			s += '    if (!(this instanceof ' + constructorName + ')) { throw "improper-constructor-invocation"; }' + '\n';
		}
		s += '    return _.extend(this, options.transform.call(this, doc));' + '\n';
		s += '}' + '\n';
		// jshint evil: true
		eval(s);
		// jshint evil: false
		return fn;
	})();
	// var ConstructorFunction = function(doc) {
	// 	return _.extend(this, options.transform(doc));
	// };


	////////////////////////////////////////////////////////////
	// The Collection
	////////////////////////////////////////////////////////////
	var collection = new Mongo.Collection(options.collectionName, {
		transform: function(doc) {
			return new ConstructorFunction(doc);
		}
	});
	PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'collection', collection);
	if (!!options.setRestrictiveAllowDenyDefaults) {
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
	_.extend(ConstructorFunction,
		_.object(["find", "findOne", "insert", "update", "remove", "upsert"].map(function(fnName) {
			// Mongo.Collection methods transposed and suitably named
			var fn;
			// jshint evil: true
			eval("fn = function " + fnName + "() { /* " + fnName + " from Mongo.Collection */ return Mongo.Collection.prototype[fnName].apply(this.collection, _.toArray(arguments));};");
			// jshint evil: false
			return [fnName, fn];
		})), {
			innerJoin: function innerJoin(leftData, joinFields, mapRightFields = {}, selector = {}, options = {}, excludeFields = ['_id'], includeFields = null) {
				check(leftData, Array);

				check(joinFields, [{
					leftField: String,
					rightField: String,
				}]);

				check(mapRightFields, Object);

				check(selector, Object);
				check(options, Object);

				check(excludeFields, [String]);
				check(includeFields, Match.OneOf(null, [String]));

				var self = this;

				joinFields.forEach(function checkFields(fieldsDesc) {
					if (!self.schemaDescription.hasOwnProperty(fieldsDesc.rightField)) {
						throw new Meteor.Error("no-such-field-here--join-fields", fieldsDesc.rightField);
					}
				});

				_.forEach(mapRightFields, function checkFieldMapItem(mappedFieldName, field) {
					if (!self.schemaDescription.hasOwnProperty(field)) {
						throw new Meteor.Error("no-such-field-here--field-map", field);
					}
				});

				var resultSet = [];

				leftData.forEach(function(item) {
					var rightSelector = _.extend({}, selector);
					joinFields.forEach(function(fieldsDesc) {
						// build selector
						_.extend(rightSelector, _.object([
							[fieldsDesc.rightField, item[fieldsDesc.leftField]]
						]));
					});
					item = _.object(_.map(item, function(v, f) {
						return [f, v];
					}));

					resultSet = resultSet.concat(self.find(rightSelector, options)
						.map(x => x._asPlainObject())
						.map(function(rItem) {
							excludeFields.forEach(function(field) {
								delete rItem[field];
							});
							if (includeFields !== null) {
								rItem = _.object(includeFields
									.filter(f => rItem.hasOwnProperty(f))
									.map(f => [mapRightFields.hasOwnProperty(f) ? mapRightFields[f] : f, rItem[f]])
								);
							} else {
								rItem = _.object(_.map(rItem, (v, f) => [mapRightFields.hasOwnProperty(f) ? mapRightFields[f] : f, v]));
							}
							return _.extend({}, item, rItem);
						})
					);
				});

				return resultSet;
			},
			extendById: function extendById(data, options) {
				check(data, Array);
				options = _.extend({
					idField: "_id",
					oneItemOnly: true,
					newFieldName: null
				}, options);
				check(options, {
					dataField: String,
					idField: String,
					oneItemOnly: Boolean,
					newFieldName: Match.OneOf(String, null)
				});
				var self = this;

				data.forEach(function(item) {
					if (item.hasOwnProperty(options.dataField)) {
						var itm;
						if (_.isArray(item[options.dataField])) {
							if (options.idField === "_id") {
								itm = item[options.dataField].map(id => self.findOne(id));
							} else {
								itm = item[options.dataField].map(id => self.find(_.object([
									[options.idField, id]
								])).fetch());
								if (options.oneItemOnly) {
									itm = itm.map(x => x.shift());
								}
							}
						} else {
							if (options.dataField === "_id") {
								itm = self.findOne(item[options.dataField]);
							} else {
								itm = self.find(_.object([
									[options.idField, item[options.dataField]]
								])).fetch();
								if (options.oneItemOnly) {
									itm = itm.shift();
								}
							}
						}

						if (options.newFieldName === null) {
							item[options.dataField] = itm;
						} else {
							item[options.newFieldName] = itm;
						}
					}
				});
				return data;
			}
		}, {
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
				var count = 0;
				console.log('**** LOG ALL (' + this.collection._name + ') ****');
				_.forEach(this.find(selector, {
					fields: fields,
					sort: sortDef
				}).fetch(), function(v, k) {
					console.log(k + ":", v);
					count += 1;
				});
				console.log('**** ' + count + ' items ****');
			}
		},
		_.isFunction(options.constructorExtension) ? options.constructorExtension(ConstructorFunction, collection) : options.constructorExtension);

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

		var prototypeExtension = _.isFunction(options.prototypeExtension) ? options.prototypeExtension(ConstructorFunction, collection) : options.prototypeExtension;
		Object.getOwnPropertyNames(prototypeExtension).forEach(function(key) {
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
		return _.object(_.map(this.schemaDescription, function(v, k) {
			var kk = k;
			while (kk.indexOf('$') !== -1) {
				kk = kk.replace('$', '*');
			}
			return [kk, v];
		}));
	});
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getTypeInfo', function getTypeInfo(fieldSpec) {
		var match;
		var fieldSpecSplit = fieldSpec.split(".");
		_.forEach(ConstructorFunction._schemaDescription, function(desc, f) {
			if (!!match) {
				return;
			}
			var f_split = f.split('.');
			if (f_split.length !== fieldSpecSplit.length) {
				return;
			}

			for (var k = 0; k < f_split.length; k++) {
				// give wildcards a pass
				if ((f_split[k] !== fieldSpecSplit[k]) && (f_split[k] !== "*")) {
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
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getObjectWithDefaultValues', function getObjectWithDefaultValues(prefix) {
		var obj = {};
		if (!prefix) {
			prefix = "";
		}

		// create schema limited to the prefix
		var schemaDesc = _.object(
			_.map(
				this.schemaDescription, (v, k) => [k, v]
			)
			.filter(x => x[0].substr(0, prefix.length) === prefix)
			.map(x => [x[0].substr(prefix.length), x[1]])
		);

		_.forEach(schemaDesc, function(item, key) {
			if (key.indexOf('.') === -1) {
				// Top Level only!!! Everything should be there.
				if ((!item.optional) && (typeof item.defaultValue === "undefined")) {
					throw new Meteor.Error('default-value-not-found', key);
				}

				if (typeof item.defaultValue !== "undefined") {
					obj[key] = _.isFunction(item.defaultValue) ? item.defaultValue() : item.defaultValue;
				}
			}
		});
		return (prefix === "") ? new ConstructorFunction(obj) : obj;
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getModifiedSchema', function getModifiedSchema(altSchemaElements, tag) {
		var k;
		var schemaDesc = this.schema._schema;
		var selectedSchemaDesc = {};

		if (typeof altSchemaElements === "undefined") {
			// No alt. schema elements
			altSchemaElements = {};
		}

		for (k in altSchemaElements) {
			if (altSchemaElements.hasOwnProperty(k)) {
				if (!schemaDesc.hasOwnProperty(k)) {
					throw new Meteor.Error("alt-schema-entry-not-in-schema", k);
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
		var schemaDesc = this.schemaDescription;
		if (typeof prefix === "undefined") {
			prefix = "";
		}

		var schemaItems = _.map(schemaDesc, (v, k) => k);
		schemaItems.sort();
		var obj = {};

		_.forEach(schemaItems, function(field) {
			var bks = field.split('.');
			var head = obj;
			_.forEach(bks, function(f, idx) {
				if (idx < bks.length - 1) {
					// Traverse
					head = head[(f === "$") ? 0 : f];
				} else {
					// Write something for the first time
					var eff_f = (head instanceof Array) ? 0 : f;
					if (schemaDesc[field].type === Array) {
						head[eff_f] = [];
					} else if (schemaDesc[field].type === Object) {
						head[eff_f] = {};
					} else {
						head[eff_f] = schemaDesc[field].type;
					}
				}
			});
		});

		var ret = obj;
		if (prefix !== "") {
			prefix.split(".").forEach(function(f) {
				if (!!ret) {
					if ((f === "*") || (f === "$")) {
						ret = ret[0];
					} else {
						ret = ret[f];
					}
				}
			});
		}
		return ret;
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'filterWithTopLevelSchema', function filterWithTopLevelSchema(o, call_functions, altSchemaElements, tag) {
		// If elements of o are functions, call without parameters
		call_functions = !!call_functions;

		var selectedSchema = ConstructorFunction.getModifiedSchema(altSchemaElements, tag);
		var selectedSchemaDesc = selectedSchema._schema;
		var filteredObject = {};
		for (var k in selectedSchemaDesc) {
			if (call_functions && _.isFunction(o[k])) {
				filteredObject[k] = o[k]();
			} else {
				filteredObject[k] = o[k];
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
	var __publicationList = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'publications', __publicationList);
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makePublication', function makePublication(pubName, _options) {
		if (!_options) {
			_options = {};
		}
		if (typeof __publicationList[pubName] !== "undefined") {
			throw new Meteor.Error('publication-already-exists', pubName);
		}
		_options = _.extend({
			selector: {},
			selectOptions: {},
			alternativeAuthFunction: null,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);
		if (Meteor.isServer) {
			Meteor.publish(pubName, function() {
				this.unblock();
				if (_.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction(this.userId) : options.globalAuthFunction(this.userId)) {
					return collection.find(_options.selector, _options.selectOptions);
				} else {
					this.ready();
					throw new Meteor.Error('unauthorized');
				}
			});

			// rate limit
			applyRateLimiting_SpecificInstance(pubName, 'subscription', _options, options);
		}
		// Add default pubName
		if (Object.keys(__publicationList).length === 0) {
			PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'defaultPublication', pubName);
		}
		__publicationList[pubName] = _options;
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makePublication_getById', function makePublication_getId(pubName, _options) {
		if (!_options) {
			_options = {};
		}
		if (typeof __publicationList[pubName] !== "undefined") {
			throw new Meteor.Error('publication-already-exists', pubName);
		}
		_options = _.extend({
			idField: "_id",
			selectOptions: {},
			alternativeAuthFunction: null,
			rateLimit: null,
			rateLimitInterval: null,
		}, _options);
		if (Meteor.isServer) {
			Meteor.publish(pubName, function(id) {
				check(id, String);
				this.unblock();
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
			applyRateLimiting_SpecificInstance(pubName, 'subscription', _options, options);
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
	var allMethods = {};
	var addMethods = {};
	var updateMethods = {};
	var removeMethods = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'allMethods', allMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'addMethods', addMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'updateMethods', updateMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'removeMethods', removeMethods);

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_add', function makeMethod_add(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			entryPrefix: 'add',
			withParams: false,
			field: "",
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);
		_options.field = _options.field.split('.')[0];

		if (typeof _options.entryName === "undefined") {
			_options.entryName = _options.entryPrefix + (_options.field === "" ? "" : "-" + _options.field);
		}

		var methodName = (_options.field === '') ? options.methodPrefix + _options.entryPrefix : options.methodPrefix + _options.field + '/' + _options.entryPrefix;
		if (typeof allMethods[_options.entryName] !== "undefined") {
			throw new Meteor.Error('entry-name-already-exists', _options.entryName + ' for ' + methodName);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		var schema = ConstructorFunction.getCheckableSchema();
		if ((_options.field !== '') && (!(schema[_options.field] instanceof Array))) {
			throw new Meteor.Error('not-document-or-top-level-array', _options.field);
		}

		var method;
		var _schema;
		if (_options.field === "") {
			if (!_options.withParams) {
				// add default document to collection
				_schema = [];
				method = function() {
					this.unblock();
					var doc = ConstructorFunction.getObjectWithDefaultValues();
					return collection.insert(doc);
				};
			} else {
				// add document (passed in) to collection
				_schema = [String, schema];
				method = function(id, doc) {
					this.unblock();
					return collection.insert(doc);
				};
			}
		} else {
			if (!_options.withParams) {
				// add default sub-document to array field
				_schema = [String];
				method = function(id) {
					this.unblock();
					var subDoc = ConstructorFunction.getObjectWithDefaultValues(_options.field + '.$.');
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
					this.unblock();
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_remove', function makeMethod_remove(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			entryPrefix: 'remove',
			field: "",
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);
		_options.field = _options.field.split('.')[0];

		if (typeof _options.entryName === "undefined") {
			_options.entryName = _options.entryPrefix + (_options.field === "" ? "" : "-" + _options.field);
		}

		var methodName = options.methodPrefix + _options.entryName;
		if (typeof allMethods[_options.entryName] !== "undefined") {
			throw new Meteor.Error('entry-name-already-exists', _options.entryName + ' for ' + methodName);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		var method;
		var schema;
		if (_options.field === "") {
			// remove document
			schema = [String];
			method = function(id) {
				this.unblock();
				return collection.remove(id);
			};
		} else if (_.isArray(ConstructorFunction.getCheckableSchema()[_options.field])) {
			// remove array entry
			schema = [String, Match.isNonNegativeInteger];
			method = function(id, idx) {
				this.unblock();
				var subDoc = collection.findOne(id, {
					fields: _.object([
						[_options.field, 1]
					])
				});
				if (!!subDoc) {
					var arr = subDoc[_options.field];
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
				this.unblock();
				return collection.update(id, {
					$unset: _.object([
						[_options.field, ""]
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethods_updater', function makeMethods_updater(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			field: '',
			type: Function,
			entryPrefix: 'update',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);

		if (typeof _options.entryName === "undefined") {
			_options.entryName = _options.entryPrefix + (_options.field === "" ? "" : "-" + _options.field);
		}

		var methodName = options.methodPrefix + _options.entryPrefix + "-" + _options.field;
		if (_options.field === "") {
			throw new Meteor.Error('field-not-specified');
		}
		if (typeof allMethods[_options.entryName] !== "undefined") {
			throw new Meteor.Error('method-for-field-already-exists', _options.field + ' for ' + methodName);
		}
		if (_.map(allMethods, x => x).indexOf(methodName) !== -1) {
			throw new Meteor.Error('method-already-exists', methodName);
		}

		CollectionTools.createMethod({
			name: methodName,
			schema: [String, _options.type, [Match.OneOf(Number, String)]],
			authenticationCheck: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
			// unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
			method: function(id, value, ...args) {
				var fs = _options.field.split('.');
				var argIdx = 0;
				fs.forEach(function(f, idx) {
					if (f === "*") {
						fs[idx] = args[argIdx];
						argIdx++;
					}
				});
				var thisField = fs.join('.');
				var setter = {
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethods_generalUpdater', function makeMethods_generalUpdater(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			entryName: 'general-update',
			alternativeAuthFunction: null,
			finishers: [],
			serverOnly: false,
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);

		var methodName = options.methodPrefix + _options.entryName;
		if (typeof allMethods[_options.entryName] !== "undefined") {
			throw new Meteor.Error('method-for-field-already-exists', _options.field + ' for ' + methodName);
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
				_.forEach(updates, function(v, f) {
					var typeInfo = ConstructorFunction.getTypeInfo(f);
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeGenericMethod_updaters', function makeGenericMethod_updaters(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
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
		}, _options);

		var _schemaDesc = ConstructorFunction._schemaDescription;
		_.forEach(_schemaDesc, function(v, f) {
			var considerField = true;
			if (_.isArray(_options.considerFieldsByName) || _.isArray(_options.considerFieldsByFieldPrefix)) {
				considerField = (_options.considerFieldsByName || []).indexOf(f) === -1;
				_.forEach((_options.considerFieldsByFieldPrefix || []), function(inclusionPrefix) {
					if (inclusionPrefix === f.substr(0, inclusionPrefix.length)) {
						considerField = false;
					}
				});
			}

			if (considerField) {
				var createMethod = _options.excludeFieldsByName.indexOf(f) === -1;
				_.forEach(_options.excludeFieldsByFieldPrefix, function(exclusionPrefix) {
					if (exclusionPrefix === f.substr(0, exclusionPrefix.length)) {
						createMethod = false;
					}
				});

				if (createMethod) {
					if (f !== "_id") {
						ConstructorFunction.makeMethods_updater({
							field: f,
							type: ConstructorFunction.getCheckableSchema(f),
							entryPrefix: _options.entryPrefix,
							alternativeAuthFunction: _.isFunction(_options.alternativeAuthFunction) ? _options.alternativeAuthFunction : options.globalAuthFunction,
							finishers: _options.finishers,
							serverOnly: _options.serverOnly,
						});
					}
				}
			}
		});
	});

	return ConstructorFunction;
});