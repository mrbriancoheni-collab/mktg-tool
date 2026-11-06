<?php
/**
 * Title: Use cases (B2B, B2C, agencies)
 * Slug: adcanvas/use-cases
 * Categories: adcanvas-marketing
 * Keywords: audiences, use cases, who it's for
 */
$adcanvas_cases = array(
	array( __( 'E-commerce & DTC', 'adcanvas' ), __( 'Paid social and search into product pages, cart recovery and post-purchase flows. Shopify revenue shows ROAS by step.', 'adcanvas' ), __( 'E-commerce funnel', 'adcanvas' ) ),
	array( __( 'B2B & SaaS', 'adcanvas' ), __( 'LinkedIn, search and content into trials or demo requests, with nurture sequences, SDR follow-up and HubSpot or Salesforce pipeline.', 'adcanvas' ), __( 'B2B demo funnel', 'adcanvas' ) ),
	array( __( 'Agencies', 'adcanvas' ), __( 'One workspace per client, roles for your team, white-label share links and branded reports your clients can comment on.', 'adcanvas' ), __( 'Agency lead-gen funnel', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","align":"full","backgroundColor":"surface","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|50"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull has-surface-background-color has-background" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"constrained","contentSize":"680px"}} -->
<div class="wp-block-group"><!-- wp:paragraph {"align":"center","className":"is-style-eyebrow"} -->
<p class="has-text-align-center is-style-eyebrow"><?php esc_html_e( 'Built for B2B and B2C', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( '152 building blocks for every kind of funnel', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","textColor":"muted"} -->
<p class="has-text-align-center has-muted-color has-text-color"><?php esc_html_e( 'Ad networks, landing pages, forms, checkouts, email, SMS, CRMs, sales calls and events — each with real brand icons and sensible default benchmarks.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->

<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"left":"var:preset|spacing|40"}}}} -->
<div class="wp-block-columns alignwide"><?php foreach ( $adcanvas_cases as $adcanvas_c ) : ?><!-- wp:column -->
<div class="wp-block-column"><!-- wp:group {"className":"is-style-card","style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"default"}} -->
<div class="wp-block-group is-style-card"><!-- wp:heading {"level":3,"fontSize":"large"} -->
<h3 class="wp-block-heading has-large-font-size"><?php echo esc_html( $adcanvas_c[0] ); ?></h3>
<!-- /wp:heading -->

<!-- wp:paragraph {"textColor":"muted"} -->
<p class="has-muted-color has-text-color"><?php echo esc_html( $adcanvas_c[1] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"fontSize":"small"} -->
<p class="has-small-font-size"><a href="/templates/"><?php /* translators: %s: template name */ printf( esc_html__( 'Start from the %s →', 'adcanvas' ), esc_html( $adcanvas_c[2] ) ); ?></a></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --></div>
<!-- /wp:column --><?php endforeach; ?></div>
<!-- /wp:columns --></section>
<!-- /wp:group -->
