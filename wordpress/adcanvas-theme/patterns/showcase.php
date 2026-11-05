<?php
/**
 * Title: Product showcase (alternating screenshots)
 * Slug: adcanvas/showcase
 * Categories: adcanvas-marketing, featured
 * Keywords: screenshots, product, media, tour
 */
$adcanvas_rows = array(
	array(
		'img'    => 'app-ai.webp',
		'w'      => 760,
		'h'      => 1100,
		'alt'    => __( 'The AI assistant proposing a retargeting step, with Apply and Discard buttons', 'adcanvas' ),
		'eyebrow' => __( 'AI assistant', 'adcanvas' ),
		'title'  => __( 'Ask for a change. See it before it happens.', 'adcanvas' ),
		'body'   => __( 'The assistant reads the whole funnel, explains what it would change and why, and previews the edit on the canvas. Nothing changes until you apply it.', 'adcanvas' ),
		'points' => array( __( 'Add channels, retargeting or follow-ups', 'adcanvas' ), __( 'Rebalance budget toward the best ROAS', 'adcanvas' ), __( 'Undo any applied change', 'adcanvas' ) ),
	),
	array(
		'img'    => 'app-dashboard.webp',
		'w'      => 2400,
		'h'      => 1433,
		'alt'    => __( 'The dashboard with spend, revenue and ROAS trends, budget pacing and a channel breakdown', 'adcanvas' ),
		'eyebrow' => __( 'Dashboard', 'adcanvas' ),
		'title'  => __( 'Live numbers, compared with the plan', 'adcanvas' ),
		'body'   => __( 'Daily history from every connected account, with date ranges, period-over-period comparison, budget pacing and a channel breakdown. Revenue attribution comes from Shopify, HubSpot or Salesforce.', 'adcanvas' ),
		'points' => array( __( 'Campaigns matched to steps automatically', 'adcanvas' ), __( 'Alerts when pacing or CPA drifts', 'adcanvas' ), __( 'Branded PDF and PowerPoint reports', 'adcanvas' ) ),
	),
	array(
		'img'    => 'app-mockups.webp',
		'w'      => 694,
		'h'      => 846,
		'alt'    => __( 'AI-designed ad mockups in feed and story sizes', 'adcanvas' ),
		'eyebrow' => __( 'Creative', 'adcanvas' ),
		'title'  => __( 'Ads, pages and emails for every step', 'adcanvas' ),
		'body'   => __( 'Copy is written for the step it belongs to and checked against each platform’s limits. Mockups come in feed and story sizes, in your brand colours.', 'adcanvas' ),
		'points' => array( __( 'Google, Meta, LinkedIn and TikTok ad packs', 'adcanvas' ), __( 'Publish to Google Ads and Meta as paused drafts', 'adcanvas' ), __( 'Landing pages, email, SMS and video scripts', 'adcanvas' ) ),
	),
);
?>
<!-- wp:group {"tagName":"section","align":"full","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|60"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><?php foreach ( $adcanvas_rows as $adcanvas_i => $adcanvas_r ) : ?>
<!-- wp:columns {"verticalAlignment":"center","align":"wide","style":{"spacing":{"blockGap":{"left":"var:preset|spacing|60"}}}} -->
<div class="wp-block-columns alignwide are-vertically-aligned-center"><?php ob_start(); ?><!-- wp:column {"verticalAlignment":"center","width":"45%"} -->
<div class="wp-block-column is-vertically-aligned-center" style="flex-basis:45%"><!-- wp:paragraph {"className":"is-style-eyebrow"} -->
<p class="is-style-eyebrow"><?php echo esc_html( $adcanvas_r['eyebrow'] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"fontSize":"x-large"} -->
<h2 class="wp-block-heading has-x-large-font-size"><?php echo esc_html( $adcanvas_r['title'] ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"textColor":"muted"} -->
<p class="has-muted-color has-text-color"><?php echo esc_html( $adcanvas_r['body'] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:list {"className":"is-style-checks"} -->
<ul class="wp-block-list is-style-checks"><?php foreach ( $adcanvas_r['points'] as $adcanvas_p ) : ?><!-- wp:list-item -->
<li><?php echo esc_html( $adcanvas_p ); ?></li>
<!-- /wp:list-item --><?php endforeach; ?></ul>
<!-- /wp:list --></div>
<!-- /wp:column --><?php $adcanvas_text = ob_get_clean(); ob_start(); ?><!-- wp:column {"verticalAlignment":"center","width":"55%"} -->
<div class="wp-block-column is-vertically-aligned-center" style="flex-basis:55%"><!-- wp:image {"sizeSlug":"full","linkDestination":"none","align":"center","className":"adcanvas-shot"} -->
<figure class="wp-block-image aligncenter size-full adcanvas-shot"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/images/' . $adcanvas_r['img'] ) ); ?>" alt="<?php echo esc_attr( $adcanvas_r['alt'] ); ?>"/></figure>
<!-- /wp:image --></div>
<!-- /wp:column --><?php $adcanvas_media = ob_get_clean(); echo 1 === $adcanvas_i % 2 ? $adcanvas_media . "\n\n" . $adcanvas_text : $adcanvas_text . "\n\n" . $adcanvas_media; // phpcs:ignore WordPress.Security.EscapeOutput -- escaped above. ?></div>
<!-- /wp:columns -->
<?php endforeach; ?></section>
<!-- /wp:group -->
