<?php
/**
 * Search-engine basics when no SEO plugin is active: title and description overrides,
 * canonical, robots, Open Graph / X cards, sitemap hygiene, robots.txt with AI-crawler
 * policy, heading anchors, related posts, IndexNow pings, performance hints.
 *
 * With Yoast, Rank Math, SEOPress, AIOSEO, The SEO Framework or Slim SEO active, the
 * overlapping parts switch off and the plugin wins.
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

function adcanvas_seo_plugin_active() {
	return defined( 'WPSEO_VERSION' ) || defined( 'RANK_MATH_VERSION' ) || defined( 'SEOPRESS_VERSION' )
		|| defined( 'AIOSEO_VERSION' ) || defined( 'THE_SEO_FRAMEWORK_VERSION' ) || defined( 'SLIM_SEO_VER' );
}

/* ── Per-page fields (edited in the "Search & AI" panel of the editor) ── */

add_action(
	'init',
	function () {
		add_post_type_support( 'page', 'excerpt' );
		$auth = function ( $allowed, $meta_key, $post_id ) {
			return current_user_can( 'edit_post', $post_id );
		};
		foreach ( array( 'post', 'page' ) as $type ) {
			register_post_meta( $type, 'adcanvas_seo_title', array( 'type' => 'string', 'single' => true, 'show_in_rest' => true, 'default' => '', 'sanitize_callback' => 'sanitize_text_field', 'auth_callback' => $auth ) );
			register_post_meta( $type, 'adcanvas_seo_description', array( 'type' => 'string', 'single' => true, 'show_in_rest' => true, 'default' => '', 'sanitize_callback' => 'sanitize_textarea_field', 'auth_callback' => $auth ) );
			register_post_meta( $type, 'adcanvas_noindex', array( 'type' => 'boolean', 'single' => true, 'show_in_rest' => true, 'default' => false, 'auth_callback' => $auth ) );
		}
	}
);

/* ── Settings → Reading: social profiles, AI crawlers, IndexNow ── */

add_action(
	'admin_init',
	function () {
		register_setting( 'reading', 'adcanvas_social_profiles', array( 'type' => 'string', 'default' => '', 'sanitize_callback' => function ( $v ) {
			$urls = array_filter( array_map( 'esc_url_raw', array_map( 'trim', preg_split( '/\R/', (string) $v ) ) ) );
			return implode( "\n", $urls );
		} ) );
		register_setting( 'reading', 'adcanvas_ai_crawlers', array( 'type' => 'string', 'default' => 'all', 'sanitize_callback' => function ( $v ) {
			return 'search-only' === $v ? 'search-only' : 'all';
		} ) );
		register_setting( 'reading', 'adcanvas_indexnow', array( 'type' => 'boolean', 'default' => true, 'sanitize_callback' => 'rest_sanitize_boolean' ) );

		add_settings_section( 'adcanvas_seo', __( 'AdCanvas: search & AI', 'adcanvas' ), '__return_false', 'reading' );
		add_settings_field( 'adcanvas_social_profiles', __( 'Social profiles', 'adcanvas' ), function () {
			printf(
				'<textarea name="adcanvas_social_profiles" id="adcanvas_social_profiles" rows="4" class="large-text code" placeholder="https://www.linkedin.com/company/…&#10;https://x.com/…">%s</textarea><p class="description">%s</p>',
				esc_textarea( (string) get_option( 'adcanvas_social_profiles' ) ),
				esc_html__( 'One URL per line. Used in the Organization schema (sameAs), which helps search and AI engines connect your brand. An x.com profile also sets twitter:site.', 'adcanvas' )
			);
		}, 'reading', 'adcanvas_seo' );
		add_settings_field( 'adcanvas_ai_crawlers', __( 'AI crawlers', 'adcanvas' ), function () {
			$v = get_option( 'adcanvas_ai_crawlers', 'all' );
			printf(
				'<fieldset><label><input type="radio" name="adcanvas_ai_crawlers" value="all" %1$s> %3$s</label><br><label><input type="radio" name="adcanvas_ai_crawlers" value="search-only" %2$s> %4$s</label><p class="description">%5$s</p></fieldset>',
				checked( $v, 'all', false ),
				checked( $v, 'search-only', false ),
				esc_html__( 'Allow all (recommended for visibility in ChatGPT, Claude, Perplexity, Gemini and AI Overviews)', 'adcanvas' ),
				esc_html__( 'Allow AI search and answer bots, block model-training crawlers', 'adcanvas' ),
				esc_html__( 'Training-only crawlers blocked by the second option: GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent, Bytespider. Search crawlers (Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot) stay allowed either way.', 'adcanvas' )
			);
		}, 'reading', 'adcanvas_seo' );
		add_settings_field( 'adcanvas_indexnow', __( 'IndexNow', 'adcanvas' ), function () {
			printf(
				'<label><input type="checkbox" name="adcanvas_indexnow" value="1" %s> %s</label><p class="description">%s</p>',
				checked( (bool) get_option( 'adcanvas_indexnow', true ), true, false ),
				esc_html__( 'Notify Bing, Yandex, Seznam and Naver as soon as a post or page is published or updated', 'adcanvas' ),
				esc_html__( 'Bing’s index also feeds Copilot and ChatGPT search. Only runs on a public, production site.', 'adcanvas' )
			);
		}, 'reading', 'adcanvas_seo' );
	}
);

/** Social profile URLs from Settings → Reading. */
function adcanvas_social_profiles() {
	return array_values( array_filter( array_map( 'trim', explode( "\n", (string) get_option( 'adcanvas_social_profiles', '' ) ) ) ) );
}

/* ── Title, description, canonical, robots ── */

add_filter(
	'pre_get_document_title',
	function ( $title ) {
		if ( adcanvas_seo_plugin_active() || ! is_singular() ) {
			return $title;
		}
		$custom = trim( (string) get_post_meta( get_queried_object_id(), 'adcanvas_seo_title', true ) );
		return '' !== $custom ? $custom : $title;
	}
);

/** Meta description for the current request, ≤ 160 characters. */
function adcanvas_meta_description() {
	$d = '';
	if ( is_singular() ) {
		$id = get_queried_object_id();
		$d  = (string) get_post_meta( $id, 'adcanvas_seo_description', true );
		if ( '' === trim( $d ) && has_excerpt( $id ) ) {
			$d = get_the_excerpt( $id );
		}
		if ( '' === trim( $d ) && ! is_front_page() ) {
			$d = wp_trim_words( wp_strip_all_tags( strip_shortcodes( (string) get_post_field( 'post_content', $id ) ) ), 30, '' );
		}
	} elseif ( is_category() || is_tag() || is_tax() ) {
		$d = term_description();
	} elseif ( is_author() ) {
		$d = get_the_author_meta( 'description', (int) get_queried_object_id() );
	} elseif ( is_home() && ! is_front_page() && get_option( 'page_for_posts' ) ) {
		$d = get_the_excerpt( (int) get_option( 'page_for_posts' ) );
	}
	$d = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( (string) $d ) ) );
	if ( '' === $d ) {
		$d = get_bloginfo( 'description' );
	}
	return mb_strlen( $d ) > 160 ? rtrim( mb_substr( $d, 0, 157 ), " ,.;:-" ) . '…' : $d;
}

/** The canonical URL of the current request. */
function adcanvas_current_url() {
	if ( is_front_page() ) {
		return home_url( '/' );
	}
	if ( is_singular() ) {
		return (string) wp_get_canonical_url( get_queried_object_id() );
	}
	return get_pagenum_link( max( 1, (int) get_query_var( 'paged' ) ) );
}

/** True when the current request shouldn't be indexed. */
function adcanvas_is_noindex() {
	return is_404() || is_search() || is_date() || is_attachment()
		|| ( is_singular() && (bool) get_post_meta( get_queried_object_id(), 'adcanvas_noindex', true ) );
}

add_filter(
	'wp_robots',
	function ( $robots ) {
		if ( adcanvas_seo_plugin_active() || ! get_option( 'blog_public' ) ) {
			return $robots;
		}
		if ( adcanvas_is_noindex() ) {
			$robots['noindex'] = true;
			$robots['follow']  = true;
		} else {
			// Let search and AI engines quote long snippets and show large previews.
			$robots['max-snippet']       = '-1';
			$robots['max-video-preview'] = '-1';
		}
		return $robots;
	}
);

/** First x.com / twitter.com handle in the social profiles, e.g. "@adcanvas". */
function adcanvas_twitter_handle() {
	foreach ( adcanvas_social_profiles() as $url ) {
		if ( preg_match( '#^https?://(?:www\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/?$#', $url, $m ) ) {
			return '@' . $m[1];
		}
	}
	return '';
}

/** [url, width, height, alt] of the share image for the current request. */
function adcanvas_share_image() {
	if ( is_singular() && has_post_thumbnail( get_queried_object_id() ) ) {
		$thumb = get_post_thumbnail_id( get_queried_object_id() );
		$src   = wp_get_attachment_image_src( $thumb, 'large' );
		if ( $src ) {
			$alt = trim( (string) get_post_meta( $thumb, '_wp_attachment_image_alt', true ) );
			return array( $src[0], (int) $src[1], (int) $src[2], '' !== $alt ? $alt : get_the_title( get_queried_object_id() ) );
		}
	}
	/* translators: %s: site name */
	return array( get_theme_file_uri( 'assets/images/social-card.png' ), 1200, 630, sprintf( __( '%s — the AI canvas for ad campaigns', 'adcanvas' ), get_bloginfo( 'name' ) ) );
}

add_action(
	'wp_head',
	function () {
		// Machine-readable site summary for AI answer engines (see inc/llms.php).
		printf( '<link rel="alternate" type="text/plain" title="%s" href="%s">' . "\n", esc_attr__( 'LLM-readable site summary', 'adcanvas' ), esc_url( home_url( '/llms.txt' ) ) );

		if ( adcanvas_seo_plugin_active() ) {
			return;
		}
		$title       = wp_get_document_title();
		$description = adcanvas_meta_description();
		$url         = adcanvas_current_url();
		list( $img, $w, $h, $alt ) = adcanvas_share_image();
		$is_post     = is_singular( 'post' );

		$tags = array(
			array( 'name', 'description', $description ),
			array( 'property', 'og:locale', get_locale() ),
			array( 'property', 'og:type', $is_post ? 'article' : 'website' ),
			array( 'property', 'og:site_name', get_bloginfo( 'name' ) ),
			array( 'property', 'og:title', $title ),
			array( 'property', 'og:description', $description ),
			array( 'property', 'og:url', $url ),
			array( 'property', 'og:image', $img ),
			array( 'property', 'og:image:width', (string) $w ),
			array( 'property', 'og:image:height', (string) $h ),
			array( 'property', 'og:image:alt', $alt ),
			array( 'name', 'twitter:card', 'summary_large_image' ),
			array( 'name', 'twitter:title', $title ),
			array( 'name', 'twitter:description', $description ),
			array( 'name', 'twitter:image', $img ),
			array( 'name', 'twitter:image:alt', $alt ),
		);
		if ( adcanvas_twitter_handle() ) {
			$tags[] = array( 'name', 'twitter:site', adcanvas_twitter_handle() );
		}
		if ( $is_post ) {
			$id     = get_queried_object_id();
			$tags[] = array( 'property', 'article:published_time', get_post_time( 'c', true, $id ) );
			$tags[] = array( 'property', 'article:modified_time', get_post_modified_time( 'c', true, $id ) );
			$tags[] = array( 'property', 'article:author', get_the_author_meta( 'display_name', (int) get_post_field( 'post_author', $id ) ) );
			$cats   = get_the_category( $id );
			if ( $cats ) {
				$tags[] = array( 'property', 'article:section', $cats[0]->name );
			}
			foreach ( (array) get_the_tags( $id ) as $tag ) {
				if ( $tag instanceof WP_Term ) {
					$tags[] = array( 'property', 'article:tag', $tag->name );
				}
			}
			$minutes = adcanvas_reading_time( $id );
			$tags[]  = array( 'name', 'twitter:label1', __( 'Reading time', 'adcanvas' ) );
			/* translators: %d: minutes */
			$tags[] = array( 'name', 'twitter:data1', sprintf( _n( '%d minute', '%d minutes', $minutes, 'adcanvas' ), $minutes ) );
		}
		foreach ( $tags as list( $attr, $key, $value ) ) {
			if ( '' === (string) $value ) {
				continue;
			}
			$is_url = in_array( $key, array( 'og:url', 'og:image', 'twitter:image' ), true );
			printf( '<meta %s="%s" content="%s">' . "\n", $attr, esc_attr( $key ), $is_url ? esc_url( $value ) : esc_attr( $value ) ); // phpcs:ignore WordPress.Security.EscapeOutput -- $attr is a literal.
		}
		// Core prints rel=canonical for single posts and pages; cover the blog, archives and pagination.
		if ( ! is_singular() && ! adcanvas_is_noindex() ) {
			printf( '<link rel="canonical" href="%s">' . "\n", esc_url( $url ) );
		}
	},
	5
);

/* ── Sitemaps: leave out pages marked "hide from search" ── */

add_filter(
	'wp_sitemaps_posts_query_args',
	function ( $args ) {
		if ( adcanvas_seo_plugin_active() ) {
			return $args;
		}
		$args['meta_query'] = array( // phpcs:ignore WordPress.DB.SlowDBQuery
			'relation' => 'OR',
			array( 'key' => 'adcanvas_noindex', 'compare' => 'NOT EXISTS' ),
			array( 'key' => 'adcanvas_noindex', 'value' => '1', 'compare' => '!=' ),
		);
		return $args;
	}
);

/* ── robots.txt ── */

/** Crawlers that only collect model-training data (not search or answer retrieval). */
const ADCANVAS_AI_TRAINING_BOTS = array( 'GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent', 'Bytespider' );

add_filter(
	'robots_txt',
	function ( $output, $public ) {
		if ( ! $public ) {
			return $output;
		}
		// Keep internal search results out of every index.
		$output = preg_replace( '#(Disallow: /wp-admin/\n)#', "$1Disallow: /?s=\nDisallow: /search/\n", (string) $output, 1 );
		if ( 'search-only' === get_option( 'adcanvas_ai_crawlers', 'all' ) ) {
			$output .= "\n# Model-training crawlers are blocked; AI search and answer bots are allowed.\n";
			foreach ( ADCANVAS_AI_TRAINING_BOTS as $bot ) {
				$output .= "User-agent: {$bot}\nDisallow: /\n\n";
			}
		}
		$output .= "\n# LLM-readable summary of this site: " . home_url( '/llms.txt' ) . "\n";
		return $output;
	},
	20,
	2
);

/* ── Heading anchors (jump links, "On this page", answer-engine deep links) ── */

/**
 * Adds stable id attributes to h2/h3 elements that lack one.
 *
 * @param string $html     Rendered HTML.
 * @param array  $headings Filled with [level, id, text] for each h2/h3.
 */
function adcanvas_add_heading_ids( $html, &$headings = array() ) {
	$used     = array();
	$headings = array();
	return preg_replace_callback(
		'#<h([23])(\s[^>]*)?>(.*?)</h\1>#is',
		function ( $m ) use ( &$used, &$headings ) {
			$attrs = $m[2] ?? '';
			$text  = trim( html_entity_decode( wp_strip_all_tags( $m[3] ), ENT_QUOTES, 'UTF-8' ) );
			if ( preg_match( '/\sid=(["\'])(.*?)\1/', $attrs, $idm ) ) {
				$id = $idm[2];
			} else {
				$base = sanitize_title( $text );
				$base = '' !== $base ? $base : 'section';
				$id   = $base;
				for ( $n = 2; isset( $used[ $id ] ); $n++ ) {
					$id = $base . '-' . $n;
				}
				$attrs = ' id="' . esc_attr( $id ) . '"' . $attrs;
			}
			$used[ $id ] = true;
			$headings[]  = array( 'level' => (int) $m[1], 'id' => $id, 'text' => $text );
			return '<h' . $m[1] . $attrs . '>' . $m[3] . '</h' . $m[1] . '>';
		},
		(string) $html
	);
}

add_filter(
	'the_content',
	function ( $content ) {
		if ( is_singular() && get_the_ID() === get_queried_object_id() ) {
			$content = adcanvas_add_heading_ids( $content );
		}
		return $content;
	},
	12
);

/**
 * h2/h3 headings of a post's rendered content, with the same ids as on the page.
 *
 * @return array<int, array{level:int,id:string,text:string}>
 */
function adcanvas_post_headings( $post_id ) {
	static $cache = array();
	if ( ! isset( $cache[ $post_id ] ) ) {
		$headings = array();
		adcanvas_add_heading_ids( do_blocks( (string) get_post_field( 'post_content', $post_id ) ), $headings );
		$cache[ $post_id ] = $headings;
	}
	return $cache[ $post_id ];
}

/* ── Related posts: the query loop with queryId 42 shows posts from the same category ── */

const ADCANVAS_RELATED_QUERY_ID = 42;

add_filter(
	'query_loop_block_query_vars',
	function ( $query, $block ) {
		if ( (int) ( $block->context['queryId'] ?? 0 ) !== ADCANVAS_RELATED_QUERY_ID || ! is_singular( 'post' ) ) {
			return $query;
		}
		$id                           = get_queried_object_id();
		$query['post__not_in']        = array( $id );
		$query['ignore_sticky_posts'] = true;
		$cats                         = wp_get_post_categories( $id );
		if ( $cats ) {
			$query['category__in'] = $cats;
		}
		return $query;
	},
	10,
	2
);

/* ── Performance hints (Core Web Vitals) ── */

/** Intrinsic sizes of the theme's bundled screenshots. */
const ADCANVAS_IMAGE_SIZES = array(
	'app-canvas.webp'    => array( 2400, 1433 ),
	'app-dashboard.webp' => array( 2400, 1433 ),
	'app-ai.webp'        => array( 760, 1100 ),
	'app-mockups.webp'   => array( 694, 846 ),
);

// Width/height on theme images prevent layout shift and let core pick fetchpriority/lazy-loading.
add_filter(
	'render_block_core/image',
	function ( $content ) {
		if ( false === strpos( $content, '/assets/images/' ) ) {
			return $content;
		}
		return preg_replace_callback(
			'/<img\b[^>]*>/',
			function ( $m ) {
				$tag = $m[0];
				foreach ( ADCANVAS_IMAGE_SIZES as $file => $wh ) {
					if ( false !== strpos( $tag, '/assets/images/' . $file ) && ! preg_match( '/\swidth=/', $tag ) ) {
						$tag = str_replace( '<img', '<img width="' . $wh[0] . '" height="' . $wh[1] . '"', $tag );
						break;
					}
				}
				if ( ! preg_match( '/\sdecoding=/', $tag ) ) {
					$tag = str_replace( '<img', '<img decoding="async"', $tag );
				}
				return $tag;
			},
			$content
		);
	}
);

// The hero screenshot is the largest contentful paint on the front page.
add_action(
	'wp_head',
	function () {
		if ( is_front_page() ) {
			printf( '<link rel="preload" as="image" href="%s" fetchpriority="high">' . "\n", esc_url( get_theme_file_uri( 'assets/images/app-canvas.webp' ) ) );
		}
	},
	2
);

/* ── IndexNow: tell Bing & co. about new and updated content immediately ── */

/** The site's IndexNow key (created on first use). */
function adcanvas_indexnow_key() {
	$key = (string) get_option( 'adcanvas_indexnow_key' );
	if ( ! preg_match( '/^[a-f0-9]{32}$/', $key ) ) {
		$key = md5( wp_generate_password( 32, true, true ) );
		update_option( 'adcanvas_indexnow_key', $key, true );
	}
	return $key;
}

function adcanvas_indexnow_enabled() {
	return (bool) get_option( 'adcanvas_indexnow', true ) && (bool) get_option( 'blog_public' )
		&& 'production' === wp_get_environment_type() && ! defined( 'RANK_MATH_VERSION' );
}

add_action(
	'transition_post_status',
	function ( $new, $old, $post ) {
		if ( 'publish' !== $new || ! adcanvas_indexnow_enabled() || wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return;
		}
		if ( ! in_array( $post->post_type, array( 'post', 'page' ), true ) || get_post_meta( $post->ID, 'adcanvas_noindex', true ) ) {
			return;
		}
		$url = get_permalink( $post );
		if ( ! $url || get_transient( 'adcanvas_indexnow_' . md5( $url ) ) ) {
			return; // One ping per URL every 10 minutes is plenty.
		}
		set_transient( 'adcanvas_indexnow_' . md5( $url ), 1, 10 * MINUTE_IN_SECONDS );
		$key = adcanvas_indexnow_key();
		wp_remote_post(
			'https://api.indexnow.org/indexnow',
			array(
				'blocking' => false,
				'timeout'  => 3,
				'headers'  => array( 'Content-Type' => 'application/json; charset=utf-8' ),
				'body'     => wp_json_encode( array( 'host' => wp_parse_url( home_url(), PHP_URL_HOST ), 'key' => $key, 'keyLocation' => home_url( "/{$key}.txt" ), 'urlList' => array( $url ) ) ),
			)
		);
	},
	10,
	3
);
