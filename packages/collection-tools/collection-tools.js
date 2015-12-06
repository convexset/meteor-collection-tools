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

function filterObject(o, getCheckableSchemaFunc, ignore_off_schema_fields, prefix) {
	if (typeof prefix === "undefined") {
		prefix = "";
	}
	var checkableSchema = getCheckableSchemaFunc(prefix);

	if (_.isArray(checkableSchema)) {
		if (_.isArray(o)) {
			if ((checkableSchema.length === 1) && (_.isFunction(checkableSchema[0]))) {
				return o;
			} else {
				return o.map(item => filterObject(item, getCheckableSchemaFunc, ignore_off_schema_fields, prefix === "" ? '$' : (prefix + ".$")));
			}
		} else {
			if (ignore_off_schema_fields) {
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
			} else if (_.isObject(typeInfo) && _.isObject(o[f])) {
				thisAsObj[f] = filterObject(o[f], getCheckableSchemaFunc, ignore_off_schema_fields, prefix === "" ? f : (prefix + '.' + f));
			} else {
				throw new Meteor.Error('invalid-type-info', prefix === "" ? f : (prefix + '.' + f));
			}
		} else {
			// Keep if in schema or not ignoring off schema fields
			if (!ignore_off_schema_fields) {
				thisAsObj[f] = o[f];
			}
		}
	});
	return thisAsObj;
}
PackageUtilities.addImmutablePropertyFunction(CollectionTools, '_filterObject', filterObject);

var baseConstructorPrototype = {
	_asPlainObject: function _asPlainObject(ignore_off_schema_fields) {
		return filterObject(this, _.bind(this.constructor.getCheckableSchema, this.constructor), ignore_off_schema_fields);
	},
	validate: function validate(ignore_off_schema_fields) {
		var thisAsPlainObject = this._asPlainObject(ignore_off_schema_fields);
		var ssContext = this.constructor.schema.newContext();
		var result = ssContext.validate(thisAsPlainObject);
		return {
			result: result,
			context: ssContext
		};
	},
	validateWithCheck: function validateWithCheck(ignore_off_schema_fields) {
		var thisAsPlainObject = this._asPlainObject(ignore_off_schema_fields);
		return check(thisAsPlainObject, this.constructor.schema);
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


// create method and specify all elements of the method separately
var __allMethodNames = [];
PackageUtilities.addImmutablePropertyFunction(CollectionTools, 'createMethod', function createMethod(options) {
	options = PackageUtilities.updateDefaultOptionsWithInput({
		name: "some-method-name",
		schema: {},
		authenticationCheck: () => true, // (userId) => true,
		unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
		method: () => null,
		simulateNothing: false,
		rateLimit: 10,
		rateLimitInterval: 1000,
	}, options);

	if (__allMethodNames.indexOf(options.name) !== -1) {
		__allMethodNames.push(options.name);
	} else {
		throw new Meteor.Error('repeated-method-name', options.name);
	}

	// method body
	var method = function(...args) {
		// check arguments
		check(args, new SimpleSchema(options.schema));
		this.unblock();

		if ((!options.simulateNothing) || (!Meteor.isSimulation)) {
			// authenticate
			if (options.authenticationCheck(this.userId)) {
				return options.method.apply(args);
			} else {
				throw new Meteor.Error('unauthorized');
			}
		}
	};

	// declare method
	Meteor.methods(_.object([
		[options.name, method]
	]));

	// rate limit
	if (!!options.rateLimit && !!options.rateLimitInterval) {
		applyRateLimitItem(options.name, 'method', options.rateLimit, options.rateLimitInterval);
	}
});

PackageUtilities.addImmutablePropertyFunction(CollectionTools, 'build', function build(options) {

	options = PackageUtilities.updateDefaultOptionsWithInput({
		collectionName: "",
		setRestrictiveAllowDenyDefaults: true,
		schema: {},
		prototypeExtension: {},
		constructorExtension: {},
		transform: x => x,
		globalAuthFunction: () => true,
		methodPrefix: 'collections/',
		defaultRateLimit: 10,
		defaultRateLimitInterval: 1000,
	}, options);
	if (options.collectionName === "") {
		options.collectionName = null;
	}
	if (options.methodPrefix === "") {
		var _cNSplit = String(options.collectionName).split('_');
		var _cn = (_cNSplit.length > 1) ? _cNSplit.splice(1).join('_') : _cNSplit[0];
		options.methodPrefix = 'collections/' + _cn + '/';
	}


	////////////////////////////////////////////////////////////
	// Basic Constructor
	////////////////////////////////////////////////////////////
	var ConstructorFunction = _.extend(function(doc) {
		_.extend(this, options.transform(doc));
	}, options.constructorExtension);


	////////////////////////////////////////////////////////////
	// The Prototype
	////////////////////////////////////////////////////////////
	ConstructorFunction.prototype = _.extend(Object.create(baseConstructorPrototype), {
		constructor: ConstructorFunction,
	}, options.prototypeExtension);


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
				obj[key] = (item.defaultValue instanceof Function) ? item.defaultValue() : item.defaultValue;
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
			if (call_functions && (o[k] instanceof Function)) {
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
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			selector: {},
			selectOptions: {},
			additionalAuthFunction: () => true,
			rateLimit: null,
			rateLimitInterval: null,
		}, _options);
		if (Meteor.isServer) {
			Meteor.publish(pubName, function() {
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					return collection.find(_options.selector, _options.selectOptions);
				} else {
					throw new Meteor.Error('unauthorized');
				}
			});

			// rate limit
			if (!!_options.rateLimit && !!_options.rateLimitInterval) {
				applyRateLimitItem(pubName, 'subscription', _options.rateLimit, _options.rateLimitInterval);
			} else {
				if (!!options.defaultRateLimit && !!options.defaultRateLimitInterval) {
					applyRateLimitItem(pubName, 'subscription', options.defaultRateLimit, options.defaultRateLimitInterval);
				}
			}
		}
		// Add default pubName
		if (_.map(__publicationList, x => x).length === 0) {
			PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'defaultPublication', pubName);
		}
		__publicationList[pubName] = pubName;
	});


	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makePublication_getById', function makePublication_getId(pubName, _options) {
		if (!_options) {
			_options = {};
		}
		if (typeof __publicationList[pubName] !== "undefined") {
			throw new Meteor.Error('publication-already-exists', pubName);
		}
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			idField: "_id",
			selectOptions: {},
			additionalAuthFunction: () => true,
			rateLimit: null,
			rateLimitInterval: null,
		}, _options);
		if (Meteor.isServer) {
			Meteor.publish(pubName, function(id) {
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					return collection.find(_.object([
						[_options.idField, id]
					]), _options.selectOptions);
				} else {
					throw new Meteor.Error('unauthorized');
				}
			});

			// rate limit
			if (!!_options.rateLimit && !!_options.rateLimitInterval) {
				applyRateLimitItem(pubName, 'subscription', _options.rateLimit, _options.rateLimitInterval);
			} else {
				if (!!options.defaultRateLimit && !!options.defaultRateLimitInterval) {
					applyRateLimitItem(pubName, 'subscription', options.defaultRateLimit, options.defaultRateLimitInterval);
				}
			}
		}
		// Add default pubName by Id
		if (_.map(__publicationList, x => x).length === 0) {
			PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'defaultPublication_byId', pubName);
		}
		__publicationList[pubName] = pubName;
	});


	////////////////////////////////////////////////////////////
	// Methods
	////////////////////////////////////////////////////////////
	var allMethods = {};
	var addMethods = {};
	var updateMethods = {};
	var removeMethods = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'allMethods', allMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'addMethods', removeMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'updateMethods', updateMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'removeMethods', removeMethods);

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_add', function makeMethod_add(_options) {
		if (!_options) {
			_options = {};
		}
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			entryPrefix: 'add',
			withParams: false,
			field: "",
			additionalAuthFunction: () => true,
			finishers: [],
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
		if (_options.field === "") {
			if (!_options.withParams) {
				method = function() {
					this.unblock();
					if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
						var doc = ConstructorFunction.getObjectWithDefaultValues();
						var ret = collection.insert(doc);
						_options.finishers.forEach(function(fn) {
							if (fn instanceof Function) {
								fn.apply({
									context: this,
									id: id,
									doc: doc,
									result: ret
								});
							}
						});
						return ret;
					} else {
						throw new Meteor.Error('unauthorized');
					}
				};
			} else {
				method = function(id, doc) {
					check(id, String);
					check(doc, schema);
					this.unblock();
					if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
						var ret = collection.insert(doc);
						_options.finishers.forEach(function(fn) {
							if (fn instanceof Function) {
								fn.apply({
									context: this,
									id: id,
									doc: doc,
									result: ret
								});
							}
						});
						return ret;
					} else {
						throw new Meteor.Error('unauthorized');
					}
				};
			}
		} else {
			if (!_options.withParams) {
				method = function(id) {
					check(id, String);
					this.unblock();
					if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
						var subDoc = ConstructorFunction.getObjectWithDefaultValues(_options.field + '.$.');
						var ret = collection.update(id, {
							$push: _.object([
								[_options.field, subDoc]
							])
						});
						_options.finishers.forEach(function(fn) {
							if (fn instanceof Function) {
								fn.apply({
									context: this,
									id: id,
									doc: subDoc,
									result: ret
								});
							}
						});
						return ret;
					} else {
						throw new Meteor.Error('unauthorized');
					}
				};
			} else {
				method = function(id, subDoc) {
					check(id, String);
					check(subDoc, schema[_options.field][0]);
					this.unblock();
					if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
						var ret = collection.update(id, {
							$push: _.object([
								[_options.field, subDoc]
							])
						});
						_options.finishers.forEach(function(fn) {
							if (fn instanceof Function) {
								fn.apply({
									context: this,
									id: id,
									doc: subDoc,
									result: ret
								});
							}
						});
						return ret;
					} else {
						throw new Meteor.Error('unauthorized');
					}
				};
			}
		}

		Meteor.methods(_.object([
			[methodName, method]
		]));

		// rate limit
		if (!!_options.rateLimit && !!_options.rateLimitInterval) {
			applyRateLimitItem(methodName, 'method', _options.rateLimit, _options.rateLimitInterval);
		} else {
			if (!!options.defaultRateLimit && !!options.defaultRateLimitInterval) {
				applyRateLimitItem(methodName, 'method', options.defaultRateLimit, options.defaultRateLimitInterval);
			}
		}

		allMethods[_options.entryName] = methodName;
		addMethods[_options.entryName] = methodName;
		return _options.entryName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_remove', function makeMethod_remove(_options) {
		if (!_options) {
			_options = {};
		}
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			entryPrefix: 'remove',
			field: "",
			additionalAuthFunction: () => true,
			finishers: [],
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
		if (_options.field === "") {
			// remove document
			method = function(id) {
				check(id, String);
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					var ret = collection.remove(id);
					_options.finishers.forEach(function(fn) {
						if (fn instanceof Function) {
							fn.apply({
								context: this,
								id: id,
								result: ret
							});
						}
					});
					return ret;
				} else {
					throw new Meteor.Error('unauthorized');
				}
			};
		} else if (_.isArray(ConstructorFunction.getCheckableSchema()[_options.field])) {
			// remove array entry
			method = function(id, idx) {
				check(id, String);
				check(idx, Match.isPositiveInteger);
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					var subDoc = collection.findOne(id, {
						fields: _.object([
							[_options.field, 1]
						])
					});
					var ret;
					if (!!subDoc) {
						var arr = subDoc[_options.field];
						if (arr.length > idx) {
							arr.splice(idx, 1);
							ret = collection.update(id, {
								$set: _.object([
									[_options.field, arr]
								])
							});
						}
					}
					_options.finishers.forEach(function(fn) {
						if (fn instanceof Function) {
							fn.apply({
								context: this,
								id: id,
								idx: idx,
								result: ret
							});
						}
					});
					return ret;
				} else {
					throw new Meteor.Error('unauthorized');
				}
			};
		} else {
			// unset entire field
			method = function(id) {
				check(id, String);
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					var ret = collection.update(id, {
						$unset: _.object([
							[_options.field, ""]
						])
					});
					_options.finishers.forEach(function(fn) {
						if (fn instanceof Function) {
							fn.apply({
								context: this,
								id: id,
								result: ret
							});
						}
					});
					return ret;
				} else {
					throw new Meteor.Error('unauthorized');
				}
			};
		}

		Meteor.methods(_.object([
			[methodName, method]
		]));

		// rate limit
		if (!!_options.rateLimit && !!_options.rateLimitInterval) {
			applyRateLimitItem(methodName, 'method', _options.rateLimit, _options.rateLimitInterval);
		} else {
			if (!!options.defaultRateLimit && !!options.defaultRateLimitInterval) {
				applyRateLimitItem(methodName, 'method', options.defaultRateLimit, options.defaultRateLimitInterval);
			}
		}

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
			additionalAuthFunction: () => true,
			finishers: [],
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
		var method = function(id, value, ...args) {
			check(id, String);
			check(value, _options.type);
			check(args, [Match.OneOf(Number, String)]);
			this.unblock();
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
			if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
				var ret = collection.update(id, setter);
				_options.finishers.forEach(function(fn) {
					if (fn instanceof Function) {
						fn.apply({
							context: this,
							id: id,
							value: value,
							args: args,
							result: ret
						});
					}
				});
				return ret;
			} else {
				throw new Meteor.Error('unauthorized');
			}
		};

		Meteor.methods(_.object([
			[methodName, method]
		]));

		// rate limit
		if (!!_options.rateLimit && !!_options.rateLimitInterval) {
			applyRateLimitItem(methodName, 'method', _options.rateLimit, _options.rateLimitInterval);
		} else {
			if (!!options.defaultRateLimit && !!options.defaultRateLimitInterval) {
				applyRateLimitItem(methodName, 'method', options.defaultRateLimit, options.defaultRateLimitInterval);
			}
		}

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
			additionalAuthFunction: () => true,
			finishers: [],
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

		var method = function(id, updates) {
			check(id, String);
			check(updates, Object);
			_.forEach(updates, function(v, f) {
				var typeInfo = ConstructorFunction.getTypeInfo(f);
				if (!typeInfo) {
					throw new Meteor.Error('invalid-field', f);
				}
				check(v, typeInfo.type);
			});
			this.unblock();
			if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
				var ret = collection.update(id, {
					$set: updates
				});
				_options.finishers.forEach(function(fn) {
					if (fn instanceof Function) {
						fn.apply({
							context: this,
							id: id,
							updates: updates,
							result: ret
						});
					}
				});
				return ret;
			} else {
				throw new Meteor.Error('unauthorized');
			}
		};

		Meteor.methods(_.object([
			[methodName, method]
		]));

		// rate limit
		if (!!_options.rateLimit && !!_options.rateLimitInterval) {
			applyRateLimitItem(methodName, 'method', _options.rateLimit, _options.rateLimitInterval);
		} else {
			if (!!options.defaultRateLimit && !!options.defaultRateLimitInterval) {
				applyRateLimitItem(methodName, 'method', options.defaultRateLimit, options.defaultRateLimitInterval);
			}
		}

		allMethods[_options.entryName] = methodName;
		return methodName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeGenericMethod_updaters', function makeGenericMethod_updaters(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			entryPrefix: 'update-gen',
			additionalAuthFunction: () => true,
			finishers: [],
			// rateLimit: null,
			// rateLimitInterval: null,
		}, _options);

		var _schemaDesc = ConstructorFunction._schemaDescription;
		_.forEach(_schemaDesc, function(v, k) {
			ConstructorFunction.makeMethods_updater({
				field: k,
				type: ConstructorFunction.getCheckableSchema(k),
				entryPrefix: _options.entryPrefix,
				additionalAuthFunction: _options.additionalAuthFunction,
				finishers: _options.finishers,
			});
		});
	});

	return ConstructorFunction;
});