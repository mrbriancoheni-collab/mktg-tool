<?php
/**
 * Title: Integrations strip
 * Slug: adcanvas/logos
 * Categories: adcanvas-marketing
 * Keywords: logos, integrations, social proof
 */
$adcanvas_tools = array( 'Google Ads', 'GA4', 'Meta', 'LinkedIn', 'TikTok', 'Shopify', 'HubSpot', 'Salesforce' );
?>
<!-- wp:group {"tagName":"section","align":"full","className":"adcanvas-logos","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|40"},"blockGap":"var:preset|spacing|30"}},"layout":{"type":"constrained","contentSize":"1100px"}} -->
<section class="wp-block-group alignfull adcanvas-logos" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--40)"><!-- wp:paragraph {"align":"center","textColor":"muted","fontSize":"small"} -->
<p class="has-text-align-center has-muted-color has-text-color has-small-font-size"><?php esc_html_e( 'Live data from the tools your campaigns already run on', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:group {"align":"wide","style":{"spacing":{"blockGap":"2.25rem"}},"layout":{"type":"flex","flexWrap":"wrap","justifyContent":"center"}} -->
<div class="wp-block-group alignwide"><?php foreach ( $adcanvas_tools as $adcanvas_tool ) : ?><!-- wp:paragraph {"className":"adcanvas-logo-item","fontSize":"large"} -->
<p class="adcanvas-logo-item has-large-font-size"><?php echo esc_html( $adcanvas_tool ); ?></p>
<!-- /wp:paragraph -->

<?php endforeach; ?></div>
<!-- /wp:group --></section>
<!-- /wp:group -->
