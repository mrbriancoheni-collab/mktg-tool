<?php
// Expands a block theme's templates (patterns + template parts) into plain block markup,
// using minimal stand-ins for the WordPress functions the patterns call.
define( 'ABSPATH', __DIR__ );
$theme = $argv[1];
$out   = $argv[2];
function __( $s ) { return $s; }
function _e( $s ) { echo $s; }
function esc_html__( $s ) { return htmlspecialchars( $s, ENT_QUOTES ); }
function esc_html_e( $s ) { echo htmlspecialchars( $s, ENT_QUOTES ); }
function esc_attr_e( $s ) { echo htmlspecialchars( $s, ENT_QUOTES ); }
function esc_html( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_attr( $s ) { return htmlspecialchars( (string) $s, ENT_QUOTES ); }
function esc_url( $s ) { return str_replace( '&', '&#038;', (string) $s ); }
function get_theme_file_uri( $p ) { return 'theme/' . $p; }
require "$theme/inc/plans.php";
$patterns = array();
foreach ( glob( "$theme/patterns/*.php" ) as $f ) {
	preg_match( '/^\s*\*\s*Slug:\s*(\S+)/m', file_get_contents( $f ), $m );
	$patterns[ $m[1] ] = $f;
}
function expand( $markup, $theme, $patterns, $depth = 0 ) {
	if ( $depth > 8 ) { throw new Exception( 'recursion' ); }
	$markup = preg_replace_callback( '#<!-- wp:pattern (\{.*?\}) /-->#', function ( $m ) use ( $theme, $patterns, $depth ) {
		$a = json_decode( $m[1], true );
		if ( empty( $patterns[ $a['slug'] ] ) ) { fwrite( STDERR, "missing pattern {$a['slug']}\n" ); exit( 1 ); }
		ob_start(); include $patterns[ $a['slug'] ]; $html = ob_get_clean();
		return expand( $html, $theme, $patterns, $depth + 1 );
	}, $markup );
	return preg_replace_callback( '#<!-- wp:template-part (\{.*?\}) /-->#', function ( $m ) use ( $theme, $patterns, $depth ) {
		$a = json_decode( $m[1], true );
		$f = "$theme/parts/{$a['slug']}.html";
		if ( ! file_exists( $f ) ) { fwrite( STDERR, "missing part {$a['slug']}\n" ); exit( 1 ); }
		return "<!-- wp:adcanvas-part {$m[1]} -->\n" . expand( file_get_contents( $f ), $theme, $patterns, $depth + 1 ) . "\n<!-- /wp:adcanvas-part -->";
	}, $markup );
}
@mkdir( $out );
foreach ( glob( "$theme/templates/*.html" ) as $t ) {
	file_put_contents( "$out/" . basename( $t ), expand( file_get_contents( $t ), $theme, $patterns ) );
}
foreach ( $patterns as $slug => $f ) {
	ob_start(); include $f; file_put_contents( "$out/pattern-" . str_replace( '/', '-', $slug ) . '.html', ob_get_clean() );
}
echo count( $patterns ) . " patterns, " . count( glob( "$theme/templates/*.html" ) ) . " templates expanded\n";
