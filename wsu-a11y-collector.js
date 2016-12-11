/*global phantom, require, console */
var PATH_TO_AXE = "node_modules/axe-core/axe.min.js";
var args = require( "system" ).args;
var fs = require( "fs" );
var page = require( "webpage" ).create();

if ( args.length < 2 ) {
	console.log( "Argument required: please specify the URL to test." );
	phantom.exit( 1 );
}

page.open( args[ 1 ], function( status ) {

	// Check for page load success
	if ( status !== "success" ) {
		console.log( "Unable to access the URL" );
		return;
	}

	page.injectJs( PATH_TO_AXE );
	page.framesName.forEach( function( name ) {
		page.switchToFrame( name );
		page.injectJs( PATH_TO_AXE );
	} );
	page.switchToMainFrame();
	page.evaluateAsync( function() {

		/*global window, axe */
		axe.a11yCheck( window.document, null, function( results ) {
			window.callPhantom( results );
		} );
	} );

	page.onCallback = function( msg ) {
		console.log( msg.url );
		console.log( msg.timestamp );
		console.log( msg.violations.length );
		console.log( msg.passes.length );

		fs.write( "results.json", JSON.stringify( msg, null, "  " ), "w" );

		phantom.exit();
	};
} );
