<?php
/**
 * Plan data shared by the pricing pattern and the SoftwareApplication schema.
 * Keep in sync with shared/plans.ts in the app.
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

/** @return array<int, array{id:string,name:string,price:int,blurb:string,features:string[],cta:string,featured?:bool}> */
function adcanvas_plans() {
	return array(
		array(
			'id'       => 'free',
			'name'     => __( 'Free', 'adcanvas' ),
			'price'    => 0,
			'blurb'    => __( 'Plan and forecast your first campaigns.', 'adcanvas' ),
			'features' => array( __( '3 boards', 'adcanvas' ), __( '50 AI actions / month', 'adcanvas' ), __( '2 members', 'adcanvas' ), __( 'All 150+ canvas elements', 'adcanvas' ), __( 'CSV import & ad-pack export', 'adcanvas' ), __( 'Share links & comments', 'adcanvas' ) ),
			'cta'      => __( 'Start free', 'adcanvas' ),
		),
		array(
			'id'       => 'pro',
			'name'     => __( 'Pro', 'adcanvas' ),
			'price'    => 49,
			'blurb'    => __( 'For marketers running live campaigns.', 'adcanvas' ),
			'features' => array( __( 'Unlimited boards', 'adcanvas' ), __( '1,000 AI actions / month', 'adcanvas' ), __( '5 members', 'adcanvas' ), __( 'Live Google Ads, GA4 & Meta data', 'adcanvas' ), __( 'Scheduled reports & alerts', 'adcanvas' ), __( 'Publish ad drafts', 'adcanvas' ) ),
			'cta'      => __( 'Start with Pro', 'adcanvas' ),
			'featured' => true,
		),
		array(
			'id'       => 'team',
			'name'     => __( 'Team', 'adcanvas' ),
			'price'    => 149,
			'blurb'    => __( 'For agencies and growth teams.', 'adcanvas' ),
			'features' => array( __( 'Everything in Pro', 'adcanvas' ), __( '5,000 AI actions / month', 'adcanvas' ), __( '25 members', 'adcanvas' ), __( 'Roles & audit log', 'adcanvas' ), __( 'Priority support', 'adcanvas' ) ),
			'cta'      => __( 'Start with Team', 'adcanvas' ),
		),
	);
}
