"use strict";

if ( process.argv.length < 3 ) {
	console.log( "Please specify a URL to scan." );
	process.exit();
}

require( "dotenv" ).config();

var collector = {};
var pa11y = require( "pa11y" );
var elasticsearch = require( "elasticsearch" );
var parse_url = require( "url" );
var url = parse_url.parse( process.argv[ 2 ] );

collector.collect = pa11y( {
	standard: "WCAG2AA",
	timeout: 3000,
	wait: 1000,
	page: {
		viewport: {
			width: 1366,
			height: 768
		}
	}
} );

collector.elastic = new elasticsearch.Client( {
	host: process.env.ES_HOST,
	log: "error"
} );

// Delete any previous records stored for this URL as either
// "record" or "url" document types.
collector.elastic.deleteByQuery( {
	index: process.env.ES_INDEX,
	body: {
		query: {
			term: {
				url: encodeURIComponent( url.href )
			}
		}
	}
}, function( error, response ) {
	if ( undefined !== typeof response ) {
		console.log( "Deleted " + response.total + " previous records for " + url.href + " in " + response.took + " ms." );
	}
} );

collector.collect.run( url.href, function( error, result ) {
	if ( error ) {
		return console.error( error.message );
	}

	var bulk_body = [];
	var urls_captured = [];

	// Append domain and URL information to each result and build a
	// set of bulk data to send to ES.
	for ( var i = 0, x = result.length; i < x; i++ ) {
		result[ i ].domain = url.hostname;
		result[ i ].url = encodeURIComponent( url.href );

		// Create a single document of the "url" type for each unique URL.
		if ( false === ( url.href in urls_captured ) ) {
			urls_captured[ url.href ] = 1;
			bulk_body.push( { index: { _index: process.env.ES_INDEX, _type: "url" } } );
			bulk_body.push( { domain: result[ i ].domain, url: result[ i ].url } );
		}

		// Create a single document of the "record type" for every record
		// returned against a URL.
		bulk_body.push( { index: { _index: process.env.ES_INDEX, _type: "record" } } );
		bulk_body.push( result[ i ] );
	}

	collector.elastic.bulk( {
		body: bulk_body
	}, function( err, response ) {
		if ( undefined !== typeof response ) {
			console.log( "Accessibility scan on " + url.href + " took " + response.took + "ms and logged " + response.items.length + " records." );
		} else {
			console.log( err );
		}
	} );
} );
