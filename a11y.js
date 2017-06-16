"use strict";

var es = require( "elasticsearch" );
var pa11y = require( "pa11y" );
const util = require( "util" );

require( "dotenv" ).config();

/**
 * Store data used by the collector.
 *
 * @type {{url_cache: Array, flagged_domains: Array}}
 */
var wsu_a11y_collector = {
	url_cache: [],
	active_scans: 0,
	active_scanner: false,
	scanner_age: 0,
	scanner_age_last: 0,
	active_population: false,
	flagged_domains: [] // Subdomains flagged to not be scanned.
};

/**
 * Retrieve an instance of the Elasticsearch client.
 *
 * @returns {es.Client}
 */
function getElastic() {
	return new es.Client( {
		host: process.env.ES_HOST,
		log: "error"
	} );
}

/**
 * Retrieve an instance of the accessibility scanner.
 *
 * @returns {pa11y}
 */
function getScanner() {
	return pa11y( {
		standard: "WCAG2AA",
		timeout: 10000,
		wait: 10,
		page: {
			viewport: {
				width: 1366,
				height: 768
			},
			settings: {
				resourceTimeout: 10000,
				userAgent: "WSU Accessibility Crawler: web.wsu.edu/crawler/"
			}
		}
	} );
}

/**
 * Check the health of the scanner on a regular basis so that it
 * can be restarted if stalled.
 */
function checkScannerHealth() {
	if ( 0 !== wsu_a11y_collector.scanner_age && wsu_a11y_collector.scanner_age === wsu_a11y_collector.scanner_age_last ) {
		util.log( "Scanner Health: Stalled, " + wsu_a11y_collector.scanner_age + " scans" );
		wsu_a11y_collector.active_scanner = false;
	} else {
		util.log( "Scanner Health: Active, " + wsu_a11y_collector.scanner_age + " scans" );
	}

	wsu_a11y_collector.scanner_age_last = wsu_a11y_collector.scanner_age;
	setTimeout( checkScannerHealth, 60000 );
}

/**
 * Mark URL population as inactive.
 */
function closePopulation() {
	wsu_a11y_collector.active_population = false;
}

/**
 * Decrease the active scan count.
 */
function closeScan() {
	if ( 1 === wsu_a11y_collector.active_scans ) {
		wsu_a11y_collector.active_scans = 0;
	}
}

/**
 * Retrieve the next set of URLs used to populate the collector queue and
 * add it to the url cache.
 */
function populateURLCache() {
	var elastic = getElastic();

	elastic.msearch( {
		index: process.env.ES_URL_INDEX,
		type: "url",
		body: [

			// Query for URLs that have never been scanned.
			{},
			{
				query: {
					bool: {
						must_not: [
							{
								exists: {
									field: "last_a11y_scan"
								}
							}
						],
						must: [
							{
								match: {
									status_code: 200
								}
							}
						]
					}
				},
				size: 5
			},

			// Query for least recently scanned URLs.
			{},
			{
				sort: [
					{
						last_a11y_scan: {
							"order": "asc"
						}
					}
				],
				query: {
					bool: {
						must: [
							{
								exists: {
									field: "last_a11y_scan"
								}
							},
							{
								match: {
									status_code: 200
								}
							}
						]
					}
				},
				size: 5
			}
		]
	} ).then( function( response ) {
		if ( 2 !== response.responses.length ) {
			util.log( "Error (populateURLCache): Invalid response set from multisearch" );
		} else {
			if ( 0 !== response.responses[ 0 ].hits.hits.length ) {
				wsu_a11y_collector.url_cache = wsu_a11y_collector.url_cache.concat( response.responses[ 0 ].hits.hits );
			}

			if ( 0 !== response.responses[ 1 ].hits.hits.length ) {
				wsu_a11y_collector.url_cache = wsu_a11y_collector.url_cache.concat( response.responses[ 1 ].hits.hits );
			}

			util.log( "URL Cache: " + wsu_a11y_collector.url_cache.length + " URLs waiting scan" );
		}
		closePopulation();
	}, function( error ) {
		closePopulation();
		util.log( "Error (populateURLCache): " + error.message );
	} );
}

/**
 * Retrieve the next URL from the URL cache to be scanned.
 *
 * @returns {*}
 */
function getURL() {

	// Check for a URL in the existing cache from our last lookup.
	if ( 0 !== wsu_a11y_collector.url_cache.length ) {
		var url_cache = wsu_a11y_collector.url_cache.shift();

		return {
			id: url_cache._id,
			url: url_cache._source.url,
			domain: url_cache._source.domain
		};
	}

	return false;
}

// Deletes the existing accessibility records for a URL from the ES index.
function deleteAccessibilityRecord( url_data ) {
	return new Promise( function( resolve, reject ) {
		var elastic = getElastic();

		elastic.deleteByQuery( {
			index: process.env.ES_INDEX,
			body: {
				query: {
					term: {
						url: url_data.url
					}
				}
			}
		}, function( error, response ) {
			if ( undefined !== typeof response ) {
				util.log( "Deleted " + response.total + " previous records in " + response.took + " ms." );
				resolve( url_data );
			} else {
				reject( "Error deleting accessibility records for " + url_data.url );
			}
		} );
	} );
}

// Scans a URL for accessibility issues using Pa11y and logs
// these results to an ES index.
function scanAccessibility( url_data ) {
	return new Promise( function( resolve ) {
		if ( -1 < wsu_a11y_collector.flagged_domains.indexOf( url_data.domain ) ) {
			util.log( "Error: Skipping flagged domain " + url_data.domain );
			resolve( url_data );
			return;
		}

		if ( false === wsu_a11y_collector.active_scanner ) {
			wsu_a11y_collector.active_scanner = getScanner();
			util.log( "Scanner Health: Reset scanner" );
			wsu_a11y_collector.scanner_age = 1;
		}

		wsu_a11y_collector.active_scanner.run( url_data.url, function( error, result ) {
			if ( error ) {
				util.log( error.message );
				resolve( url_data );
				return;
			}

			if ( "undefined" === typeof result ) {
				util.log( "Scanning failed or had 0 results for " + url_data.url );
				resolve( url_data );
				return;
			}

			var bulk_body = [];

			// Append domain and URL information to each result and build a
			// set of bulk data to send to ES.
			for ( var i = 0, x = result.length; i < x; i++ ) {

				result[ i ].domain = url_data.domain;
				result[ i ].url = url_data.url;

				// Create a single document of the "record type" for every record
				// returned against a URL.
				bulk_body.push( { index: { _index: process.env.ES_INDEX, _type: "record" } } );
				bulk_body.push( result[ i ] );
			}

			var elastic = getElastic();

			elastic.bulk( {
				body: bulk_body
			}, function( err, response ) {
				if ( undefined !== typeof response ) {
					util.log( "Scan complete: Logged " + response.items.length + " records in " + response.took + "ms." );
					resolve( url_data );
				} else {
					util.log( err );
					resolve( url_data );
				}
			} );
		} );
	} );
}

// Logs the completion of a scan by updating the last updated
// date in the URL index.
function logScanDate( url_data ) {
	var d = new Date();

	var elastic = getElastic();

	elastic.update( {
		index: process.env.ES_URL_INDEX,
		type: "url",
		id: url_data.id,
		body: {
			doc: {
				last_a11y_scan: d.getTime()
			}
		}
	} ).then( function() {
		closeScan();
	}, function( error ) {
		closeScan();
		util.log( "Error: " + error.message );
	} );
}

// Manages the scan of an individual URL. Triggers the deletion of
// previous associated records and then triggers the collection of
// new accessibility data.
function scanURL( url_data ) {
	util.log( "Scan " + url_data.url );

	wsu_a11y_collector.scanner_age++;

	return new Promise( function( resolve, reject ) {
		deleteAccessibilityRecord( url_data )
			.then( scanAccessibility )
			.then( function( url_data ) {
				resolve( url_data );
			} )
			.catch( function( error ) {
				reject( error );
			} );
	} );
}

// Manages the process of the scan from start to finish.
function processScan() {
	var url_data = getURL();

	if ( false !== url_data ) {
		scanURL( url_data )
			.then( logScanDate )
			.catch( function( error ) {
				closeScan();
				util.log( "Error (processScan): " + error.message );
			} );
	} else {
		closeScan();
	}
}

/**
 * Start a new scan process whenever fewer than 10 scans
 * are active.
 */
function queueScans() {
	if ( 0 === wsu_a11y_collector.active_scans ) {
		wsu_a11y_collector.active_scans = 1;
		setTimeout( processScan, 100 );
	}

	if ( 2 > wsu_a11y_collector.url_cache.length && false === wsu_a11y_collector.active_population ) {
		wsu_a11y_collector.active_population = true;
		setTimeout( populateURLCache, 2000 );
	}

	setTimeout( queueScans, 500 );
}

// Start things up immediately on run.
queueScans();

setTimeout( checkScannerHealth, 60000 );
