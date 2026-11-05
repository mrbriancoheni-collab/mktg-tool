<?php
/**
 * Title: Features grid (6 cards)
 * Slug: adcanvas/features-grid
 * Categories: adcanvas-marketing, features
 * Keywords: features, benefits, grid, cards
 */
$adcanvas_features = array(
	array( '✦', __( 'AI builds the plan', 'adcanvas' ), __( 'Describe the product, audience and budget. Get a complete funnel with channels, budgets and conversion assumptions in seconds — or start from 10 proven templates.', 'adcanvas' ) ),
	array( '⌘', __( 'Edit by asking', 'adcanvas' ), __( '“Add retargeting.” “Cut budget 15%.” The assistant explains the change and shows a preview on the canvas. Apply or discard in one click, undo any time.', 'adcanvas' ) ),
	array( '▤', __( 'Forecast before you spend', 'adcanvas' ), __( 'Spend, leads, customers, revenue, ROAS and CPA update as you build. What-if sliders and a budget optimizer show where the next dollar works hardest.', 'adcanvas' ) ),
	array( '✎', __( 'Ads written to spec', 'adcanvas' ), __( 'Ad packs that fit each platform’s character limits, landing page copy, emails and scripts, plus ad mockups in your brand colours. Publish to Google Ads and Meta as paused drafts.', 'adcanvas' ) ),
	array( '↯', __( 'Live results on the map', 'adcanvas' ), __( 'Connect Google Ads, GA4, Meta, LinkedIn, TikTok, Shopify, HubSpot and Salesforce. Campaigns match to steps automatically, and the dashboard tracks pacing and trends.', 'adcanvas' ) ),
	array( '◎', __( 'Know what to fix next', 'adcanvas' ), __( 'An AI health score, findings ranked by impact, and an experiment tracker with significance checks. Scheduled reports and alerts go to Slack or email.', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","anchor":"features","align":"full","className":"adcanvas-features","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|50"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section id="features" class="wp-block-group alignfull adcanvas-features" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"constrained","contentSize":"680px"}} -->
<div class="wp-block-group"><!-- wp:paragraph {"align":"center","className":"is-style-eyebrow"} -->
<p class="has-text-align-center is-style-eyebrow"><?php esc_html_e( 'Everything in one place', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'From brief to results without switching tools', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","textColor":"muted"} -->
<p class="has-text-align-center has-muted-color has-text-color"><?php esc_html_e( 'Plans, creative, tracking and analysis stay attached to the step they belong to, so the whole team sees the same picture.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->

<?php foreach ( array_chunk( $adcanvas_features, 3 ) as $adcanvas_row ) : ?>
<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"left":"var:preset|spacing|40","top":"var:preset|spacing|40"}}}} -->
<div class="wp-block-columns alignwide"><?php foreach ( $adcanvas_row as $adcanvas_f ) : ?><!-- wp:column -->
<div class="wp-block-column"><!-- wp:group {"className":"is-style-card","style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"default"}} -->
<div class="wp-block-group is-style-card"><!-- wp:paragraph {"className":"adcanvas-icon"} -->
<p class="adcanvas-icon"><?php echo esc_html( $adcanvas_f[0] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading"><?php echo esc_html( $adcanvas_f[1] ); ?></h3>
<!-- /wp:heading -->

<!-- wp:paragraph {"textColor":"muted"} -->
<p class="has-muted-color has-text-color"><?php echo esc_html( $adcanvas_f[2] ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:column -->

<?php endforeach; ?></div>
<!-- /wp:columns -->
<?php endforeach; ?></section>
<!-- /wp:group -->
