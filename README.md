# CollectionTools

This Meteor package is a tool for building "types". Select a Mongo collection, specify a schema, and a few other options such as an authentication function, and a constructor function is generated with many useful methods pre-loaded onto it (such as for generating publications and Meteor methods for adding/updating/removing with authentication baked in).

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->


- [Install](#install)
- [Usage: `CollectionTools.build`](#usage-collectiontoolsbuild)
  - [Instance Methods/Properties](#instance-methodsproperties)
  - [Constructor Methods](#constructor-methods)
    - [Data](#data)
    - [Schemas and Validation](#schemas-and-validation)
    - [Generated Publications](#generated-publications)
    - [Generated Methods](#generated-methods)
- [Other Utility Methods](#other-utility-methods)
  - [`CollectionTools.createMethod`](#collectiontoolscreatemethod)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Install

This is available as [`convexset:collection-tools`](https://atmospherejs.com/convexset/collection-tools) on [Atmosphere](https://atmospherejs.com/). (Install with `meteor add convexset:collection-tools`.)

If you get an error message like:
```
WARNING: npm peer requirements not installed:
 - package-utils@^0.2.1 not installed.
          
Read more about installing npm peer dependencies:
  http://guide.meteor.com/using-packages.html#peer-npm-dependencies
```
It is because, by design, the package does not include instances of these from `npm` to avoid repetition. (In this case, `meteor npm install --save package-utils`.)

See [this](http://guide.meteor.com/using-packages.html#peer-npm-dependencies) or [this](https://atmospherejs.com/tmeasday/check-npm-versions) for more information.

Now, if you see a message like
```
WARNING: npm peer requirements not installed:
underscore@1.5.2 installed, underscore@^1.8.3 needed
```
it is because you or something you are using is using Meteor's cruddy old `underscore` package. Install a new version from `npm`. (And, of course, you may use the `npm` version in a given scope via `require("underscore")`.)

## Usage: `CollectionTools.build`

Begin by calling:

```javascript
ConstructorFunction = CollectionTools.build({
    collectionName: "Collection_Name",
    constructorName: "ConstructorName",

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
            type: TypeOfField2,
            ...
        }
    },

    // additional extensions to the prototype
    prototypeExtension: {
        somePrototypeMethod: function() {
            // ...
        },
        somePrototypeValue: 10
        // ...
    },
    // Alternatively, if one wishes to use the constructor and/or collection:
    /*
    prototypeExtension: function(constructorFunction, collection) {
        return {
            getSimilar: function() {
                return collection.find({
                    thing: this.thing
                }),
            },
            makeSibling: function(name) {
                return new constructorFunction({
                    name: name,
                    parent: this.parent,
                });
            },
        };
    },
    */

    // additional extensions on the constructor
    constructorExtension: {
        someMethodSittingOnTheConstructor: function() {
            // ...
        },
        someValueSittingOnTheConstructor: "Hello!"
        // ...
    },
    // Alternatively, if one wishes to use the constructor and/or collection:
    /*
    constructorExtension: function(constructorFunction, collection) {
        return {
            getAll: function() {
                return collection.find(),
            },
            makeTeam: function(n) {
                return _.range(n).map(idx => new constructorFunction({
                    name: "Member " + idx,
                }));
            },
        };
    },
    */

    // transformation for the collection
    // See: "transform option" on http://docs.meteor.com/#/full/mongo_collection
    // A plain object from the Mongo collection is passed in and "typically"
    //    a plain object should be returned. An empty object that is linked
    //    to the relevant prototype (in the sense of "new") will then be
    //    "extended" with the content of the former object returned by the
    //    transform.
    // The transform is called with the aforementioned "protolinked" instance
    //    as the calling context. This provides prototype methods. So do not use
    //    arrow functions if you want access to prototype methods.
    transform: x => x,

    // An authentication function for generated Meteor methods
    // It takes a userId and documentId (except for makePublication)
    // and should return true if authorized and false otherwise
    globalAuthFunction: (userId, documentId) => true,

    // ... alteratively, if the constructor and/or collection are needed to
    // construct the global auth function, the following is available, and will
    // be called to override any thing passed as globalAuthFunction
    // globalAuthFunction_fromConstructorAndCollection: (cf, col) => ((userId, documentId) => true)
    // it defaults to null

    // The default prefix for generated Meteor methods
    methodPrefix: "collections/collection-name/",

    // Default rate limiting parameters for publications and methods
    defaultRateLimit: 10, // (default: 10; null to not set)
    defaultRateLimitInterval: 1000, // (default: 1000; null to not set)
});
```

### Instance Methods/Properties

 - `validate(useCheck, ignoreOffSchemaFields)`: validates object
   * `useCheck`: whether to use check instead of `SimpleSchema`'s `ctx.validate` (default: `false`)
   * `ignoreOffSchemaFields`: whether to ignore off-schema fields (default: `false`)

### Constructor Methods

#### Data

 - `find`, `findOne`, `insert`, `update`, `upsert`, `remove` from [`Mongo.Collection`](http://docs.meteor.com/#/full/mongo_collection)
 - `innerJoin(leftData, joinFields, mapRightFields, selector, options, excludeFields, includeFields)`: performs an inner join
   * `leftData`: the "left" data set; the "right" data set comes from the attached collection
   * `joinFields`: fields to join on, for example...

     ```javascript
     [
         {
             leftField: "x",
             rightField: "posX"
         },
         {
             leftField: "y",
             rightField: "posY"
         },
     ]
     ```

   * `mapRightFields` (default: `{}`): map to rename fields from the "right" collection, for example...

     ```javascript
     {
         name: "itemName",
         timeStamp: "itemTimeStamp"
     }
     ```

   * `selector` (default: `{}`): see [documentation for `Mongo.Collection`](http://docs.meteor.com/#/full/find) (for the "right" data set)
   * `options` (default: `{}`): see [documentation for `Mongo.Collection`](http://docs.meteor.com/#/full/find) (for the "right" data set)
   * `excludeFields` (default: `['_id']`): list of fields to exclude from the "right" data set
   * `includeFields` (default: `null`): fields (from the "right" data set) to include after excluding the ones in `excludeFields`
 - `extendById(data, options)`: given a data set `data` (an `Array`), matches id's in `data` to data in the attached collection, `options` takes the following form...

   ```javascript
   {
       dataField: "itemId",  // the field in the data
       idField: "_id",       // the id field in the attached collection (default: "_id")
       oneItemOnly: true,    // if the id field is not "_id", a find.fetch() is used
                             // instead of a findOne(), set to true to take the first
                             // element, if any (default: true)
       newFieldName: "item"  // if not null, places the data in a field by that name
                             // instead of replacing the value in dataField
                             // (default: null)
   }
   ```

 - `fetch`: essentially a `find(/* args here */).fetch()`
 - `getItemProperty(_id, propName)`: syntactic sugar for a safe way to do `findOne(_id)[propName]`
 - `mongoTransform`: returns the transform used in the attached `Mongo.Collection`
 - `__logAll__()`: log all items in attached collection

#### Schemas and Validation

 - `schema`: returns the relevant `SimpleSchema` object
 - `schemaDescription`: returns the relevant arguments used to create the `SimpleSchema` object
 - `_schemaDescription`: similar to `schemaDescription`, except `'$'` is replaced with `'*'` in the keys
 - `getTypeInfo(fieldSpec)`: gets the type info for a field specific field (matches wildcards, so `'ratings.3.rating'` would return the type info for `'ratings.$.rating'`)
 - `getObjectWithDefaultValues(prefix = "", callConstructor = true)`: returns an object (or sub-object) with default values
   * use with no arguments for entire document
   * use with `prefix` to obtain default values for sub-objects or arrays (e.g.: `xxx.getObjectWithDefaultValues('ratings.$.')` where `ratings` is an array of objects)
   * does not call constructor if `callConstructor` is set to false

 - `getModifiedSchema(altSchemaElements, tag)`: returns a "modified schema"
   * `altSchemaElements` (optional): schema elements to replace items in existing schema (Why would you ever want to use this? Someone asked me for this... Don't blame me.)
   * `tag` (optional): filters for items with `tag` in the `subSchemaTags` field of fields in the schema
 - `getCheckableSchema(prefix)`: gets an plain javascript object description of a schema that can be used directly with `check`
   * use with no arguments for entire document
   * use with `prefix` to obtain default values for sub-objects or arrays (e.g.: `xxx.getObjectWithDefaultValues('ratings.$')` where `ratings` is an array of objects)

 - `filterWithTopLevelSchema(o, call_functions, altSchemaElements, tag)`: construct modified schema (see `getModifiedSchema` above) and filter an object by that schema (top-level fields only)
   * `o`: the object
   * `call_functions`: if field takes a function value, replace with the return value of the function called with no parameters
   * `altSchemaElements`: see `getModifiedSchema` above
   * `tag`: see `getModifiedSchema` above
 
#### Generated Publications

 - `publications`: list of all generated publications
 - `makePublication(pubName, options)`: creates a publication named `pubName` with the following options
   * `selector`: [selector](http://docs.meteor.com/#/full/find) (default: `{}`)
   * `selectOptions`: [selector options](http://docs.meteor.com/#/full/find) (default: `{}`)
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId`) to a `Boolean` indicating whether the user is authorized (default: `(userId) => true`)
   * `rateLimit`: rate limiting count (default: `null`)
   * `rateLimitInterval`: rate limiting interval (default: `null`)
 - `makePublication_getById(pubName, options)`: creates a publication named `pubName` that selects a document (documents)
   * `idField`: name of the id field (default: `_id`)
   * `selectOptions`: [selector options](http://docs.meteor.com/#/full/find) (default: `{}`)
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId` or `Meteor.userId()`) and the document id to a `Boolean` indicating whether the user is authorized (default: `(userId, docId) => true`) this supersedes the global authentication function
   * `rateLimit`: rate limiting count (default: `null`)
   * `rateLimitInterval`: rate limiting interval (default: `null`)

#### Generated Methods

 - `allMethods`: list of all generated methods
 - `addMethods`: list of all generated "add methods"
 - `updateMethods`: list of all generated "update methods"
 - `removeMethods`: list of all generated "remove methods"

 - `makeMethod_add(options)`: creates a method
   * `entryPrefix`: entry prefix of method (default: 'add')
   * `field`: the field in question; `""` to add an entire document (default: `""`); 
   * `withParams`: true to add an entire document/sub-document as provided; false to use default values (default: `false`),
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId` or `Meteor.userId()`) and the document id to a `Boolean` indicating whether the user is authorized (default: `(userId, docId) => true`) this supersedes the global authentication function
   * `finishers`: an array of functions to be called on operation completion, bound to an object with an object with the following content (default: `[]`), see the corresponding element in [`CollectionTools.createMethod`](#collectiontoolscreatemethod) for more information.
   * `serverOnly`: define only on server if `true` (default: `false`)
   * `rateLimit`: rate limiting count (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
   * `rateLimitInterval`: rate limiting interval (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)

 - `makeMethod_remove(options)`: creates a removal method with signature `function(id)` (for removal of entire documents or unsetter of fields) or (`function(id, idx)` for arrays)
   * `entryPrefix`: entry prefix of method (default: 'remove')
   * `field`: `""` for removal of an entire document; for fields that are specified and are arrays, the method takes an additional parameter (the index) and removes an array element, otherwise, the entire field is unset (default: `""`)
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId` or `Meteor.userId()`) and the document id to a `Boolean` indicating whether the user is authorized (default: `(userId, docId) => true`) this supersedes the global authentication function
   * `finishers`: an array of functions to be called on operation completion, bound to an object with an object with the following content (default: `[]`), see the corresponding element in [`CollectionTools.createMethod`](#collectiontoolscreatemethod) for more information.
   * `serverOnly`: define only on server if `true` (default: `false`)
   * `rateLimit`: rate limiting count (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
   * `rateLimitInterval`: rate limiting interval (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)

 - `makeMethods_updater(options)`: creates generic field-specific updaters with signature `function(id, value, ...args)`
   * `entryName`: entry name (default: `'general-update'`)
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId` or `Meteor.userId()`) and the document id to a `Boolean` indicating whether the user is authorized (default: `(userId, docId) => true`) this supersedes the global authentication function
   * `finishers`: an array of functions to be called on operation completion, bound to an object with an object with the following content (default: `[]`), see the corresponding element in [`CollectionTools.createMethod`](#collectiontoolscreatemethod) for more information.
   * `serverOnly`: define only on server if `true` (default: `false`)
   * `rateLimit`: rate limiting count (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
   * `rateLimitInterval`: rate limiting interval (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
 - `makeGenericMethod_updaters(options)`: creates top-level generic field-specific updaters with signature `function(id, value, ...args)` (see `makeMethods_updater` above) with the following options
   * `entryPrefix`: prefix for methods
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId` or `Meteor.userId()`) and the document id to a `Boolean` indicating whether the user is authorized (default: `(userId, docId) => true`) this supersedes the global authentication function
   * `finishers`: an array of functions to be called on operation completion, bound to an object with an object with the following content (default: `[]`), see the corresponding element in [`CollectionTools.createMethod`](#collectiontoolscreatemethod) for more information.
   * `serverOnly`: define only on server if `true` (default: `false`)
   * `rateLimit`: rate limiting count (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
   * `rateLimitInterval`: rate limiting interval (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
   * `considerFieldsByName`: fields to consider for inclusion (e.g.: `"friends.$"`); exclusion via `excludeFieldsByName` takes precedence `excludeFieldsByFieldPrefix`
   * `considerFieldsByFieldPrefix`: field prefixes to consider for inclusion (e.g.: `"friends.$"` includes for consideration fields like `"friends.$.name"` and `"friends.$.particulars.name"`); exclusion via `excludeFieldsByName` takes precedence `excludeFieldsByFieldPrefix`
   * If neither `considerFieldsByName` nor `considerFieldsByFieldPrefix` are specified, then all fields are considered
   * `excludeFieldsByName`: fields to exclude (e.g.: `"friends.$"`)
   * `excludeFieldsByFieldPrefix`: fields to exclude (e.g.: `"friends.$"` excludes fields like `"friends.$.name"` and `"friends.$.particulars.name"`)
 - `makeMethods_generalUpdater(options)`: creates a monolithic updater for a document with the signature `function(id, updates)`
   * `entryName`: entry name (default: `'general-update'`)
   * `alternativeAuthFunction`: authentication function mapping user id (`this.userId` or `Meteor.userId()`) and the document id to a `Boolean` indicating whether the user is authorized (default: `(userId, docId) => true`) this supersedes the global authentication function
   * `finishers`: an array of functions to be called on operation completion, bound to an object with an object with the following content (default: `[]`), see the corresponding element in [`CollectionTools.createMethod`](#collectiontoolscreatemethod) for more information.
   * `serverOnly`: define only on server if `true` (default: `false`)
   * `rateLimit`: rate limiting count (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)
   * `rateLimitInterval`: rate limiting interval (set to 0 to not apply rate limiting; leave unset to use "type-level" defaults)


## Other Utility Methods

### `CollectionTools.createMethod`

See inline comments

```javascript
CollectionTools.createMethod({
    name: "some-method-name",

    // schema in SimpleSchema format
    schema: {
        _id: {
            type: String,
            regEx: /^[0-9a-zA-Z]{17,24}$/
        },
        field2: {
            type: TypeOfField2,
            ...
        }
    },

    // Authentication check function
    // a function that takes a user id (via this.userId) and returns true if
    // authorized and false otherwise
    authenticationCheck: () => true,  // (userId) => true,
    // a string or function that maps (options, userId) to the unautorized use message 
    unauthorizedMessage: (opts, userId) => "unauthorized for " + userId + ": " + opts.name,
    // unauthorizedMessage: "unauthorized",


    // the method body
    method: function removeItem(_id) {
        return SomeCollection.remove(_id);
    },

    // whether to use "rest arguments"  (default: `false`)
    useRestArgs: false,

    // finishers: an array of functions to be called on operation completion
    // each function will be bound to an object with an object with the
    // following content (default: `[]`),
    //  - `context`: the `this` of the Meteor method context
    //  - `args`: arguments passed into method
    //  - `result`: return code of method

    // if true, will define method only on server
    serverOnly: false,

    // Rate limiting parameters for publications and methods
    rateLimit: 10,            // (default: 10; null to not set)
    rateLimitInterval: 1000,  // (default: 1000; null to not set)
});
```