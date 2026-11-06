<?php
/**
 * Title: Pricing table (Free, Pro, Team)
 * Slug: adcanvas/pricing
 * Categories: adcanvas-marketing
 * Keywords: pricing, plans, price, table
 */
$adcanvas_plans = adcanvas_plans(); // inc/plans.php
?>
<!-- wp:group {"tagName":"section","anchor":"pricing","align":"full","className":"adcanvas-pricing","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|50"}},"layout":{"type":"constrained","contentSize":"1100px"}} -->
<section id="pricing" class="wp-block-group alignfull adcanvas-pricing" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"style":{"spacing":{"blockGap":"var:preset|spacing|20"}},"layout":{"type":"constrained","contentSize":"640px"}} -->
<div class="wp-block-group"><!-- wp:paragraph {"align":"center","className":"is-style-eyebrow"} -->
<p class="has-text-align-center is-style-eyebrow"><?php esc_html_e( 'Pricing', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'Start free. Upgrade when you go live.', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"align":"center","textColor":"muted"} -->
<p class="has-text-align-center has-muted-color has-text-color"><?php esc_html_e( 'Prices in USD per workspace, billed monthly. Change or cancel any time.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->

<!-- wp:columns {"align":"wide","style":{"spacing":{"blockGap":{"left":"var:preset|spacing|40"}}}} -->
<div class="wp-block-columns alignwide"><?php foreach ( $adcanvas_plans as $adcanvas_p ) : $adcanvas_featured = ! empty( $adcanvas_p['featured'] ); ?><!-- wp:column -->
<div class="wp-block-column"><!-- wp:group {"className":"<?php echo $adcanvas_featured ? 'is-style-featured-card' : 'is-style-card'; ?>","style":{"spacing":{"blockGap":"var:preset|spacing|30"}},"layout":{"type":"default"}} -->
<div class="wp-block-group <?php echo $adcanvas_featured ? 'is-style-featured-card' : 'is-style-card'; ?>"><?php if ( $adcanvas_featured ) : ?><!-- wp:paragraph {"className":"adcanvas-badge"} -->
<p class="adcanvas-badge"><?php esc_html_e( 'Most popular', 'adcanvas' ); ?></p>
<!-- /wp:paragraph -->

<?php endif; ?><!-- wp:heading {"level":3,"fontSize":"large"} -->
<h3 class="wp-block-heading has-large-font-size"><?php echo esc_html( $adcanvas_p['name'] ); ?></h3>
<!-- /wp:heading -->

<!-- wp:paragraph {"className":"adcanvas-price"} -->
<p class="adcanvas-price">$<?php echo (int) $adcanvas_p['price']; ?> <small><?php esc_html_e( '/ month', 'adcanvas' ); ?></small></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"textColor":"muted","fontSize":"small"} -->
<p class="has-muted-color has-text-color has-small-font-size"><?php echo esc_html( $adcanvas_p['blurb'] ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:list {"className":"is-style-checks"} -->
<ul class="wp-block-list is-style-checks"><?php foreach ( $adcanvas_p['features'] as $adcanvas_feature ) : ?><!-- wp:list-item -->
<li><?php echo esc_html( $adcanvas_feature ); ?></li>
<!-- /wp:list-item --><?php endforeach; ?></ul>
<!-- /wp:list -->

<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button {"width":100<?php echo $adcanvas_featured ? '' : ',"className":"is-style-outline"'; ?>} -->
<div class="wp-block-button has-custom-width wp-block-button__width-100<?php echo $adcanvas_featured ? '' : ' is-style-outline'; ?>"><a class="wp-block-button__link wp-element-button" href="https://app.example.com/signup?plan=<?php echo esc_attr( $adcanvas_p['id'] ); ?>"><?php echo esc_html( $adcanvas_p['cta'] ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div>
<!-- /wp:group --></div>
<!-- /wp:column --><?php endforeach; ?></div>
<!-- /wp:columns -->

<!-- wp:paragraph {"align":"center","textColor":"muted","fontSize":"small"} -->
<p class="has-text-align-center has-muted-color has-text-color has-small-font-size"><?php esc_html_e( 'Need SSO, a custom contract or more AI actions?', 'adcanvas' ); ?> <a href="/contact/"><?php esc_html_e( 'Talk to us', 'adcanvas' ); ?></a>.</p>
<!-- /wp:paragraph --></section>
<!-- /wp:group -->
