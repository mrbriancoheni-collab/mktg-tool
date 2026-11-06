<?php
/**
 * AdCanvas theme functions.
 *
 * - App URL setting (Settings → General): every link in the theme's patterns that
 *   points at https://app.example.com is rewritten to your real app subdomain.
 * - Pattern categories, block styles, reading time.
 * - Search & AI visibility (inc/): meta tags, JSON-LD, robots, llms.txt, IndexNow,
 *   breadcrumbs and table-of-contents blocks.
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

const ADCANVAS_VERSION = '1.1.0';
/** Placeholder host used in patterns; replaced with the configured app URL at render time. */
const ADCANVAS_APP_PLACEHOLDER = 'https://app.example.com';

/**
 * The app URL, e.g. https://app.adcanvas.com (no trailing slash).
 * Defaults to the "app." subdomain of this site.
 */
function adcanvas_app_url() {
	$saved = get_option( 'adcanvas_app_url' );
	if ( $saved ) {
		return untrailingslashit( $saved );
	}
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	$host = preg_replace( '/^www\./', '', (string) $host );
	return 'https://app.' . $host;
}

add_action(
	'after_setup_theme',
	function () {
		add_theme_support( 'wp-block-styles' );
		add_theme_support( 'editor-styles' );
		add_theme_support( 'post-thumbnails' );
		add_theme_support( 'responsive-embeds' );
		add_theme_support( 'title-tag' );
		add_theme_support( 'automatic-feed-links' );
		add_editor_style( 'assets/css/theme.css' );
	}
);

add_action(
	'wp_enqueue_scripts',
	function () {
		wp_enqueue_style( 'adcanvas', get_theme_file_uri( 'assets/css/theme.css' ), array(), ADCANVAS_VERSION );
	}
);

// Preload the main font file (used above the fold).
add_action(
	'wp_head',
	function () {
		printf(
			'<link rel="preload" href="%s" as="font" type="font/woff2" crossorigin>' . "\n",
			esc_url( get_theme_file_uri( 'assets/fonts/inter-latin-wght-normal.woff2' ) )
		);
	},
	1
);

/* ─────────────────────────── App URL setting ─────────────────────────── */

add_action(
	'admin_init',
	function () {
		register_setting(
			'general',
			'adcanvas_app_url',
			array(
				'type'              => 'string',
				'sanitize_callback' => function ( $value ) {
					$value = esc_url_raw( trim( (string) $value ) );
					return $value ? untrailingslashit( $value ) : '';
				},
				'default'           => '',
			)
		);
		add_settings_field(
			'adcanvas_app_url',
			__( 'AdCanvas app URL', 'adcanvas' ),
			function () {
				printf(
					'<input name="adcanvas_app_url" id="adcanvas_app_url" type="url" class="regular-text code" value="%1$s" placeholder="%2$s" />
					<p class="description">%3$s</p>',
					esc_attr( (string) get_option( 'adcanvas_app_url' ) ),
					esc_attr( adcanvas_app_url() ),
					esc_html__( 'Where “Sign in” and “Start free” buttons send visitors. Leave empty to use the app. subdomain of this site.', 'adcanvas' )
				);
			},
			'general'
		);
	}
);

/**
 * Rewrites the placeholder app host in rendered blocks to the configured app URL,
 * so patterns can be edited visually while links always point to the right place.
 */
add_filter(
	'render_block',
	function ( $content ) {
		if ( false === strpos( $content, ADCANVAS_APP_PLACEHOLDER ) ) {
			return $content;
		}
		return str_replace( ADCANVAS_APP_PLACEHOLDER, esc_url( adcanvas_app_url() ), $content );
	}
);

/* ─────────────────────────── Patterns & block styles ─────────────────────────── */

add_action(
	'init',
	function () {
		register_block_pattern_category( 'adcanvas-marketing', array( 'label' => __( 'AdCanvas: Marketing', 'adcanvas' ) ) );
		register_block_pattern_category( 'adcanvas-blog', array( 'label' => __( 'AdCanvas: Blog', 'adcanvas' ) ) );

		register_block_style( 'core/group', array( 'name' => 'card', 'label' => __( 'Card', 'adcanvas' ) ) );
		register_block_style( 'core/group', array( 'name' => 'featured-card', 'label' => __( 'Featured card', 'adcanvas' ) ) );
		register_block_style( 'core/list', array( 'name' => 'checks', 'label' => __( 'Checkmarks', 'adcanvas' ) ) );
		register_block_style( 'core/paragraph', array( 'name' => 'eyebrow', 'label' => __( 'Eyebrow', 'adcanvas' ) ) );
		register_block_style( 'core/heading', array( 'name' => 'gradient', 'label' => __( 'Gradient text', 'adcanvas' ) ) );
	}
);

/* ─────────────────────────── Reading time ─────────────────────────── */

/** Estimated reading time in minutes (220 wpm). */
function adcanvas_reading_time( $post = null ) {
	$text  = wp_strip_all_tags( (string) get_post_field( 'post_content', $post ) );
	$words = str_word_count( $text );
	return max( 1, (int) ceil( $words / 220 ) );
}

// Appends "· N min read" to the post date on single blog posts.
add_filter(
	'render_block_core/post-date',
	function ( $content, $block, $instance = null ) {
		if ( ! is_singular( 'post' ) || 'modified' === ( $block['attrs']['displayType'] ?? '' ) ) {
			return $content;
		}
		// Only the date of the post being viewed, not dates in "latest posts" cards.
		$post_id = $instance instanceof WP_Block ? (int) ( $instance->context['postId'] ?? 0 ) : 0;
		if ( $post_id !== (int) get_queried_object_id() ) {
			return $content;
		}
		$minutes = adcanvas_reading_time( $post_id );
		/* translators: %d: minutes */
		$label = sprintf( _n( '%d min read', '%d min read', $minutes, 'adcanvas' ), $minutes );
		return str_replace( '</time>', '</time><span class="adcanvas-reading-time"> · ' . esc_html( $label ) . '</span>', $content );
	},
	10,
	3
);

/* ─────────────────────────── Search, AI answers, blocks ─────────────────────────── */

require_once __DIR__ . '/inc/plans.php';
require_once __DIR__ . '/inc/seo.php';
require_once __DIR__ . '/inc/schema.php';
require_once __DIR__ . '/inc/llms.php';
require_once __DIR__ . '/inc/blocks.php';

/* ─────────────────────────── Performance ─────────────────────────── */

// Emoji detection script isn't needed on a marketing site.
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
add_filter( 'emoji_svg_url', '__return_false' );
