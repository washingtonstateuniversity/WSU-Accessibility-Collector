"use strict";

require( "dotenv" ).config();

if ( "undefined" === typeof( process.env.ES_INDEX ) ) {
	console.log( "No Elasticsearch Accessibility record index (ES_INDEX) defined." );
	process.exit();
}

if ( "undefined" === typeof( process.env.ES_URL_INDEX ) ) {
	console.log( "No Elasticsearch URL index (ES_URL_INDEX) defined." );
	process.exit();
}

if ( "undefined" === typeof( process.env.ES_HOST ) ) {
	console.log( "No Elasticsearch host instance (ES_HOST) defined." );
	process.exit();
}

var elastic = {};
var elasticsearch = require( "elasticsearch" );

elastic.client = new elasticsearch.Client( {
	host: process.env.ES_HOST,
	log: "error"
} );

var createIndex = function() {
	elastic.client.indices.create( {
		index: process.env.ES_INDEX,
		body: {
			mappings: {
				record: {
					properties: {
						url: {
							type: "keyword"
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
							type: "keyword"
						},
						type: {
							type: "keyword"
						},
						typeCode: {
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
	index: process.env.ES_INDEX
}, function( error, result ) {
	if ( true === result ) {
		console.log( "Index " + process.env.ES_INDEX + " already exists, mapping cannot be recreated." );
		process.exit();
	} else {
		createIndex();
	}
} );
