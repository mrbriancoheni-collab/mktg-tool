<?php
/**
 * AdCanvas theme functions.
 *
 * - App URL setting (Settings → General): every link in the theme's patterns that
 *   points at https://app.example.com is rewritten to your real app subdomain.
 * - Pattern categories, block styles, reading time, social meta fallback.
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

const ADCANVAS_VERSION = '1.0.0';
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

/* ─────────────────────────── Social / SEO fallback ─────────────────────────── */

/**
 * Basic Open Graph + Twitter tags when no SEO plugin is active
 * (Yoast, Rank Math, SEOPress, AIOSEO and The SEO Framework output their own).
 */
add_action(
	'wp_head',
	function () {
		if ( defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'SEOPRESS_VERSION' ) || defined( 'AIOSEO_VERSION' ) || defined( 'THE_SEO_FRAMEWORK_VERSION' ) ) {
			return;
		}
		$title       = wp_get_document_title();
		$description = is_singular() ? get_the_excerpt() : '';
		if ( '' === trim( (string) $description ) ) {
			$description = get_bloginfo( 'description' );
		}
		if ( is_front_page() ) {
			$url = home_url( '/' );
		} elseif ( is_singular() ) {
			$url = get_permalink();
		} else {
			$url = get_pagenum_link( max( 1, (int) get_query_var( 'paged' ) ) );
		}
		$image       = is_singular() && has_post_thumbnail() ? get_the_post_thumbnail_url( null, 'large' ) : get_theme_file_uri( 'assets/images/social-card.png' );
		$type        = is_singular( 'post' ) ? 'article' : 'website';

		printf( '<meta name="description" content="%s">' . "\n", esc_attr( wp_trim_words( $description, 30 ) ) );
		printf( '<meta property="og:type" content="%s">' . "\n", esc_attr( $type ) );
		printf( '<meta property="og:title" content="%s">' . "\n", esc_attr( $title ) );
		printf( '<meta property="og:description" content="%s">' . "\n", esc_attr( wp_trim_words( $description, 30 ) ) );
		printf( '<meta property="og:url" content="%s">' . "\n", esc_url( $url ) );
		printf( '<meta property="og:site_name" content="%s">' . "\n", esc_attr( get_bloginfo( 'name' ) ) );
		printf( '<meta property="og:image" content="%s">' . "\n", esc_url( $image ) );
		echo '<meta name="twitter:card" content="summary_large_image">' . "\n";
	},
	5
);

/* ─────────────────────────── Performance ─────────────────────────── */

// Emoji detection script isn't needed on a marketing site.
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
add_filter( 'emoji_svg_url', '__return_false' );
