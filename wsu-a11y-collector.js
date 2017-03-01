"use strict";

if ( process.argv.length < 3 ) {
	console.log( "Please specify a URL to scan." );
	process.exit();
}

var collector = {};
var pa11y = require( "pa11y" );
var elasticsearch = require( "elasticsearch" );
var parse_url = require( "url" );
var url = parse_url.parse( process.argv[ 2 ] );

collector.collect = pa11y( {
	standard: "WCAG2AA",
	page: {
		viewport: {
			width: 1366,
			height: 768
		}
	}
} );

collector.elastic = new elasticsearch.Client( {
	host: "https://elastic.wsu.edu",
	log: "error"
} );

// Delete any previous records stored for this URL.
collector.elastic.deleteByQuery( {
	index: "a11y-scan",
    q: "url:" + encodeURIComponent( url.href ),
	body: {}
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

	// Append domain and URL information to each result and build a
	// set of bulk data to send to ES.
	for ( var i = 0, x = result.length; i < x; i++ ) {
		result[ i ].domain = url.hostname;
		result[ i ].url = url.href;

		bulk_body.push( { index: { _index: "a11y-scan", _type: "scan-record" } } );
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
