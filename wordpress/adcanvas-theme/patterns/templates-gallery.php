<?php
/**
 * Title: Funnel template gallery (10 templates)
 * Slug: adcanvas/templates-gallery
 * Categories: adcanvas-marketing
 * Keywords: templates, funnels, gallery
 *
 * Mirrors the in-app template gallery (shared/templates*.ts).
 */
$adcanvas_templates = array(
	array( 'B2C', __( 'E-commerce launch', 'adcanvas' ), __( 'Meta, Google Shopping and TikTok → product page → checkout → post-purchase email.', 'adcanvas' ) ),
	array( 'B2B', __( 'SaaS free trial', 'adcanvas' ), __( 'Search and LinkedIn → pricing → free trial → activation → paid subscription.', 'adcanvas' ) ),
	array( 'B2B', __( 'B2B demo pipeline', 'adcanvas' ), __( 'LinkedIn and search → content offer → demo request → SDR call → closed deal.', 'adcanvas' ) ),
	array( 'B2C', __( 'Local services leads', 'adcanvas' ), __( 'Google Search and Meta → landing page → call or booking → job won.', 'adcanvas' ) ),
	array( 'B2C', __( 'Mobile app installs', 'adcanvas' ), __( 'TikTok and Apple Search Ads → app store → onboarding → subscription.', 'adcanvas' ) ),
	array( 'B2C', __( 'DTC subscription', 'adcanvas' ), __( 'Meta and influencers → quiz → first-box offer → subscription and referrals.', 'adcanvas' ) ),
	array( 'B2B', __( 'Agency & consulting leads', 'adcanvas' ), __( 'LinkedIn and cold email → case study → strategy call → proposal → client.', 'adcanvas' ) ),
	array( 'B2B', __( 'Webinar funnel', 'adcanvas' ), __( 'Paid social and email → registration page → reminders → webinar → sales follow-up.', 'adcanvas' ) ),
	array( 'B2B', __( 'Event registrations', 'adcanvas' ), __( 'Email list, Meta and LinkedIn → event page → ticket → attendance.', 'adcanvas' ) ),
	array( 'B2C', __( 'Nonprofit donations', 'adcanvas' ), __( 'Google Ad Grants and social → story page → donation → monthly giving.', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","align":"full","className":"adcanvas-features","style":{"spacing":{"padding":{"top":"var:preset|spacing|50","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|40"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull adcanvas-features" style="padding-top:var(--wp--preset--spacing--50);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"align":"wide","style":{"spacing":{"blockGap":"var:preset|spacing|40"}},"layout":{"type":"grid","minimumColumnWidth":"18rem"}} -->
<div class="wp-block-group alignwide"><?php foreach ( $adcanvas_templates as $adcanvas_t ) : ?><!-- wp:group {"className":"is-style-card","style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"default"}} -->
<div class="wp-block-group is-style-card"><!-- wp:paragraph {"className":"is-style-eyebrow"} -->
<p class="is-style-eyebrow"><?php echo esc_html( $adcanvas_t[0] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading"><?php echo esc_html( $adcanvas_t[1] ); ?></h3>
<!-- /wp:heading -->

<!-- wp:paragraph {"textColor":"muted"} -->
<p class="has-muted-color has-text-color"><?php echo esc_html( $adcanvas_t[2] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"fontSize":"small"} -->
<p class="has-small-font-size"><a href="https://app.example.com/signup"><?php esc_html_e( 'Use this template →', 'adcanvas' ); ?></a></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group --><?php endforeach; ?></div>
<!-- /wp:group --></section>
<!-- /wp:group -->
