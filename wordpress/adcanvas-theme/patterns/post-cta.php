<?php
/**
 * Title: Post call to action (end of article)
 * Slug: adcanvas/post-cta
 * Categories: adcanvas-blog, call-to-action
 * Keywords: cta, signup, blog
 * Block Types: core/template-part/uncategorized
 */
?>
<!-- wp:group {"className":"adcanvas-cta","style":{"spacing":{"padding":{"top":"var:preset|spacing|50","bottom":"var:preset|spacing|50","left":"var:preset|spacing|40","right":"var:preset|spacing|40"},"blockGap":"var:preset|spacing|30"}},"gradient":"brand","layout":{"type":"constrained"}} -->
<div class="wp-block-group adcanvas-cta has-brand-gradient-background has-background" style="padding-top:var(--wp--preset--spacing--50);padding-right:var(--wp--preset--spacing--40);padding-bottom:var(--wp--preset--spacing--50);padding-left:var(--wp--preset--spacing--40)"><!-- wp:heading {"textAlign":"center","fontSize":"x-large"} -->
<h2 class="wp-block-heading has-text-align-center has-x-large-font-size"><?php esc_html_e( 'Put this into practice on a canvas', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center"><?php esc_html_e( 'AdCanvas maps your funnel, forecasts results and writes the ads. Free to start.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://app.example.com/signup?utm_source=blog&amp;utm_medium=post_cta"><?php esc_html_e( 'Try AdCanvas free', 'adcanvas' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div>
<!-- /wp:group -->
