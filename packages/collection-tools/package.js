Package.describe({
	// [validatis:stack]
	name: 'convexset:collection-tools',
	version: '0.1.2_17',
	summary: 'A tool for \"unifying\" collections, Meteor methods, schemas and transformations',
	git: 'https://github.com/convexset/meteor-collection-tools',
	documentation: '../../README.md'
});


Package.onUse(function setupPackage(api) {
	api.versionsFrom('1.3.1');
	api.use(
		[
			'ecmascript', 'check', 'ejson',
			'mongo', 'ddp-rate-limiter',
			'meteorhacks:unblock@1.1.0',
			'aldeed:simple-schema@1.5.3',
			'convexset:match-extensions@0.1.1_6',
			'tmeasday:check-npm-versions@0.3.1'
		]
	);
	api.mainModule('collection-tools.js');
});

Package.onTest(function setupPackageTests(api) {
	api.use(['tinytest', 'ecmascript', 'ejson', ]);
	api.use('convexset:collection-tools');
	api.addFiles(['tests.js', ]);
	api.addFiles([], 'server');
	api.addFiles([], 'client');
});
