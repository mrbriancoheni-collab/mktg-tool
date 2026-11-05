<?php
/**
 * Title: Testimonials (placeholders — replace before launch)
 * Slug: adcanvas/testimonials
 * Categories: adcanvas-marketing, testimonials
 * Keywords: quotes, reviews, testimonials, social proof
 *
 * These are placeholders. Replace them with real, attributable customer quotes
 * (with permission) before publishing — fabricated testimonials are deceptive
 * advertising in most jurisdictions.
 */
$adcanvas_quotes = array(
	array( __( '[REPLACE: A real customer quote about planning faster or cutting wasted spend.]', 'adcanvas' ), __( '[Name], [Title], [Company]', 'adcanvas' ) ),
	array( __( '[REPLACE: A real customer quote about the AI assistant or ad copy.]', 'adcanvas' ), __( '[Name], [Title], [Company]', 'adcanvas' ) ),
	array( __( '[REPLACE: A real agency quote about client reporting or workspaces.]', 'adcanvas' ), __( '[Name], [Title], [Agency]', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","align":"full","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|50"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'What marketers say', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"left":"var:preset|spacing|40"}}}} -->
<div class="wp-block-columns alignwide"><?php foreach ( $adcanvas_quotes as $adcanvas_q ) : ?><!-- wp:column -->
<div class="wp-block-column"><!-- wp:group {"className":"is-style-card","style":{"spacing":{"blockGap":"var:preset|spacing|30"}},"layout":{"type":"default"}} -->
<div class="wp-block-group is-style-card"><!-- wp:paragraph {"className":"adcanvas-quote"} -->
<p class="adcanvas-quote">“<?php echo esc_html( $adcanvas_q[0] ); ?>”</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"adcanvas-quote-by"} -->
<p class="adcanvas-quote-by">— <?php echo esc_html( $adcanvas_q[1] ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:column --><?php endforeach; ?></div>
<!-- /wp:columns --></section>
<!-- /wp:group -->
