<?php
/**
 * Structured data (JSON-LD) as one connected @graph:
 * Organization, WebSite, WebPage (FAQPage / AboutPage / ContactPage / CollectionPage),
 * BreadcrumbList, BlogPosting with author Person, SoftwareApplication with Offers,
 * plus the breadcrumb trail used by the adcanvas/breadcrumbs block.
 *
 * In a block theme the template is rendered before wp_head runs, so blocks seen while
 * rendering (FAQ questions, the pricing table) are known by the time the graph is printed.
 *
 * With an SEO plugin active, only the parts plugins don't produce are printed
 * (FAQPage questions and the SoftwareApplication offers).
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

/* ── Collect questions and the pricing table while blocks render ── */

/** @var array{faq: array<string,string>, pricing: bool} */
$GLOBALS['adcanvas_seen'] = array( 'faq' => array(), 'pricing' => false );

/**
 * Parses a rendered Details block into [question, answer] when its summary is a question.
 *
 * @return array{0:string,1:string}|null
 */
function adcanvas_parse_faq( $html ) {
	if ( ! preg_match( '#<summary[^>]*>(.*?)</summary>(.*)</details>#is', (string) $html, $m ) ) {
		return null;
	}
	$q = trim( preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( $m[1] ), ENT_QUOTES, 'UTF-8' ) ) );
	$a = trim( preg_replace( '/\s+/u', ' ', html_entity_decode( wp_strip_all_tags( $m[2] ), ENT_QUOTES, 'UTF-8' ) ) );
	return ( '' !== $q && '' !== $a && '?' === substr( $q, -1 ) ) ? array( $q, $a ) : null;
}

add_filter(
	'render_block_core/details',
	function ( $content ) {
		$qa = adcanvas_parse_faq( $content );
		if ( $qa ) {
			$GLOBALS['adcanvas_seen']['faq'][ $qa[0] ] = $qa[1]; // Keyed by question: no duplicates.
		}
		return $content;
	}
);

add_filter(
	'render_block_core/group',
	function ( $content, $block ) {
		if ( false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'adcanvas-pricing' ) ) {
			$GLOBALS['adcanvas_seen']['pricing'] = true;
		}
		return $content;
	},
	10,
	2
);

/* ── Breadcrumbs ── */

/**
 * Breadcrumb trail for the current request, from Home to the current page.
 *
 * @return array<int, array{0:string,1:string}> [name, url] pairs; empty on the front page.
 */
function adcanvas_breadcrumb_trail() {
	if ( is_front_page() ) {
		return array();
	}
	$trail      = array( array( __( 'Home', 'adcanvas' ), home_url( '/' ) ) );
	$posts_page = (int) get_option( 'page_for_posts' );
	$blog       = $posts_page ? array( get_the_title( $posts_page ), get_permalink( $posts_page ) ) : array( __( 'Blog', 'adcanvas' ), home_url( '/' ) );

	if ( is_singular( 'post' ) ) {
		$id      = get_queried_object_id();
		$trail[] = $blog;
		$cats    = get_the_category( $id );
		if ( $cats && 'uncategorized' !== $cats[0]->slug ) {
			$trail[] = array( $cats[0]->name, get_category_link( $cats[0] ) );
		}
		$trail[] = array( get_the_title( $id ), get_permalink( $id ) );
	} elseif ( is_page() ) {
		$id = get_queried_object_id();
		foreach ( array_reverse( get_post_ancestors( $id ) ) as $ancestor ) {
			$trail[] = array( get_the_title( $ancestor ), get_permalink( $ancestor ) );
		}
		$trail[] = array( get_the_title( $id ), get_permalink( $id ) );
	} elseif ( is_home() ) {
		$trail[] = $blog;
	} elseif ( is_category() || is_tag() || is_tax() ) {
		$term    = get_queried_object();
		$trail[] = $blog;
		$trail[] = array( $term->name, get_term_link( $term ) );
	} elseif ( is_author() ) {
		$trail[] = $blog;
		$trail[] = array( get_the_author_meta( 'display_name', (int) get_queried_object_id() ), get_author_posts_url( (int) get_queried_object_id() ) );
	} elseif ( is_search() ) {
		$trail[] = array( __( 'Search results', 'adcanvas' ), get_search_link() );
	} elseif ( is_404() ) {
		$trail[] = array( __( 'Page not found', 'adcanvas' ), '' );
	} else {
		return array();
	}
	return $trail;
}

/* ── The graph ── */

function adcanvas_logo_url() {
	return get_site_icon_url( 512 ) ?: get_theme_file_uri( 'assets/images/logo.png' );
}

/** SoftwareApplication node: what the product is and what it costs. */
function adcanvas_software_node() {
	$home    = home_url( '/' );
	$pricing = get_page_by_path( 'pricing' );
	$offers  = array();
	foreach ( adcanvas_plans() as $plan ) {
		$offers[] = array(
			'@type'              => 'Offer',
			'name'               => $plan['name'],
			'description'        => $plan['blurb'],
			'price'              => (string) $plan['price'],
			'priceCurrency'      => 'USD',
			'category'           => 0 === $plan['price'] ? 'free' : 'subscription',
			'url'                => $pricing ? get_permalink( $pricing ) : $home,
			'availability'       => 'https://schema.org/InStock',
			'priceSpecification' => array(
				'@type'            => 'UnitPriceSpecification',
				'price'            => (string) $plan['price'],
				'priceCurrency'    => 'USD',
				'unitText'         => 'MONTH',
				'referenceQuantity' => array( '@type' => 'QuantitativeValue', 'value' => 1, 'unitCode' => 'MON' ),
			),
		);
	}
	return array(
		'@type'                 => 'SoftwareApplication',
		'@id'                   => $home . '#software',
		'name'                  => get_bloginfo( 'name' ),
		'description'           => __( 'An AI-powered visual canvas for ad campaigns: plan the funnel, forecast results, write and design the ads, connect live data from Google Ads, GA4, Meta, LinkedIn, TikTok, Shopify, HubSpot and Salesforce, and get AI analysis of what to improve.', 'adcanvas' ),
		'applicationCategory'   => 'BusinessApplication',
		'applicationSubCategory' => __( 'Marketing campaign planning and analytics', 'adcanvas' ),
		'operatingSystem'       => 'Web browser',
		'url'                   => $home,
		'installUrl'            => adcanvas_app_url() . '/signup',
		'image'                 => get_theme_file_uri( 'assets/images/app-canvas.webp' ),
		'screenshot'            => array_map(
			fn( $f ) => get_theme_file_uri( 'assets/images/' . $f ),
			array_keys( ADCANVAS_IMAGE_SIZES )
		),
		'featureList'           => array(
			__( 'AI campaign plan from a brief', 'adcanvas' ),
			__( 'Visual funnel canvas with 152 B2B and B2C building blocks', 'adcanvas' ),
			__( 'AI edits with preview and undo', 'adcanvas' ),
			__( 'Spend, revenue, ROAS and CPA forecasts with a budget optimizer', 'adcanvas' ),
			__( 'Ad copy within platform character limits; publish paused drafts to Google Ads and Meta', 'adcanvas' ),
			__( 'Live data from Google Ads, GA4, Meta, LinkedIn, TikTok, Shopify, HubSpot and Salesforce', 'adcanvas' ),
			__( 'AI health score, findings and A/B experiment tracking', 'adcanvas' ),
			__( 'Real-time collaboration, version history, PDF and PowerPoint reports', 'adcanvas' ),
		),
		'offers'                => $offers,
		'publisher'             => array( '@id' => $home . '#organization' ),
	);
}

/** @return array<int, array<string,mixed>> */
function adcanvas_schema_graph() {
	$home      = home_url( '/' );
	$org_id    = $home . '#organization';
	$site_id   = $home . '#website';
	$url       = adcanvas_current_url();
	$page_id   = $url . '#webpage';
	$lang      = get_bloginfo( 'language' );
	$faq       = $GLOBALS['adcanvas_seen']['faq'];
	$graph     = array();
	$full      = ! adcanvas_seo_plugin_active();
	$singular  = is_singular() ? get_queried_object_id() : 0;

	if ( $full ) {
		$graph[] = array_filter(
			array(
				'@type'  => 'Organization',
				'@id'    => $org_id,
				'name'   => get_bloginfo( 'name' ),
				'url'    => $home,
				'logo'   => array( '@type' => 'ImageObject', '@id' => $home . '#logo', 'url' => adcanvas_logo_url(), 'width' => 512, 'height' => 512, 'caption' => get_bloginfo( 'name' ) ),
				'image'  => array( '@id' => $home . '#logo' ),
				'sameAs' => adcanvas_social_profiles(),
			)
		);
		$graph[] = array(
			'@type'       => 'WebSite',
			'@id'         => $site_id,
			'url'         => $home,
			'name'        => get_bloginfo( 'name' ),
			'description' => get_bloginfo( 'description' ),
			'publisher'   => array( '@id' => $org_id ),
			'inLanguage'  => $lang,
		);

		// The page itself.
		$types = array( 'WebPage' );
		if ( is_home() || is_archive() ) {
			$types = array( 'CollectionPage' );
		} elseif ( is_search() ) {
			$types = array( 'SearchResultsPage' );
		} elseif ( $singular && 'about' === get_post_field( 'post_name', $singular ) ) {
			$types = array( 'AboutPage' );
		} elseif ( $singular && 'contact' === get_post_field( 'post_name', $singular ) ) {
			$types = array( 'ContactPage' );
		}
		if ( $faq ) {
			$types[] = 'FAQPage';
		}
		list( $img ) = adcanvas_share_image();
		$page = array(
			'@type'              => 1 === count( $types ) ? $types[0] : $types,
			'@id'                => $page_id,
			'url'                => $url,
			'name'               => wp_get_document_title(),
			'description'        => adcanvas_meta_description(),
			'isPartOf'           => array( '@id' => $site_id ),
			'inLanguage'         => $lang,
			'primaryImageOfPage' => array( '@type' => 'ImageObject', 'url' => $img ),
		);
		if ( $singular ) {
			$page['datePublished'] = get_post_time( 'c', true, $singular );
			$page['dateModified']  = get_post_modified_time( 'c', true, $singular );
		}
		if ( is_front_page() || $GLOBALS['adcanvas_seen']['pricing'] ) {
			$page['about'] = array( '@id' => $home . '#software' );
		}
		$trail = adcanvas_breadcrumb_trail();
		if ( count( $trail ) > 1 ) {
			$page['breadcrumb'] = array( '@id' => $url . '#breadcrumb' );
			$items              = array();
			foreach ( $trail as $i => list( $name, $item_url ) ) {
				$items[] = array_filter( array( '@type' => 'ListItem', 'position' => $i + 1, 'name' => $name, 'item' => $item_url ) );
			}
			$graph[] = array( '@type' => 'BreadcrumbList', '@id' => $url . '#breadcrumb', 'itemListElement' => $items );
		}
		if ( $faq ) {
			$page['mainEntity'] = adcanvas_faq_entities( $faq );
		}
		$graph[] = $page;

		// Blog posts: Article with a real author (E-E-A-T) and the content's shape.
		if ( is_singular( 'post' ) ) {
			$author_id = (int) get_post_field( 'post_author', $singular );
			$person_id = get_author_posts_url( $author_id ) . '#person';
			$cats      = get_the_category( $singular );
			$tags      = get_the_tags( $singular );
			$graph[]   = array_filter(
				array(
					'@type'            => 'BlogPosting',
					'@id'              => $url . '#article',
					'headline'         => mb_substr( wp_strip_all_tags( get_the_title( $singular ) ), 0, 110 ),
					'description'      => adcanvas_meta_description(),
					'image'            => array( $img ),
					'datePublished'    => get_post_time( 'c', true, $singular ),
					'dateModified'     => get_post_modified_time( 'c', true, $singular ),
					'author'           => array( '@id' => $person_id ),
					'publisher'        => array( '@id' => $org_id ),
					'mainEntityOfPage' => array( '@id' => $page_id ),
					'isPartOf'         => array( '@id' => $site_id ),
					'inLanguage'       => $lang,
					'articleSection'   => $cats ? $cats[0]->name : null,
					'keywords'         => $tags ? implode( ', ', wp_list_pluck( $tags, 'name' ) ) : null,
					'wordCount'        => str_word_count( wp_strip_all_tags( (string) get_post_field( 'post_content', $singular ) ) ),
					'timeRequired'     => 'PT' . adcanvas_reading_time( $singular ) . 'M',
					'speakable'        => array( '@type' => 'SpeakableSpecification', 'cssSelector' => array( '.wp-block-post-title', '.adcanvas-takeaways' ) ),
				)
			);
			$graph[] = array_filter(
				array(
					'@type'       => 'Person',
					'@id'         => $person_id,
					'name'        => get_the_author_meta( 'display_name', $author_id ),
					'url'         => get_author_posts_url( $author_id ),
					'description' => get_the_author_meta( 'description', $author_id ),
					'image'       => get_avatar_url( $author_id, array( 'size' => 192 ) ),
					'sameAs'      => array_values( array_filter( array( get_the_author_meta( 'user_url', $author_id ) ) ) ),
					'worksFor'    => array( '@id' => $org_id ),
				)
			);
		}
	} elseif ( $faq ) {
		// Plugins rarely mark up Details blocks: add the FAQ on its own.
		$graph[] = array( '@type' => 'FAQPage', '@id' => $url . '#faq', 'url' => $url, 'mainEntity' => adcanvas_faq_entities( $faq ) );
	}

	if ( is_front_page() || $GLOBALS['adcanvas_seen']['pricing'] ) {
		$graph[] = adcanvas_software_node();
	}
	return $graph;
}

/** @param array<string,string> $faq question => answer */
function adcanvas_faq_entities( $faq ) {
	$out = array();
	foreach ( $faq as $q => $a ) {
		$out[] = array( '@type' => 'Question', 'name' => $q, 'acceptedAnswer' => array( '@type' => 'Answer', 'text' => $a ) );
	}
	return $out;
}

add_action(
	'wp_head',
	function () {
		if ( is_404() ) {
			return;
		}
		$graph = adcanvas_schema_graph();
		if ( $graph ) {
			echo '<script type="application/ld+json">' . wp_json_encode( array( '@context' => 'https://schema.org', '@graph' => $graph ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG ) . "</script>\n";
		}
	},
	20
);
