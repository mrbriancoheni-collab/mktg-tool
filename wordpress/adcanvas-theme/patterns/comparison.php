<?php
/**
 * Title: Comparison table (AdCanvas vs. the usual stack)
 * Slug: adcanvas/comparison
 * Categories: adcanvas-marketing
 * Keywords: comparison, vs, alternative, table
 * Description: For “alternatives” and “vs” pages. Keep every claim accurate and current; compare against named competitors only with facts you can source.
 */
$adcanvas_rows = array(
	array( __( 'Funnel map with budgets and conversion rates', 'adcanvas' ), __( 'Built in', 'adcanvas' ), __( 'Separate whiteboard', 'adcanvas' ) ),
	array( __( 'Forecast of spend, leads, revenue and ROAS', 'adcanvas' ), __( 'Built in', 'adcanvas' ), __( 'Spreadsheet formulas', 'adcanvas' ) ),
	array( __( 'AI plan from a brief, edits with preview and undo', 'adcanvas' ), __( 'Built in', 'adcanvas' ), '—' ),
	array( __( 'Ad copy checked against platform limits', 'adcanvas' ), __( 'Built in', 'adcanvas' ), __( 'Manual checking', 'adcanvas' ) ),
	array( __( 'Live data from ad, analytics and CRM accounts', 'adcanvas' ), __( 'Built in', 'adcanvas' ), __( 'Exports and copy-paste', 'adcanvas' ) ),
	array( __( 'Client-ready PDF and PowerPoint reports', 'adcanvas' ), __( 'Built in', 'adcanvas' ), __( 'Built by hand each month', 'adcanvas' ) ),
);
?>
<!-- wp:group {"tagName":"section","align":"full","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|40"}},"layout":{"type":"constrained","contentSize":"900px"}} -->
<section class="wp-block-group alignfull" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:heading {"textAlign":"center"} -->
<h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'AdCanvas vs. spreadsheets, slides and point tools', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:table {"className":"adcanvas-compare"} -->
<figure class="wp-block-table adcanvas-compare"><table class="has-fixed-layout"><thead><tr><th><?php esc_html_e( 'What you need', 'adcanvas' ); ?></th><th>AdCanvas</th><th><?php esc_html_e( 'Spreadsheets + slides + point tools', 'adcanvas' ); ?></th></tr></thead><tbody><?php foreach ( $adcanvas_rows as $adcanvas_r ) : ?><tr><td><?php echo esc_html( $adcanvas_r[0] ); ?></td><td><?php echo esc_html( $adcanvas_r[1] ); ?></td><td><?php echo esc_html( $adcanvas_r[2] ); ?></td></tr><?php endforeach; ?></tbody></table></figure>
<!-- /wp:table --></section>
<!-- /wp:group -->
