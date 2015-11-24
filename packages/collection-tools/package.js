Package.describe({
	name: 'convexset:collection-tools',
	version: '0.0.1',
	summary: 'A tool for \"unifying\" collections, Meteor methods, schemas and transformations',
	git: 'https://github.com/convexset/meteor-collection-tools',
	documentation: '../../README.md'
});


Package.onUse(function(api) {
	api.versionsFrom('1.2.0.2');

	api.use(
		[
			'ecmascript', 'underscore', 'check', 'ejson', 'mongo',
			'aldeed:simple-schema@1.3.3',
			'convexset:match-extensions@0.1.1', 'convexset:package-utils@0.1.3',
		]
	);
	api.use([], 'server');
	api.use([], 'client');

	api.addFiles(['collection-tools.js']);
	api.addFiles([], 'server');
	api.addFiles([], 'client');
	api.export('CollectionTools');
});


Package.onTest(function(api) {
	api.use(['tinytest', 'ecmascript', 'underscore', 'ejson', ]);
	api.use('convexset:collection-tools');
	api.addFiles(['tests.js', ]);
	api.addFiles([], 'server');
	api.addFiles([], 'client');
});