"use strict";

var collector = {};
var pa11y = require( "pa11y" );
var elasticsearch = require( "elasticsearch" );

var url = "https://wsu.edu";
var domain = "wsu.edu";

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
    q: "url:" + encodeURIComponent( url ),
	body: {}
}, function( error, response ) {
	if ( undefined !== typeof response ) {
		console.log( "Deleted " + response.total + " previous records for " + url + " in " + response.took + " ms." );
	}
} );

collector.collect.run( url, function( error, result ) {
	if ( error ) {
		return console.error( error.message );
	}

	var bulk_body = [];

	// Append domain and URL information to each result and build a
	// set of bulk data to send to ES.
	for ( var i = 0, x = result.length; i < x; i++ ) {
		result[ i ].domain = domain;
		result[ i ].url = url;

		bulk_body.push( { index: { _index: "a11y-scan", _type: "scan-record" } } );
		bulk_body.push( result[ i ] );
	}

	collector.elastic.bulk( {
		body: bulk_body
	}, function( err, response ) {
		if ( undefined !== typeof response ) {
			console.log( "Accessibility scan on " + url + " took " + response.took + "ms and logged " + response.items.length + " records." );
		} else {
			console.log( err );
		}
	} );
} );
