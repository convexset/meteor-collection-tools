Package.describe({
	name: 'convexset:collection-tools',
	version: '0.0.1',
	summary: 'A toolkit for unifying collections, Meteor methods, schemas and transformations',
	git: '',
	documentation: '../../README.md'
});


Package.onUse(function(api) {
	api.versionsFrom('1.2.0.2');
	api.use(
		[
			'ecmascript',
			'underscore',
			'check',
			'ejson',
			'aldeed:simple-schema@1.3.3',
			'convexset:match-extensions@0.1.0',
			'convexset:package-utils@0.1.0',
		]
	);
	api.use(
		[],
		'server'
	);
	api.use(
		[
			'templating',
		],
		'client'
	);

	api.addFiles(
		[
			// Data Validation Support
			'collection-tools.js',
		]
	);
	api.addFiles(
		[],
		'server'
	);
	api.addFiles(
		[
		],
		'client'
	);
	api.export('CollectionTools');
});


Package.onTest(function(api) {
	api.use([
		'tinytest',
		'test-helpers',
		'ecmascript',
		'underscore',
		'ejson',
		'aldeed:simple-schema@1.3.3'
	]);
	api.use('convexset:collection-tools');
	api.addFiles(
		[
			'collection-tools/tests.js',
		]
	);
	api.addFiles(
		[
		],
		'server'
	);
	api.addFiles(
		[
		],
		'client'
	);
});