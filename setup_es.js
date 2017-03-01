"use strict";

var elastic = {};
var elasticsearch = require( "elasticsearch" );

elastic.client = new elasticsearch.Client( {
	host: "https://elastic.wsu.edu",
	log: "error"
} );

var createIndex = function() {
	elastic.client.indices.create( {
		index: "a11y-again",
		body: {
			mappings: {
				record: {
					properties: {
						url: {
							type: "text"
						},
						domain: {
							type: "keyword"
						},
						date: {
							type: "date",
							format: "epoch_millis"
						},
						code: {
							type: "keyword"
						},
						context: {
							type: "text"
						},
						message: {
							type: "text"
						},
						selector: {
							type: "text"
						},
						type: {
							type: "keyword"
						},
						typeCode: {
							type: "integer"
						}
					}
				},
				url: {
					properties: {
						url: {
							type: "text"
						},
						domain: {
							type: "keyword"
						},
						lastscanned: {
							type: "date",
							format: "epoch_millis"
						},
						force: {
							type: "integer"
						}
					}
				}
			}
		}
	}, function( error, response ) {
		if ( undefined !== typeof response && true === response.acknowledged ) {
			console.log( "Index schema created." );
		} else {
			console.log( "Error with index creation." );
			console.log( error );
		}
	} );
};

elastic.client.indices.exists( {
	index: "a11y-again"
}, function( error, result ) {
	if ( true === result ) {
		console.log( "Index already exists, mapping cannot be recreated." );
		process.exit();
	} else {
		createIndex();
	}
} );
