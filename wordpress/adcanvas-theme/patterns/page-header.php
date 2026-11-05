<?php
/**
 * Title: Page header (eyebrow, title, intro)
 * Slug: adcanvas/page-header
 * Categories: adcanvas-marketing, header
 * Keywords: page title, intro, header
 */
?>
<!-- wp:group {"tagName":"section","align":"full","className":"adcanvas-hero","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|50"},"blockGap":"var:preset|spacing|30"}},"layout":{"type":"constrained","contentSize":"760px"}} -->
<section class="wp-block-group alignfull adcanvas-hero" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--50)"><!-- wp:paragraph {"align":"center","className":"is-style-eyebrow"} -->
<p class="has-text-align-center is-style-eyebrow"><?php esc_html_e( 'Eyebrow', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center","level":1,"fontSize":"xx-large"} -->
<h1 class="wp-block-heading has-text-align-center has-xx-large-font-size"><?php esc_html_e( 'Page title', 'adcanvas' ); ?></h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","textColor":"muted","fontSize":"large"} -->
<p class="has-text-align-center has-muted-color has-text-color has-large-font-size"><?php esc_html_e( 'One or two sentences that tell visitors what this page is about.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph --></section>
<!-- /wp:group -->
