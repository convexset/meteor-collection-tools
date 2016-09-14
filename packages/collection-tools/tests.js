import { CollectionTools } from 'meteor/convexset:collection-tools';
import { Tinytest } from 'meteor/tinytest';

const _ = require('underscore');

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

const Thing = CollectionTools.build({
	schema: {
		name: {
			type: String,
			subSchemaTags: ['name-only'],
			defaultValue: 'name'
		},
		num: {
			type: Number,
			defaultValue: 42
		},
	}
});

function getObjKeys(o) {
	return _.map(o, (v, k) => k);
}

function objKeyMatch(o, keys) {
	for (const k in o) {
		if (o.hasOwnProperty(k)) {
			if (keys.indexOf(k) === -1) {
				return false;
			}
		}
	}
	let result = true;
	keys.forEach(k => {
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
	return _.map(getBadKeys(outcome), v => v.name);
}

function hasBadKey(outcome, key) {
	return badKeyNames(outcome).indexOf(key) > -1;
}

const instanceDefault = Thing.getObjectWithDefaultValues();
const instanceBadName = new Thing({
	name: 0,
	num: 0
});
const instanceExtraField = new Thing({
	name: 'name',
	num: 0,
	xxx: 0
});

Tinytest.add('[CollectionTools] instance.validate without options', (test) => {
	test.equal(numBadKeys(instanceDefault.validate()), 0, 'numBadKeys instanceDefault');
	test.equal(numBadKeys(instanceBadName.validate()), 1, 'numBadKeys instanceBadName');
	test.isTrue(hasBadKey(instanceBadName.validate(), 'name'), 'hasBadKey instanceBadName');
});

Tinytest.add('[CollectionTools] instance.validate not ignoring off schema fields', (test) => {
	test.equal(numBadKeys(instanceExtraField.validate()), 1, 'numBadKeys instanceExtraField');
	test.isTrue(hasBadKey(instanceExtraField.validate(), 'xxx'), 'hasBadKey instanceExtraField');
	test.equal(numBadKeys(instanceExtraField.validate(false)), 1, 'numBadKeys instanceExtraField (default options)');
	test.isTrue(hasBadKey(instanceExtraField.validate(false), 'xxx'), 'hasBadKey instanceExtraField (default options)');
});

Tinytest.add('[CollectionTools] instance.validate ignoring off schema fields', (test) => {
	test.equal(numBadKeys(instanceExtraField.validate(false, true)), 0, 'numBadKeys instanceExtraField');
});

Tinytest.add('[CollectionTools] constructor.getObjectWithDefaultValues', (test) => {
	test.equal(instanceDefault.name, 'name', 'name');
	test.equal(instanceDefault.num, 42, 'num');
	let numKeys = 0;
	for (const k in instanceDefault) {
		if (instanceDefault.hasOwnProperty(k)) {
			numKeys += 1;
		}
	}
	test.equal(numKeys, 2, 'numKeys');
});

Tinytest.add('[CollectionTools] constructor.getModifiedSchema match with constructor.schemaDescription (and compare schema keys and fields)', (test) => {
	const modSchema = Thing.getModifiedSchema()._schema;
	const schemaKeys = getObjKeys(Thing.schemaDescription);
	test.isTrue(objKeyMatch(modSchema, schemaKeys), 'numKeys');
});

Tinytest.add('[CollectionTools] constructor.getModifiedSchema with some alt schema elements', (test) => {
	const modSchema = Thing.getModifiedSchema({
		name: {
			type: Boolean
		}
	})._schema;
	test.equal(modSchema.name.type, Boolean, 'name type is Boolean');
	test.equal(modSchema.num.type, Number, 'num type is Number');
});

Tinytest.add('[CollectionTools] constructor.getModifiedSchema with alt schema elements {} and with some tag', (test) => {
	const modSchema = Thing.getModifiedSchema({}, 'name-only')._schema;
	test.isTrue(objKeyMatch(modSchema, ['name']), '\'name-only\' sub-schema has one key: name');
});

Tinytest.add('[CollectionTools] constructor.filterWithTopLevelSchema with functions in passed object ', (test) => {
	const obj = {
		name: 'name',
		num: function() {
			return 888;
		},
		xxx: 0
	};
	const objNoCallFn = Thing.filterWithTopLevelSchema(obj, false).filteredObject;
	const objCallFn = Thing.filterWithTopLevelSchema(obj, true).filteredObject;
	test.isTrue(_.isFunction(objNoCallFn.num), '_.isFunction(objNoCallFn.num)');
	test.equal(objCallFn.num, 888, 'objCallFn.num === 888');
	test.isTrue(objKeyMatch(objNoCallFn, ['name', 'num']), 'objNoCallFn keys: name, num');
	test.isTrue(objKeyMatch(objCallFn, ['name', 'num']), 'objNoCallFn keys: name, num');
});

Tinytest.add('[CollectionTools] constructor.filterWithTopLevelSchema with functions in passed object with some alt schema elements', (test) => {
	const obj = {
		name: 'name',
		num: function() {
			return 888;
		},
		xxx: 0
	};
	const retCallFn = Thing.filterWithTopLevelSchema(obj, true, {
		num: {
			type: Boolean
		}
	});
	test.equal(retCallFn.selectedSchema._schema.num.type, Boolean, 'retCallFn.selectedSchema._schema.num.type === Boolean (after alt schema)');
});

Tinytest.add('[CollectionTools] constructor.filterWithTopLevelSchema with functions in passed object with alt schema elements {} and with some tag', (test) => {
	const obj = {
		name: 'name',
		num: function() {
			return 888;
		},
		xxx: 0
	};
	const retCallFn = Thing.filterWithTopLevelSchema(obj, true, {
		name: {
			type: Boolean
		}
	}, 'name-only');
	test.equal(retCallFn.selectedSchema._schema.name.type, Boolean, 'retCallFn.selectedSchema._schema.name.type === Boolean (after alt schema)');
	test.isTrue(objKeyMatch(retCallFn.selectedSchema._schema, ['name']), 'retCallFn.selectedSchema._schema keys: name');
});
