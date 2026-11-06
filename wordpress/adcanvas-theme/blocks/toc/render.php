<?php
/**
 * Table of contents block.
 *
 * @package AdCanvas
 */

$adcanvas_post_id = (int) ( $block->context['postId'] ?? get_queried_object_id() );
if ( ! $adcanvas_post_id ) {
	return;
}
$adcanvas_headings = adcanvas_post_headings( $adcanvas_post_id );
$adcanvas_h2_count = count( array_filter( $adcanvas_headings, fn( $h ) => 2 === $h['level'] ) );
if ( $adcanvas_h2_count < (int) ( $attributes['minHeadings'] ?? 3 ) ) {
	return;
}
$adcanvas_items = '';
foreach ( $adcanvas_headings as $adcanvas_h ) {
	if ( 3 === $adcanvas_h['level'] && empty( $attributes['includeH3'] ) ) {
		continue;
	}
	$adcanvas_items .= sprintf( '<li class="is-level-%d"><a href="#%s">%s</a></li>', $adcanvas_h['level'], esc_attr( $adcanvas_h['id'] ), esc_html( $adcanvas_h['text'] ) );
}
printf(
	'<nav %s aria-labelledby="adcanvas-toc-title"><p class="adcanvas-toc-title" id="adcanvas-toc-title">%s</p><ol>%s</ol></nav>',
	get_block_wrapper_attributes( array( 'class' => 'adcanvas-toc' ) ), // phpcs:ignore WordPress.Security.EscapeOutput
	esc_html__( 'On this page', 'adcanvas' ),
	$adcanvas_items // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above.
);
