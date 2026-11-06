<?php
/**
 * Breadcrumbs block.
 *
 * @package AdCanvas
 */

$adcanvas_trail = adcanvas_breadcrumb_trail();
if ( count( $adcanvas_trail ) < 2 ) {
	return;
}
$adcanvas_items = '';
$adcanvas_last  = count( $adcanvas_trail ) - 1;
foreach ( $adcanvas_trail as $adcanvas_i => list( $adcanvas_name, $adcanvas_url ) ) {
	$adcanvas_items .= $adcanvas_i === $adcanvas_last || '' === $adcanvas_url
		? '<li aria-current="page">' . esc_html( $adcanvas_name ) . '</li>'
		: '<li><a href="' . esc_url( $adcanvas_url ) . '">' . esc_html( $adcanvas_name ) . '</a></li>';
}
printf(
	'<nav %s aria-label="%s"><ol>%s</ol></nav>',
	get_block_wrapper_attributes( array( 'class' => 'adcanvas-breadcrumbs' ) ), // phpcs:ignore WordPress.Security.EscapeOutput
	esc_attr__( 'Breadcrumb', 'adcanvas' ),
	$adcanvas_items // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above.
);
