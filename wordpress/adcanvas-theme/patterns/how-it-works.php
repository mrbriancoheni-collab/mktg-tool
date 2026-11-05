<?php
/**
 * Title: How it works (3 steps)
 * Slug: adcanvas/how-it-works
 * Categories: adcanvas-marketing
 * Keywords: steps, process, how it works
 */
$adcanvas_steps = array(
	array( __( 'Describe your campaign', 'adcanvas' ), __( 'Product, audience, budget and goal. AI Build lays out the funnel, or pick a template for e-commerce, SaaS trials, B2B demos, local services and more.', 'adcanvas' ) ),
	array( __( 'Shape it with AI', 'adcanvas' ), __( 'Drag steps, split traffic, and ask the assistant for changes. Generate ads, landing pages and emails for each step and export or publish them as drafts.', 'adcanvas' ) ),
	array( __( 'Connect and improve', 'adcanvas' ), __( 'Link your ad and analytics accounts. Real numbers replace the forecast, and AI points out the weakest step and the experiment to run next.', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","anchor":"how-it-works","align":"full","backgroundColor":"surface","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|50"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section id="how-it-works" class="wp-block-group alignfull has-surface-background-color has-background" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"constrained","contentSize":"680px"}} -->
<div class="wp-block-group"><!-- wp:paragraph {"align":"center","className":"is-style-eyebrow"} -->
<p class="has-text-align-center is-style-eyebrow"><?php esc_html_e( 'How it works', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'A working campaign plan in three steps', 'adcanvas' ); ?></h2>
<!-- /wp:heading --></div>
<!-- /wp:group -->

<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"left":"var:preset|spacing|50"}}}} -->
<div class="wp-block-columns alignwide"><?php foreach ( $adcanvas_steps as $adcanvas_i => $adcanvas_s ) : ?><!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph {"className":"adcanvas-step-num"} -->
<p class="adcanvas-step-num"><?php echo (int) $adcanvas_i + 1; ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3,"fontSize":"large"} -->
<h3 class="wp-block-heading has-large-font-size"><?php echo esc_html( $adcanvas_s[0] ); ?></h3>
<!-- /wp:heading -->

<!-- wp:paragraph {"textColor":"muted"} -->
<p class="has-muted-color has-text-color"><?php echo esc_html( $adcanvas_s[1] ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<?php endforeach; ?></div>
<!-- /wp:columns --></section>
<!-- /wp:group -->
