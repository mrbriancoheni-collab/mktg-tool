<?php
/**
 * Title: FAQ
 * Slug: adcanvas/faq
 * Categories: adcanvas-marketing
 * Keywords: faq, questions, answers, accordion
 */
$adcanvas_faq = array(
	array( __( 'Do I need to connect my ad accounts to start?', 'adcanvas' ), __( 'No. You can plan, forecast and write ads on the Free plan without connecting anything. Connect Google Ads, GA4, Meta and others when you want live numbers on the canvas.', 'adcanvas' ) ),
	array( __( 'Will AdCanvas change my live campaigns?', 'adcanvas' ), __( 'No. Publishing creates paused drafts only — ad groups in Google Ads and ad creatives in Meta. Nothing spends money until someone on your team turns it on in the ad platform.', 'adcanvas' ) ),
	array( __( 'What counts as an AI action?', 'adcanvas' ), __( 'Each request to the AI — building a plan, an assistant edit, generating copy or mockups, or running an analysis — uses one action. Usage resets monthly and is shown in Settings.', 'adcanvas' ) ),
	array( __( 'Is my data used to train AI models?', 'adcanvas' ), __( 'We don’t use your workspace content to train AI models. See our Privacy Policy for how AI requests are processed.', 'adcanvas' ) ),
	array( __( 'How is my data secured?', 'adcanvas' ), __( 'Connected-account credentials are encrypted at rest, accounts support two-step verification and Sign in with Google, and you can export or delete your data at any time.', 'adcanvas' ) ),
	array( __( 'Can agencies manage several clients?', 'adcanvas' ), __( 'Yes. Create one workspace per client, invite teammates with owner, admin, member or viewer roles, and share white-labelled, view-and-comment links and reports.', 'adcanvas' ) ),
	array( __( 'Can I cancel any time?', 'adcanvas' ), __( 'Yes. Plans are monthly. If you cancel, your workspace moves to the Free plan at the end of the billing period and your boards stay available.', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","anchor":"faq","align":"full","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|40"}},"layout":{"type":"constrained","contentSize":"760px"}} -->
<section id="faq" class="wp-block-group alignfull" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'Frequently asked questions', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:group {"style":{"spacing":{"blockGap":"0"}},"layout":{"type":"default"}} -->
<div class="wp-block-group"><?php foreach ( $adcanvas_faq as $adcanvas_item ) : ?><!-- wp:details -->
<details class="wp-block-details"><summary><?php echo esc_html( $adcanvas_item[0] ); ?></summary><!-- wp:paragraph -->
<p><?php echo esc_html( $adcanvas_item[1] ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->

<?php endforeach; ?></div>
<!-- /wp:group --></section>
<!-- /wp:group -->
