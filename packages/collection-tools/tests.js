/* global CollectionTools: true */
/* global Tinytest: true */

/*
tinytest.api
*********************************************
test.isFalse(v, msg)
test.isTrue(v, msg)
test.equal(actual, expected, message, not)
test.length(obj, len)
test.include(s, v)
test.isNaN(v, msg)
test.isUndefined(v, msg)
test.isNotNull
test.isNull
test.throws(func)
test.instanceOf(obj, klass)
test.notEqual(actual, expected, message)
test.runId()
test.exception(exception)
test.expect_fail()
test.ok(doc)
test.fail(doc)
*/

var Thing = CollectionTools.build({
	schema: {
		name: {
			type: String,
			subSchemaTags: ['name-only'],
			defaultValue: "name"
		},
		num: {
			type: Number,
			defaultValue: 42
		},
	}
});

function getObjKeys(o) {
	return _.map(o, function(v, k) {
		return k;
	});
}

function objKeyMatch(o, keys) {
	for (var k in o) {
		if (o.hasOwnProperty(k)) {
			if (keys.indexOf(k) === -1) {
				return false;
			}
		}
	}
	var result = true;
	keys.forEach(function(k) {
		if (!o.hasOwnProperty(k)) {
			result = false;
		}
	});
	return result;
}

function getBadKeys(outcome) {
	return outcome.context._invalidKeys;
}

function numBadKeys(outcome) {
	return getBadKeys(outcome).length;
}

function badKeyNames(outcome) {
	return _.map(getBadKeys(outcome), function(v) {
		return v.name;
	});
}

function hasBadKey(outcome, key) {
	return badKeyNames(outcome).indexOf(key) > -1;
}

var instanceDefault = Thing.getObjectWithDefaultValues();
var instanceBadName = new Thing({
	name: 0,
	num: 0
});
var instanceExtraField = new Thing({
	name: "name",
	num: 0,
	xxx: 0
});

Tinytest.add("[CollectionTools] instance.validate without options", function(test) {
	test.equal(numBadKeys(instanceDefault.validate()), 0, "numBadKeys instanceDefault");
	test.equal(numBadKeys(instanceBadName.validate()), 1, "numBadKeys instanceBadName");
	test.isTrue(hasBadKey(instanceBadName.validate(), 'name'), "hasBadKey instanceBadName");
});

Tinytest.add("[CollectionTools] instance.validate not ignoring off schema fields", function(test) {
	test.equal(numBadKeys(instanceExtraField.validate()), 1, "numBadKeys instanceExtraField");
	test.isTrue(hasBadKey(instanceExtraField.validate(), 'xxx'), "hasBadKey instanceExtraField");
	test.equal(numBadKeys(instanceExtraField.validate(false)), 1, "numBadKeys instanceExtraField (default options)");
	test.isTrue(hasBadKey(instanceExtraField.validate(false), 'xxx'), "hasBadKey instanceExtraField (default options)");
});

Tinytest.add("[CollectionTools] instance.validate ignoring off schema fields", function(test) {
	test.equal(numBadKeys(instanceExtraField.validate(false, true)), 0, "numBadKeys instanceExtraField");
});

Tinytest.add("[CollectionTools] constructor.getObjectWithDefaultValues", function(test) {
	test.equal(instanceDefault.name, "name", "name");
	test.equal(instanceDefault.num, 42, "num");
	var num_keys = 0;
	for (var k in instanceDefault) {
		if (instanceDefault.hasOwnProperty(k)) {
			num_keys += 1;
		}
	}
	test.equal(num_keys, 2, "num_keys");
});

Tinytest.add("[CollectionTools] constructor.getModifiedSchema match with constructor.schemaDescription (and compare schema keys and fields)", function(test) {
	var modSchema = Thing.getModifiedSchema()._schema;
	var schemaKeys = getObjKeys(Thing.schemaDescription);
	test.isTrue(objKeyMatch(modSchema, schemaKeys), "num_keys");
});

Tinytest.add("[CollectionTools] constructor.getModifiedSchema with some alt schema elements", function(test) {
	var modSchema = Thing.getModifiedSchema({
		name: {
			type: Boolean
		}
	})._schema;
	test.equal(modSchema.name.type, Boolean, "name type is Boolean");
	test.equal(modSchema.num.type, Number, "num type is Number");
});

Tinytest.add("[CollectionTools] constructor.getModifiedSchema with alt schema elements {} and with some tag", function(test) {
	var modSchema = Thing.getModifiedSchema({}, 'name-only')._schema;
	test.isTrue(objKeyMatch(modSchema, ['name']), "\"name-only\" sub-schema has one key: name");
});

Tinytest.add("[CollectionTools] constructor.filterWithTopLevelSchema with functions in passed object ", function(test) {
	var obj = {
		name: "name",
		num: function() {
			return 888;
		},
		xxx: 0
	};
	var o_noCallFn = Thing.filterWithTopLevelSchema(obj, false).filteredObject;
	var o_callFn = Thing.filterWithTopLevelSchema(obj, true).filteredObject;
	test.isTrue(_.isFunction(o_noCallFn.num), "_.isFunction(o_noCallFn.num)");
	test.equal(o_callFn.num, 888, "o_callFn.num === 888");
	test.isTrue(objKeyMatch(o_noCallFn, ['name', 'num']), 'o_noCallFn keys: name, num');
	test.isTrue(objKeyMatch(o_callFn, ['name', 'num']), 'o_noCallFn keys: name, num');
});

Tinytest.add("[CollectionTools] constructor.filterWithTopLevelSchema with functions in passed object with some alt schema elements", function(test) {
	var obj = {
		name: "name",
		num: function() {
			return 888;
		},
		xxx: 0
	};
	var ret_callFn = Thing.filterWithTopLevelSchema(obj, true, {
		num: {
			type: Boolean
		}
	});
	test.equal(ret_callFn.selectedSchema._schema.num.type, Boolean, "ret_callFn.selectedSchema._schema.num.type === Boolean (after alt schema)");
});

Tinytest.add("[CollectionTools] constructor.filterWithTopLevelSchema with functions in passed object with alt schema elements {} and with some tag", function(test) {
	var obj = {
		name: "name",
		num: function() {
			return 888;
		},
		xxx: 0
	};
	var ret_callFn = Thing.filterWithTopLevelSchema(obj, true, {
		name: {
			type: Boolean
		}
	}, 'name-only');
	test.equal(ret_callFn.selectedSchema._schema.name.type, Boolean, "ret_callFn.selectedSchema._schema.name.type === Boolean (after alt schema)");
	test.isTrue(objKeyMatch(ret_callFn.selectedSchema._schema, ['name']), "ret_callFn.selectedSchema._schema keys: name");
});