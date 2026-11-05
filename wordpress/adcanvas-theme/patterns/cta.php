<?php
/**
 * Title: Call to action band
 * Slug: adcanvas/cta
 * Categories: adcanvas-marketing, call-to-action
 * Keywords: cta, signup, banner
 */
?>
<!-- wp:group {"tagName":"section","align":"full","style":{"spacing":{"padding":{"top":"var:preset|spacing|50","bottom":"var:preset|spacing|60"}}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull" style="padding-top:var(--wp--preset--spacing--50);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"align":"wide","className":"adcanvas-cta","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60","left":"var:preset|spacing|40","right":"var:preset|spacing|40"},"blockGap":"var:preset|spacing|30"}},"gradient":"brand","layout":{"type":"constrained","contentSize":"640px"}} -->
<div class="wp-block-group alignwide adcanvas-cta has-brand-gradient-background has-background" style="padding-top:var(--wp--preset--spacing--60);padding-right:var(--wp--preset--spacing--40);padding-bottom:var(--wp--preset--spacing--60);padding-left:var(--wp--preset--spacing--40)"><!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'Map your next campaign in minutes', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","fontSize":"large"} -->
<p class="has-text-align-center has-large-font-size"><?php esc_html_e( 'Describe what you sell and who to. AI builds the funnel, the forecast and the first ads.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://app.example.com/signup"><?php esc_html_e( 'Start free', 'adcanvas' ); ?></a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="/pricing/"><?php esc_html_e( 'Compare plans', 'adcanvas' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div>
<!-- /wp:group --></section>
<!-- /wp:group -->
