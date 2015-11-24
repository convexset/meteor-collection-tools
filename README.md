# CollectionTools

This Meteor package is a tool for building "types". Select a Mongo collection, specify a schema, and a few other options such as an authentication function, and a constructor function is generated with many useful methods pre-loaded onto it (such as for generating publications and Meteor methods for adding/updating/removing with authentication baked in).

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Install](#install)
- [Usage](#usage)
    - [Constructor Methods](#constructor-methods)
    - [Instance Methods/Properties](#instance-methodsproperties)
        - [Schemas and Validation](#schemas-and-validation)
        - [Publications and Add/Update/Remove Methods](#publications-and-addupdateremove-methods)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Install

This is available as [`convexset:collection-tools`](https://atmospherejs.com/convexset/collection-tools) on [Atmosphere](https://atmospherejs.com/). (Install with `meteor add convexset:collection-tools`.)

## Usage

Begin by calling:

```javascript
ConstructorFunction = CollectionTools.build({
	collectionName: "Collection_Name",

	// Whether to set "allow nothing deny everything" for collection
	setRestrictiveAllowDenyDefaults: true,

	// The schema in "SimpleSchema notation"
	// see: https://github.com/aldeed/meteor-simple-schema
	schema: {      
		field1: {
			type: TypeOfField1,
			...
		},
		field2: {
			type: TypeOfField1,
			...
		}
	},

	// additional extensions to the prototype
	prototypeExtension: {},

	// additional extensions on the constructor
	constructorExtension: {},

	// transformation for the collection
	// See: "transform option" on http://docs.meteor.com/#/full/mongo_collection
	transform: x => x,

	// An authentication function for generated Meteor methods
	// It takes a userId and should return true if authorized and false otherwise
	globalAuthFunction: () => true,

	// The default prefix for generated Meteor methods
	methodPrefix: "collections/collection-name/",
})
```

#### Constructor Methods

 - `validate(ignore_off_schema_fields, altSchemaElements, tag)`
 - `validateWithCheck(ignore_off_schema_fields, altSchemaElements, tag)`
 - `getSchemaDescribedTopLevelFields: function getSchemaDescribedTopLevelFields()`


#### Instance Methods/Properties

###### Schemas and Validation

 - `schema`
 - `schemaDescription`
 - `_schemaDescription`
 - `getTypeInfo(fieldSpec)`

 - `getObjectWithDefaultValues(prefix)`
 - `getModifiedSchema(altSchemaElements, tag)`
 - `getCheckableSchema(prefix)`

 - `filterWithTopLevelSchema(o, call_functions, altSchemaElements, tag)`
 - `castAndValidate(o, call_functions, altSchemaElements, tag)`
 
###### Publications and Add/Update/Remove Methods

 - `publications`
 - `makePublication(pubName, _options)`

 - `allMethods`
 - `addMethods`
 - `updateMethods`
 - `removalMethods`

 - `makeMethod_add(_options)`
 - `makeMethod_remove(_options)`
 - `makeMethods_updater(_options)`
 - `makeGenericMethod_updaters(_options)`