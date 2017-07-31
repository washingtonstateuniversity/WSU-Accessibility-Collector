"use strict";

var es = require( "elasticsearch" );
var pa11y = require( "pa11y" );
const util = require( "util" );

require( "dotenv" ).config();

/**
 * Store data used by the collector.
 *
 * @type {{url_cache: Array}}
 */
var wsu_a11y_collector = {
	url_cache: [],
	current_urls: [],
	active_scans: 0,
	active_scanner: false,
	locker_locked: false,
	lock_key: null,
	locked_urls: 0,
	scanner_age: 0
};

wsu_a11y_collector.lock_key = process.env.LOCK_KEY;

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
 * Decrease the active scan count.
 */
function closeScan() {
	wsu_a11y_collector.active_scans--;
}

/**
 * Lock the next URL to be scanned with the accessibility collector.
 *
 * Looks for URLs in this order:
 *
 * - Flagged with a priority higher than 0.
 * - Has never been scanned.
 * - Least recently scanned.
 *
 * @returns {*}
 */
function lockURL() {

	// Do not lock any URLs when the lock limit has been reached.
	if ( wsu_a11y_collector.locker_locked === true ) {
		return;
	}

	var elastic = getElastic();

	// Look for any URLs that have been prioritized.
	return elastic.updateByQuery( {
		index: process.env.ES_URL_INDEX,
		type: "url",
		body: {
			size: 2,
			query: {
				bool: {
					must: [
						{
							range: {
								a11y_scan_priority: {
									gte: 1,
									lte: 999
								}
							}
						},
						{ match: { status_code: 200 } }
					]
				}
			},
			sort: [
				{
					a11y_scan_priority: {
						order: "asc"
					}
				}
			],
			script: {
				inline: "ctx._source.a11y_scan_priority = " + wsu_a11y_collector.lock_key
			}
		}
	} ).then( function( response ) {
		if ( 1 <= response.updated ) {
			wsu_a11y_collector.locked_urls += response.updated;
			throw response.updated;
		}

		return elastic.updateByQuery( {
			index: process.env.ES_URL_INDEX,
			type: "url",
			body: {
				size: 2,
				query: {
					bool: {
						must_not: [
							{ exists: { field: "last_a11y_scan" } },
							{ exists: { field: "a11y_scan_priority" } }
						],
						must: [
							{ match: { status_code: 200 } }
						]
					}
				},
				script: {
					inline: "ctx._source.a11y_scan_priority = " + wsu_a11y_collector.lock_key
				}
			}
		} ).then( function( response ) {
			if ( 1 <= response.updated ) {
				wsu_a11y_collector.locked_urls += response.updated;
				throw response.updated;
			}

			return elastic.updateByQuery( {
				index: process.env.ES_URL_INDEX,
				type: "url",
				body: {
					size: 2,
					query: {
						bool: {
							must_not: [
								{ exists: { field: "a11y_scan_priority" } }
							],
							must: [
								{ exists: { field: "last_a11y_scan" } },
								{
									range: {
										last_a11y_scan: {
											"lte": "now-1d/d"
										}
									}
								},
								{ match: { status_code: 200 } }
							]
						}
					},
					sort: [
						{
							last_a11y_scan: {
								order: "asc"
							}
						}
					],
					script: {
						inline: "ctx._source.search_scan_priority = " + wsu_a11y_collector.lock_key
					}
				}
			} ).then( function( response ) {
				if ( 1 <= response.updated ) {
					wsu_a11y_collector.locked_urls += response.updated;
					throw response.updated;
				}

				return 0;
			} );
		} );
	} ).then( function( response ) {
		throw response;
	} ).catch( function( response ) {
		return response;
	} );
}

/**
 * Mark a URL as unresponsive when multiple attempts failed.
 *
 * @param url
 */
function markURLUnresponsive( url ) {
	if ( "undefined" === typeof wsu_a11y_collector.url_cache[ url ] ) {
		util.log( "Error updating "  + url + " and not found in URL cache." );
		return;
	}

	var elastic = getElastic();
	var d = new Date();

	elastic.update( {
		index: process.env.ES_URL_INDEX,
		type: "url",
		id: wsu_a11y_collector.url_cache[ url ].id,
		body: {
			doc: {
				identity: "unknown",
				analytics: "unknown",
				status_code: 800,
				redirect_url: null,
				search_scan_priority: null,
				a11y_scan_priority: null,
				last_a11y_scan: d.getTime(),
				anchor_scan_priority: null
			}
		}
	} )
	.then( function() {
		delete wsu_a11y_collector.url_cache[ url ];
		util.log( "URL marked unresponsive: " + url );
	} )
	.catch( function( error ) {

		// @todo what do do with a failed scan?
		util.log( "Error (updateURLData 2): " + url + " " + error.message );
	} );
}

/**
 * Queue any locked URLs for accessibility collection.
 *
 * @returns {*}
 */
function queueLockedURLs() {
	var elastic = getElastic();
	var queued = 0;

	elastic.search( {
		index: process.env.ES_URL_INDEX,
		type: "url",
		body: {
			size: 2,
			query: {
				match: {
					"a11y_scan_priority": wsu_a11y_collector.lock_key
				}
			}
		}
	} ).then( function( response ) {
		if ( response.hits.total >= 25 ) {
			wsu_a11y_collector.locker_locked = true;
		} else {
			wsu_a11y_collector.locker_locked = false;
		}

		for ( var j = 0, y = response.hits.hits.length; j < y; j++ ) {

			// Skip URLs that are already queued to be scanned.
			if ( response.hits.hits[ j ]._source.url in wsu_a11y_collector.url_cache ) {
				wsu_a11y_collector.url_cache[ response.hits.hits[ j ]._source.url ].count++;

				if ( 30 <= wsu_a11y_collector.url_cache[ response.hits.hits[ j ]._source.url ].count ) {
					markURLUnresponsive( response.hits.hits[ j ]._source.url );
				}
				continue;
			}

			// Skip URLs that are currently being scanned.
			if ( response.hits.hits[ j ]._source.url in wsu_a11y_collector.current_urls ) {
				continue;
			}

			queued++;

			wsu_a11y_collector.url_cache[ response.hits.hits[ j ]._source.url ] = {
				id: response.hits.hits[ j ]._id,
				url: response.hits.hits[ j ]._source.url,
				domain: response.hits.hits[ j ]._source.domain,
				count: 1
			};
		}

		if ( 1 <= response.hits.hits.length ) {
			util.log( "QID" + wsu_a11y_collector.lock_key + ": " + queued + " added, " + Object.keys( wsu_a11y_collector.url_cache ).length + " existing" );
			setTimeout( queueLockedURLs, 1000 );
			return true;
		}

		util.log( "QID" + wsu_a11y_collector.lock_key + ": No locked URLs found to queue." );
		throw 0;
	} ).catch( function( error ) {
		setTimeout( queueLockedURLs, 1000 );
		util.log( "QID" + wsu_a11y_collector.lock_key + " (error): " + error );
		throw 0;
	} );
}

/**
 * Retrieve the next URL from the URL cache to be scanned.
 *
 * @returns {*}
 */
function getURL() {

	// Check for a URL in the existing cache from our last lookup.
	if ( 0 !== Object.keys( wsu_a11y_collector.url_cache ).length ) {
		var url_cache = wsu_a11y_collector.url_cache[ Object.keys( wsu_a11y_collector.url_cache )[ 0 ] ];
		wsu_a11y_collector.current_urls.push( url_cache.url );
		delete wsu_a11y_collector.url_cache[ Object.keys( wsu_a11y_collector.url_cache )[ 0 ] ];

		return {
			id: url_cache.id,
			url: url_cache.url,
			domain: url_cache.domain
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
				util.log( "QID" + wsu_a11y_collector.lock_key + ": Deleted " + response.total + " records for " + url_data.url + " in " + response.took + " ms." );
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
		if ( false === wsu_a11y_collector.active_scanner ) {
			wsu_a11y_collector.active_scanner = getScanner();
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
					util.log( "QID" +  wsu_a11y_collector.lock_key + ": Logged " + response.items.length + " records for " + url_data.url + " in " + response.took + "ms." );
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
				last_a11y_scan: d.getTime(),
				a11y_scan_priority: null
			}
		}
	} ).then( function() {
		delete wsu_a11y_collector.current_urls[ url_data.url ];
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
	wsu_a11y_collector.scanner_age++;
	util.log( "QID" + wsu_a11y_collector.lock_key + ": Start " + url_data.url + ", scanner age " + wsu_a11y_collector.scanner_age );

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
	if ( 2 > wsu_a11y_collector.active_scans ) {
		wsu_a11y_collector.active_scans++;
		setTimeout( processScan, 100 );
	}

	setTimeout( queueScans, 500 );
}

// Start things up immediately on run.
setTimeout( queueScans, 2000 );
setInterval( lockURL, 1000 );
setTimeout( queueLockedURLs, 1000 );
