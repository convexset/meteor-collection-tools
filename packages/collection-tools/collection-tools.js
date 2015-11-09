/* global SimpleSchema: true */
/* global check: true */
/* global Match: true */

/* global CollectionTools: true */

SimpleSchema.extendOptions({
	subSchemaTags: Match.Optional([String])
});

var __ct = function CollectionTools() {};

CollectionTools = new __ct();

var collectionToolsPrototype = {
	schema: function schema() {
		return new SimpleSchema({});
	},
	_asPlainObject: function _asPlainObject(ignore_off_schema_fields) {
		var schemaDesc = ignore_off_schema_fields ? this.schema()._schema : {};

		var thisAsObj = {};
		for (var k in this) {
			if (this.hasOwnProperty(k)) {
				if ((!ignore_off_schema_fields) || (k in schemaDesc)) {
					// Keep if not ignoring off schema fields or...
					// Ignoring off schema fields and k in schemaDesc
					thisAsObj[k] = this[k];
				}
			}
		}
		return thisAsObj;
	},
	_obtainTopLevelSubSchemaAndFilteredObject: function _obtainTopLevelSubSchemaAndFilteredObject(ignore_off_schema_fields, altSchemaElements, tag, o) {
		var k;

		var selectedSchema = this.constructor.getModifiedSchema(altSchemaElements, tag);
		var selectedSchemaDesc = selectedSchema._schema;

		var filteredObject;

		if (ignore_off_schema_fields) {
			filteredObject = {};
			for (k in selectedSchemaDesc) {
				if (selectedSchemaDesc.hasOwnProperty(k)) {
					filteredObject[k] = o[k];
				}
			}
		} else {
			filteredObject = _.extend({}, o);
		}

		return {
			filteredObject: filteredObject,
			selectedSchema: selectedSchema
		};
	},
	validate: function validate(ignore_off_schema_fields, altSchemaElements, tag) {
		return this._validate(false, ignore_off_schema_fields, altSchemaElements, tag);
	},
	validateWithCheck: function validateWithCheck(ignore_off_schema_fields, altSchemaElements, tag) {
		return this._validate(true, ignore_off_schema_fields, altSchemaElements, tag);
	},
	_validate: function _validate(useCheck, ignore_off_schema_fields, altSchemaElements, tag) {
		var ssContext, result;
		var thisAsPlainObject = this._asPlainObject(ignore_off_schema_fields);

		// By default, be strict with schema don't allow extras
		ignore_off_schema_fields = !!ignore_off_schema_fields;

		if (typeof altSchemaElements === "undefined") {
			// No alt. schema elements
			altSchemaElements = {};
		}

		var validationItems = this._obtainTopLevelSubSchemaAndFilteredObject(ignore_off_schema_fields, altSchemaElements, tag, thisAsPlainObject);

		if (useCheck) {
			return check(validationItems.filteredObject, validationItems.selectedSchema);
		} else {
			ssContext = validationItems.selectedSchema.newContext();
			result = ssContext.validate(validationItems.filteredObject);
			return {
				result: result,
				context: ssContext
			};
		}
	},
	getSchemaDescribedTopLevelFields: function getSchemaDescribedTopLevelFields() {
		var schemaDesc = this.schema()._schema;
		var o = {};
		for (var k in schemaDesc) {
			if (schemaDesc.hasOwnProperty(k)) {
				o[k] = this[k];
			}
		}
		return o;
	},
};

PackageUtilities.addImmutablePropertyFunction(CollectionTools, 'protoLink', function protoLink(options) {

	options = PackageUtilities.updateDefaultOptionsWithInput({
		collectionName: "",
		setRestrictiveAllowDenyDefaults: true,
		schema: {},
		extension: {},
		constructorExtension: {},
		transform: x => x,
		globalAuthFunction: () => true,
		methodPrefix: "",
	}, options);
	if (options.collectionName === "") {
		options.collectionName = null;
	}
	if (options.methodPrefix === "") {
		var _cNSplit = String(options.collectionName).split('_');
		var _cn = (_cNSplit.length > 1) ? _cNSplit.splice(1).join('_') : _cNSplit[0];
		options.methodPrefix = 'collections/' + _cn + '/';
	}

	var ConstructorFunction = _.extend(function(doc) {
		_.extend(this, options.transform(doc));
	}, options.constructorExtension);
	ConstructorFunction.prototype = _.extend(Object.create(collectionToolsPrototype), {
		constructor: ConstructorFunction,
	}, {
		schema: function schema() {
			return new SimpleSchema(options.schema);
		}
	}, options.extension || {});
	var collection = new Mongo.Collection(options.collectionName, {
		transform: function(doc) {
			return new ConstructorFunction(doc);
		}
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getObjectWithDefaultValues', function getObjectWithDefaultValues(prefix, document) {
		var obj = {};
		if (!prefix) {
			prefix = "";
		}

		var schemaDesc = _.object(
			_.map(
				this.prototype.schema()._schema, (v, k) => [k, v]
			)
			.filter(x => x[0].substr(0, prefix.length) === prefix)
			.map(x => [x[0].substr(prefix.length), x[1]])
		);

		_.forEach(schemaDesc, function(item, key) {
			if (key.indexOf('.') === -1) {
				// Top Level only!!! Everything should be there.
				if (typeof item.defaultValue === "undefined") {
					throw new Meteor.Error('default-value-not-found', key);
				}
				obj[key] = (item.defaultValue instanceof Function) ? item.defaultValue.call(document) : item.defaultValue;
			}
		});
		return (prefix === "") ? new ConstructorFunction(obj) : obj;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getSchema', function getSchema() {
		return this.prototype.schema();
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getSchemaDescription', function getSchemaDescription() {
		return this.prototype.schema()._schema;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, '_getSchemaDescription', function _getSchemaDescription() {
		return _.object(_.map(this.prototype.schema()._schema, function(v, k) {
			var kk = k;
			while (kk.indexOf('$') !== -1) {
				kk = kk.replace('$', '*');
			}
			return [kk, v];
		}));
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getModifiedSchema', function getModifiedSchema(altSchemaElements, tag) {
		var k;
		var schemaDesc = this.prototype.schema()._schema;
		var selectedSchemaDesc = {};

		if (typeof altSchemaElements === "undefined") {
			// No alt. schema elements
			altSchemaElements = {};
		}

		for (k in altSchemaElements) {
			if (altSchemaElements.hasOwnProperty(k)) {
				if (!(k in schemaDesc)) {
					throw "alt-schema-entry-not-in-schema";
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getIntrospectableSchemas', function getIntrospectableSchemas(prefix) {
		// Gets checkable and dig-in-able schemas
		var schemaDesc = this.getSchemaDescription();
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'getSubSchemas_Simple', function getSubSchemas_Simple() {
		// Gets top-level schemas
		var ItemType = this;

		return _.object(_.map(ItemType.getSchema()._schema, function(_info, _key) {
				return [_key, _info.type];
			}).filter(function(data) {
				return (data[0].split('.').length === 1) && (data[1].type !== Array);
			})
			.concat(
				_.map(ItemType.getSchema()._schema, function(info, key) {
					return {
						info: info,
						key: key
					};
				}).filter(function(typeInfo) {
					return typeInfo.info.type === Object;
				}).map(function(x) {
					var area = x.key.split('.')[0];
					return [
						area,
						_.object(
							_.map(ItemType.getSchema()._schema, function(_info, _key) {
								return [_key, _info.type];
							}).filter(function(data) {
								var _area_len = data[0].split('.').length;
								var _area = data[0].split('.')[0];
								return _area === area && _area_len === 3;
							}).map(x => [x[0].split('.').pop(), x[1]])
						)
					];
				})
			));
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

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'castAndValidate', function castAndValidate(o, call_functions, altSchemaElements, tag) {
		var filteredObject = ConstructorFunction.filterWithTopLevelSchema(o, call_functions, altSchemaElements, tag).filteredObject;
		var castObj = new ConstructorFunction(filteredObject);
		return castObj.validate(false, altSchemaElements, tag); // should be no problem passing a false there
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

	var pubs = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'publications', pubs);
	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makePublication', function(pubName, _options) {
		if (!_options) {
			_options = {};
		}
		if (typeof pubs[pubName] !== "undefined") {
			throw new Meteor.Error('publication-already-exists', pubName);
		}
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			selector: {},
			selectOptions: {},
			additionalAuthFunction: () => true,
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
		}
		// Add default pubName
		if (_.map(pubs, x => x).length === 0) {
			PackageUtilities.addImmutablePropertyValue(ConstructorFunction, 'defaultPublication', pubName);
		}
		pubs[pubName] = pubs;
	});

	var allMethods = {};
	var addMethods = {};
	var updateMethods = {};
	var removalMethods = {};
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'allMethods', allMethods);
	PackageUtilities.addMutablePropertyObject(ConstructorFunction, 'updateMethods', updateMethods);

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_add', function(_options) {
		if (!_options) {
			_options = {};
		}
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			entryPrefix: 'add',
			withParams: false,
			field: "",
			serverOnly: false,
			additionalAuthFunction: () => true,
			finishers: [],
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

		var schema = ConstructorFunction.getIntrospectableSchemas();
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
						return collection.insert(doc);
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
						return collection.insert(doc);
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
						_options.finishers.forEach(function (fn) {
							if (fn instanceof Function) {
								fn.apply(this, Array.prototype.slice.call(arguments, 0)); // Meteor.bindEnvironment(fn)();
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
						_options.finishers.forEach(function (fn) {
							if (fn instanceof Function) {
								fn.apply(this, Array.prototype.slice.call(arguments, 0)); // Meteor.bindEnvironment(fn)();
							}
						});
						return ret;
					} else {
						throw new Meteor.Error('unauthorized');
					}
				};
			}
		}
		var methodData = _.object([
			[methodName, method]
		]);
		if (_options.serverOnly) {
			if (Meteor.isServer) {
				Meteor.methods(methodData);
			}
		} else {
			Meteor.methods(methodData);
		}
		allMethods[_options.entryName] = methodName;
		addMethods[_options.entryName] = methodName;
		return _options.entryName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethod_remove', function(_options) {
		if (!_options) {
			_options = {};
		}
		_options = PackageUtilities.updateDefaultOptionsWithInput({
			entryPrefix: 'remove',
			field: "",
			serverOnly: false,
			additionalAuthFunction: () => true,
			finishers: [],
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
			method = function(id) {
				check(id, String);
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					collection.remove(id);
					_options.finishers.forEach(function (fn) {
						if (fn instanceof Function) {
							fn.apply(this, Array.prototype.slice.call(arguments, 0)); // Meteor.bindEnvironment(fn)();
						}
					});
				} else {
					throw new Meteor.Error('unauthorized');
				}
			};
		} else if (ConstructorFunction.getIntrospectableSchemas()[_options.field] instanceof Array) {
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
					_options.finishers.forEach(function (fn) {
						if (fn instanceof Function) {
							fn.apply(this, Array.prototype.slice.call(arguments, 0)); // Meteor.bindEnvironment(fn)();
						}
					});
				} else {
					throw new Meteor.Error('unauthorized');
				}
			};
		} else {
			method = function(id) {
				check(id, String);
				this.unblock();
				if (options.globalAuthFunction(this.userId) && _options.additionalAuthFunction(this.userId)) {
					return collection.update(id, {
						$unset: _.object([
							[_options.field, ""]
						])
					});
				} else {
					throw new Meteor.Error('unauthorized');
				}
			};
		}

		var methodData = _.object([
			[methodName, method]
		]);
		if (_options.serverOnly) {
			if (Meteor.isServer) {
				Meteor.methods(methodData);
			}
		} else {
			Meteor.methods(methodData);
		}
		allMethods[_options.entryName] = methodName;
		removalMethods[_options.field] = methodName;
		return _options.entryName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeMethods_updater', function(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			field: '',
			type: Function,
			entryPrefix: 'update',
			serverOnly: false,
			additionalAuthFunction: () => true,
			finishers: [],
		}, _options);

		if (typeof _options.entryName === "undefined") {
			_options.entryName = _options.entryPrefix + (_options.field === "" ? "" : "-" + _options.field);
		}

		var methodName = options.methodPrefix + _options.entryPrefix + "-" + _options.field;
		if (_options.field === "") {
			throw new Meteor.Error('field-not-specified');
		}
		if (typeof allMethods[_options.field] !== "undefined") {
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
				_options.finishers.forEach(function (fn) {
					if (fn instanceof Function) {
						fn.apply(this, Array.prototype.slice.call(arguments, 0)); // Meteor.bindEnvironment(fn)();
					}
				});
				return ret;
			} else {
				throw new Meteor.Error('unauthorized');
			}
		};
		var methodData = _.object([
			[methodName, method]
		]);
		if (_options.serverOnly) {
			if (Meteor.isServer) {
				Meteor.methods(methodData);
			}
		} else {
			Meteor.methods(methodData);
		}
		allMethods[_options.entryName] = methodName;
		updateMethods[_options.field] = methodName;
		return methodName;
	});

	PackageUtilities.addImmutablePropertyFunction(ConstructorFunction, 'makeGenericMethod_updaters', function(_options) {
		if (!_options) {
			_options = {};
		}
		_options = _.extend({
			entryPrefix: 'update-gen',
			serverOnly: false,
			additionalAuthFunction: () => true,
			finishers: [],
	}, _options);

		var _schemaDesc = ConstructorFunction._getSchemaDescription();
		_.forEach(_schemaDesc, function(v, k) {
			ConstructorFunction.makeMethods_updater({
				field: k,
				type: ConstructorFunction.getIntrospectableSchemas(k),
				entryPrefix: _options.entryPrefix,
				serverOnly: _options.serverOnly,
				additionalAuthFunction: _options.additionalAuthFunction,
				finishers: _options.finishers,
			});
		});
	});

	return ConstructorFunction;
});