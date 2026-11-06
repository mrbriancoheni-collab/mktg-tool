<?php
/**
 * /llms.txt and /llms-full.txt (https://llmstxt.org): a plain-text map and full-text
 * export of the site for AI assistants and answer engines. Also serves the IndexNow
 * key file. Both need pretty permalinks (Settings → Permalinks → Post name).
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

const ADCANVAS_REWRITE_VERSION = '2';

add_action(
	'init',
	function () {
		add_rewrite_rule( '^llms\.txt$', 'index.php?adcanvas_txt=llms', 'top' );
		add_rewrite_rule( '^llms-full\.txt$', 'index.php?adcanvas_txt=llms-full', 'top' );
		add_rewrite_rule( '^' . adcanvas_indexnow_key() . '\.txt$', 'index.php?adcanvas_txt=indexnow', 'top' );
		// Activation, theme updates and a new IndexNow key all need the rules flushed once.
		$version = ADCANVAS_REWRITE_VERSION . ':' . adcanvas_indexnow_key();
		if ( get_option( 'adcanvas_rewrite_version' ) !== $version ) {
			flush_rewrite_rules( false );
			update_option( 'adcanvas_rewrite_version', $version, true );
		}
	}
);
add_action( 'switch_theme', fn() => delete_option( 'adcanvas_rewrite_version' ) );

add_filter( 'query_vars', fn( $vars ) => array_merge( $vars, array( 'adcanvas_txt' ) ) );

add_action(
	'template_redirect',
	function () {
		$which = get_query_var( 'adcanvas_txt' );
		if ( ! $which ) {
			return;
		}
		status_header( 200 );
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'X-Robots-Tag: noindex' );
		if ( 'indexnow' === $which ) {
			echo adcanvas_indexnow_key(); // phpcs:ignore WordPress.Security.EscapeOutput -- hex string.
			exit;
		}
		header( 'Cache-Control: public, max-age=3600' );
		echo 'llms-full' === $which ? adcanvas_llms_full_txt() : adcanvas_llms_txt(); // phpcs:ignore WordPress.Security.EscapeOutput -- plain text.
		exit;
	},
	1 // Before redirect_canonical adds a trailing slash.
);

// Regenerate when content changes.
foreach ( array( 'save_post', 'deleted_post', 'switch_theme', 'update_option_blogdescription', 'update_option_blogname' ) as $adcanvas_hook ) {
	add_action( $adcanvas_hook, 'adcanvas_llms_flush' );
}

function adcanvas_llms_flush() {
	delete_transient( 'adcanvas_llms' );
	delete_transient( 'adcanvas_llms_full' );
}

/** Published, indexable pages and posts. */
function adcanvas_llms_posts( $type, $limit = 200 ) {
	return get_posts(
		array(
			'post_type'        => $type,
			'post_status'      => 'publish',
			'posts_per_page'   => $limit,
			'orderby'          => 'page' === $type ? 'menu_order title' : 'date',
			'order'            => 'page' === $type ? 'ASC' : 'DESC',
			'has_password'     => false,
			'suppress_filters' => false,
			'meta_query'       => array( // phpcs:ignore WordPress.DB.SlowDBQuery
				'relation' => 'OR',
				array( 'key' => 'adcanvas_noindex', 'compare' => 'NOT EXISTS' ),
				array( 'key' => 'adcanvas_noindex', 'value' => '1', 'compare' => '!=' ),
			),
		)
	);
}

function adcanvas_llms_summary( WP_Post $p ) {
	$d = (string) get_post_meta( $p->ID, 'adcanvas_seo_description', true );
	if ( '' === trim( $d ) ) {
		$d = has_excerpt( $p ) ? get_the_excerpt( $p ) : wp_trim_words( wp_strip_all_tags( (string) $p->post_content ), 25, '…' );
	}
	return trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $d ) ) );
}

/** The llms.txt index: what the site is, then links grouped by section. */
function adcanvas_llms_txt() {
	$cached = get_transient( 'adcanvas_llms' );
	if ( is_string( $cached ) ) {
		return $cached;
	}
	$name  = get_bloginfo( 'name' );
	$front = (int) get_option( 'page_on_front' );
	$blog  = (int) get_option( 'page_for_posts' );
	$app   = adcanvas_app_url();
	$out   = "# {$name}\n\n> " . get_bloginfo( 'description' ) . "\n\n";
	$out  .= sprintf(
		/* translators: 1: product name, 2: app URL */
		__( '%1$s is a web app for planning, creating, measuring and improving ad campaigns on a visual canvas. AI builds the funnel plan from a brief, edits it on request with a preview, writes ads within each platform’s limits, and analyzes live results from Google Ads, GA4, Meta, LinkedIn, TikTok, Shopify, HubSpot and Salesforce. The app runs at %2$s; this site holds product information, pricing, guides and legal terms.', 'adcanvas' ),
		$name,
		$app
	) . "\n\n";

	// Plans, stated plainly so assistants quote current prices.
	$out .= '## ' . __( 'Pricing', 'adcanvas' ) . "\n\n";
	foreach ( adcanvas_plans() as $plan ) {
		/* translators: 1: plan, 2: price, 3: description, 4: features */
		$out .= sprintf( __( '- %1$s: $%2$d per workspace per month. %3$s Includes: %4$s.', 'adcanvas' ), $plan['name'], $plan['price'], $plan['blurb'], implode( ', ', $plan['features'] ) ) . "\n";
	}
	$out .= "\n";

	$pages   = adcanvas_llms_posts( 'page' );
	$legal   = get_page_by_path( 'legal' );
	$main    = '';
	$legalmd = '';
	foreach ( $pages as $p ) {
		if ( in_array( $p->ID, array( $front, $blog ), true ) ) {
			continue;
		}
		$line = sprintf( "- [%s](%s)%s\n", get_the_title( $p ), get_permalink( $p ), ( $s = adcanvas_llms_summary( $p ) ) ? ': ' . $s : '' );
		if ( $legal && ( $p->ID === $legal->ID || in_array( $legal->ID, get_post_ancestors( $p ), true ) ) ) {
			$legalmd .= $line;
		} else {
			$main .= $line;
		}
	}
	if ( $main ) {
		$out .= '## ' . __( 'Product and company', 'adcanvas' ) . "\n\n" . $main . "\n";
	}
	$posts = adcanvas_llms_posts( 'post', 50 );
	if ( $posts ) {
		$out .= '## ' . __( 'Guides and blog', 'adcanvas' ) . "\n\n";
		foreach ( $posts as $p ) {
			$out .= sprintf( "- [%s](%s)%s\n", get_the_title( $p ), get_permalink( $p ), ( $s = adcanvas_llms_summary( $p ) ) ? ': ' . $s : '' );
		}
		$out .= "\n";
	}
	if ( $legalmd ) {
		$out .= '## ' . __( 'Legal', 'adcanvas' ) . "\n\n" . $legalmd . "\n";
	}
	$out .= '## ' . __( 'Optional', 'adcanvas' ) . "\n\n";
	$out .= sprintf( "- [%s](%s): %s\n", __( 'Full text of this site', 'adcanvas' ), home_url( '/llms-full.txt' ), __( 'every page and recent post as plain text', 'adcanvas' ) );
	$out .= sprintf( "- [%s](%s)\n", __( 'Create a free account', 'adcanvas' ), $app . '/signup' );
	$out .= sprintf( "- [%s](%s)\n", __( 'Sitemap', 'adcanvas' ), home_url( '/wp-sitemap.xml' ) );
	set_transient( 'adcanvas_llms', $out, DAY_IN_SECONDS );
	return $out;
}

/** Rendered HTML → readable Markdown-ish text. */
function adcanvas_html_to_text( $html ) {
	$html = preg_replace( '#<(script|style|svg|form|nav)\b.*?</\1>#is', '', (string) $html );
	$html = preg_replace_callback( '#<h([1-6])[^>]*>(.*?)</h\1>#is', fn( $m ) => "\n\n" . str_repeat( '#', min( 6, (int) $m[1] + 1 ) ) . ' ' . trim( wp_strip_all_tags( $m[2] ) ) . "\n\n", $html );
	$html = preg_replace_callback( '#<summary[^>]*>(.*?)</summary>#is', fn( $m ) => "\n\n**" . trim( wp_strip_all_tags( $m[1] ) ) . "**\n", $html );
	$html = preg_replace_callback( '#<a\s[^>]*href=(["\'])(.*?)\1[^>]*>(.*?)</a>#is', function ( $m ) {
		$text = trim( wp_strip_all_tags( $m[3] ) );
		return ( '' === $text || '#' === ( $m[2][0] ?? '' ) ) ? $text : '[' . $text . '](' . $m[2] . ')';
	}, $html );
	$html = preg_replace( '#<(strong|b)>(.*?)</\1>#is', '**$2**', $html );
	$html = preg_replace( '#<li[^>]*>#i', "\n- ", $html );
	$html = preg_replace( '#</(td|th)>#i', ' | ', $html );
	$html = preg_replace( '#<br\s*/?>|</(p|div|tr|ul|ol|table|figure|blockquote|section|details)>#i', "\n\n", $html );
	$text = html_entity_decode( wp_strip_all_tags( $html ), ENT_QUOTES, 'UTF-8' );
	$text = preg_replace( "/[ \t]+/", ' ', $text );
	$text = preg_replace( "/ *\n */", "\n", $text );
	return trim( preg_replace( "/\n{3,}/", "\n\n", $text ) );
}

/** The front page lives in a template, not in post content: render it without header/footer. */
function adcanvas_front_page_text() {
	$template = get_block_template( get_stylesheet() . '//front-page' );
	if ( ! $template || ! $template->content ) {
		return '';
	}
	$markup = preg_replace( '#<!-- wp:template-part [^>]*/-->#', '', $template->content );
	return adcanvas_html_to_text( do_blocks( $markup ) );
}

/** The llms-full.txt export: every indexable page and the 30 latest posts, as text. */
function adcanvas_llms_full_txt() {
	$cached = get_transient( 'adcanvas_llms_full' );
	if ( is_string( $cached ) ) {
		return $cached;
	}
	global $post;
	$saved = $post;
	$out   = '# ' . get_bloginfo( 'name' ) . "\n\n> " . get_bloginfo( 'description' ) . "\n\n";
	$front = adcanvas_front_page_text();
	if ( $front ) {
		$out .= "---\n\n# " . __( 'Home', 'adcanvas' ) . "\nURL: " . home_url( '/' ) . "\n\n" . $front . "\n\n";
	}
	$skip = array( (int) get_option( 'page_on_front' ), (int) get_option( 'page_for_posts' ) );
	foreach ( array_merge( adcanvas_llms_posts( 'page' ), adcanvas_llms_posts( 'post', 30 ) ) as $p ) {
		if ( in_array( $p->ID, $skip, true ) ) {
			continue;
		}
		$post = $p; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
		setup_postdata( $p );
		$body = adcanvas_html_to_text( apply_filters( 'the_content', $p->post_content ) ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals -- core hook.
		$out .= "---\n\n# " . get_the_title( $p ) . "\nURL: " . get_permalink( $p ) . "\n";
		$out .= ( 'post' === $p->post_type ? 'Published: ' . get_the_date( 'Y-m-d', $p ) . ' · ' : '' ) . 'Updated: ' . get_the_modified_date( 'Y-m-d', $p ) . "\n\n";
		$out .= $body . "\n\n";
	}
	$post = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
	wp_reset_postdata();
	set_transient( 'adcanvas_llms_full', $out, DAY_IN_SECONDS );
	return $out;
}
