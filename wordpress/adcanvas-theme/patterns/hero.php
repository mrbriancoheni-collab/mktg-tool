<?php
/**
 * Title: Hero with product screenshot
 * Slug: adcanvas/hero
 * Categories: adcanvas-marketing, banner
 * Keywords: hero, header, intro, landing
 * Viewport Width: 1400
 */
?>
<!-- wp:group {"tagName":"section","align":"full","className":"adcanvas-hero","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|50"},"blockGap":"var:preset|spacing|40"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull adcanvas-hero" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--50)"><!-- wp:paragraph {"align":"center"} -->
<p class="has-text-align-center"><span class="adcanvas-pill"><?php esc_html_e( 'New: AI edits your funnel with a preview you approve', 'adcanvas' ); ?></span></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center","level":1} -->
<h1 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'Plan, launch and improve every ad campaign on one', 'adcanvas' ); ?> <span class="is-style-gradient"><?php esc_html_e( 'AI canvas', 'adcanvas' ); ?></span></h1>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","className":"adcanvas-lede","textColor":"muted","fontSize":"large"} -->
<p class="has-text-align-center adcanvas-lede has-muted-color has-text-color has-large-font-size"><?php esc_html_e( 'Map traffic sources, landing pages and follow-ups as connected steps. AI builds the plan, writes the ads, pulls in live results from Google Ads, GA4 and Meta, and tells you what to fix next.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://app.example.com/signup"><?php esc_html_e( 'Start free', 'adcanvas' ); ?></a></div>
<!-- /wp:button -->

<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#how-it-works"><?php esc_html_e( 'See how it works', 'adcanvas' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->

<!-- wp:paragraph {"align":"center","textColor":"muted","fontSize":"small"} -->
<p class="has-text-align-center has-muted-color has-text-color has-small-font-size"><?php esc_html_e( 'Free plan · No credit card · Set up in 2 minutes', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:image {"align":"wide","sizeSlug":"full","linkDestination":"none","className":"adcanvas-shot","style":{"spacing":{"margin":{"top":"var:preset|spacing|50"}}}} -->
<figure class="wp-block-image alignwide size-full adcanvas-shot" style="margin-top:var(--wp--preset--spacing--50)"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/app-canvas.webp' ) ); ?>" alt="<?php esc_attr_e( 'The AdCanvas canvas: a campaign funnel from ads to landing page to email, with spend, leads and ROAS in the toolbar', 'adcanvas' ); ?>"/></figure>
<!-- /wp:image --></section>
<!-- /wp:group -->
