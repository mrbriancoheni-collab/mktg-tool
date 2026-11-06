<?php
// Runs the theme's SEO code against a stubbed WordPress for three requests:
// a blog post, the front page and a legal sub-page. Fails loudly on PHP errors.
error_reporting( E_ALL );
set_error_handler( function ( $no, $str, $file, $line ) { fwrite( STDERR, "PHP $no: $str at $file:$line\n" ); exit( 1 ); } );
define( 'ABSPATH', __DIR__ );
define( 'THEME', dirname( __DIR__, 2 ) . '/adcanvas-theme' );
// The budget-pacing starter post, straight from the import file.
$wxr = simplexml_load_file( dirname( __DIR__, 2 ) . '/adcanvas-starter-content.xml' );
$PACING = '';
foreach ( $wxr->channel->item as $item ) { if ( 'budget-pacing-catch-overspend' === (string) $item->children( 'wp', true )->post_name ) { $PACING = (string) $item->children( 'content', true )->encoded; } }
define( 'DAY_IN_SECONDS', 86400 ); define( 'MINUTE_IN_SECONDS', 60 );
class WP_Post { public $ID; public $post_type; public $post_content; public $post_name; public $post_title; function __construct( $a ) { foreach ( $a as $k => $v ) $this->$k = $v; } }
class WP_Term { public $name; public $slug; function __construct( $n, $s ) { $this->name = $n; $this->slug = $s; } }
class WP_Block { public $context = array(); }
$H = array(); // hooks
function add_action( $h, $cb, $p = 10, $n = 1 ) { $GLOBALS['H'][ $h ][] = array( $cb, $n ); }
function add_filter( $h, $cb, $p = 10, $n = 1 ) { add_action( $h, $cb, $p, $n ); }
function run( $h, ...$args ) { foreach ( $GLOBALS['H'][ $h ] ?? array() as list( $cb, $n ) ) { $r = $cb( ...array_slice( $args, 0, $n ) ); if ( $args ) $args[0] = $r; } return $args[0] ?? null; }
function remove_action() {} function apply_filters( $h, $v ) { return 'the_content' === $h ? run( 'the_content', $v ) : $v; }
foreach ( array( '__', 'esc_html__', 'esc_attr__', 'esc_html', 'esc_attr', 'esc_textarea', 'sanitize_text_field', 'untrailingslashit', 'esc_url_raw', 'trailingslashit' ) as $f ) eval( "function $f(\$s){return (string)\$s;}" );
function _n( $a, $b, $n ) { return 1 === $n ? $a : $b; }
function esc_url( $s ) { return (string) $s; }
function wp_strip_all_tags( $s ) { return trim( strip_tags( preg_replace( '@<(script|style)[^>]*?>.*?</\\1>@si', '', (string) $s ) ) ); }
function sanitize_title( $s ) { return trim( preg_replace( '/[^a-z0-9]+/', '-', strtolower( $s ) ), '-' ); }
function wp_json_encode( $d, $f = 0 ) { return json_encode( $d, $f ); }
function wp_parse_url( $u, $c = -1 ) { return parse_url( $u, $c ); }
function wp_trim_words( $t, $n = 55, $m = '…' ) { $w = preg_split( '/\s+/', trim( $t ) ); return implode( ' ', array_slice( $w, 0, $n ) ) . ( count( $w ) > $n ? $m : '' ); }
function strip_shortcodes( $s ) { return $s; } function do_blocks( $s ) { return $s; } function wp_list_pluck( $l, $f ) { return array_map( fn( $o ) => $o->$f, $l ); }
function home_url( $p = '' ) { return 'https://adcanvas.example' . $p; }
function get_theme_file_uri( $p ) { return 'https://adcanvas.example/wp-content/themes/adcanvas/' . $p; }
function get_theme_file_path( $p ) { return '/theme/' . $p; }
$OPT = array( 'blog_public' => 1, 'page_for_posts' => 5, 'page_on_front' => 4, 'adcanvas_social_profiles' => "https://x.com/adcanvas\nhttps://www.linkedin.com/company/adcanvas", 'adcanvas_ai_crawlers' => 'search-only' );
function get_option( $k, $d = false ) { return $GLOBALS['OPT'][ $k ] ?? $d; } function update_option( $k, $v ) { $GLOBALS['OPT'][ $k ] = $v; } function delete_option() {}
function get_transient() { return false; } function set_transient() {} function delete_transient() {}
function get_bloginfo( $k ) { return array( 'name' => 'AdCanvas', 'description' => 'The AI canvas for ad campaigns', 'language' => 'en-US' )[ $k ] ?? ''; }
function get_locale() { return 'en_US'; }
$POSTS = array(
	4  => new WP_Post( array( 'ID' => 4, 'post_type' => 'page', 'post_name' => 'home', 'post_title' => 'Home', 'post_content' => '<p>front</p>' ) ),
	5  => new WP_Post( array( 'ID' => 5, 'post_type' => 'page', 'post_name' => 'blog', 'post_title' => 'Blog', 'post_content' => '' ) ),
	9  => new WP_Post( array( 'ID' => 9, 'post_type' => 'page', 'post_name' => 'legal', 'post_title' => 'Legal', 'post_content' => '' ) ),
	10 => new WP_Post( array( 'ID' => 10, 'post_type' => 'page', 'post_name' => 'privacy', 'post_title' => 'Privacy Policy', 'post_content' => '<h2 class="wp-block-heading">What we collect</h2><p>Data.</p>' ) ),
	20 => new WP_Post( array( 'ID' => 20, 'post_type' => 'post', 'post_name' => 'pacing', 'post_title' => 'Budget pacing: catch overspend', 'post_content' => $GLOBALS['PACING'] ) ),
);
$Q = array(); // current request
function get_queried_object_id() { return $GLOBALS['Q']['id'] ?? 0; } function get_queried_object() { return null; } function get_the_ID() { return get_queried_object_id(); }
function is_front_page() { return 'front' === $GLOBALS['Q']['kind']; }
function is_singular( $t = null ) { $id = get_queried_object_id(); return $id && ( ! $t || $GLOBALS['POSTS'][ $id ]->post_type === $t ); }
function is_page() { return is_singular( 'page' ); }
foreach ( array( 'is_home', 'is_archive', 'is_search', 'is_404', 'is_date', 'is_attachment', 'is_category', 'is_tag', 'is_tax', 'is_author' ) as $f ) eval( "function $f(){return false;}" );
function get_post_field( $f, $id ) { return $GLOBALS['POSTS'][ $id ]->$f ?? ''; }
function get_post_meta( $id, $k ) { return ''; } function has_excerpt() { return false; } function get_the_excerpt( $id = 0 ) { return ''; }
function get_the_title( $p ) { $id = is_object( $p ) ? $p->ID : $p; return $GLOBALS['POSTS'][ $id ]->post_title; }
function get_permalink( $p ) { $id = is_object( $p ) ? $p->ID : $p; return home_url( '/' . ( 10 === $id ? 'legal/' : '' ) . $GLOBALS['POSTS'][ $id ]->post_name . '/' ); }
function wp_get_canonical_url( $id ) { return get_permalink( $id ); } function get_pagenum_link() { return home_url( '/blog/' ); }
function get_post_ancestors( $id ) { return 10 === ( is_object( $id ) ? $id->ID : $id ) ? array( 9 ) : array(); }
function get_page_by_path( $p ) { return 'legal' === $p ? $GLOBALS['POSTS'][9] : null; }
function get_the_category( $id ) { return 20 === $id ? array( new WP_Term( 'Measurement', 'measurement' ) ) : array(); }
function get_the_tags( $id ) { return 20 === $id ? array( new WP_Term( 'Budget pacing', 'budget-pacing' ) ) : false; }
function get_category_link( $t ) { return home_url( '/category/' . $t->slug . '/' ); }
function has_post_thumbnail() { return false; } function get_post_thumbnail_id() { return 0; } function wp_get_attachment_image_src() { return false; }
function get_post_time() { return '2026-10-26T09:00:00+00:00'; } function get_post_modified_time() { return '2026-11-02T09:00:00+00:00'; }
function get_the_author_meta( $f ) { return array( 'display_name' => 'Dana Lee', 'description' => 'Paid media lead.', 'user_url' => 'https://linkedin.com/in/dana' )[ $f ] ?? ''; }
function get_author_posts_url() { return home_url( '/author/dana/' ); } function get_avatar_url() { return 'https://secure.gravatar.com/avatar/x'; }
function get_site_icon_url() { return ''; } function wp_get_document_title() { return 'Title | AdCanvas'; } function adcanvas_app_url() { return 'https://app.adcanvas.example'; }
function wp_get_environment_type() { return 'production'; } function current_user_can() { return true; }
require THEME . '/inc/plans.php';
function adcanvas_reading_time() { return 3; }
require THEME . '/inc/seo.php';
require THEME . '/inc/schema.php';
require THEME . '/inc/llms.php';

$ok = 0; function check( $cond, $msg ) { global $ok; if ( ! $cond ) { fwrite( STDERR, "✗ $msg\n" ); exit( 1 ); } $ok++; }

// Heading ids are stable, unique and preserve existing ids.
$h = array(); $out = adcanvas_add_heading_ids( '<h2>Why?</h2><h2 class="x">Why?</h2><h3 id="keep">Sub</h3><h4>skip</h4>', $h );
check( false !== strpos( $out, '<h2 id="why">' ) && false !== strpos( $out, 'id="why-2" class="x"' ) && 3 === count( $h ) && 'keep' === $h[2]['id'], 'heading ids: ' . $out );

// FAQ parsing requires a question.
check( array( 'Is it free?', 'Yes, to start.' ) === adcanvas_parse_faq( '<details class="wp-block-details"><summary>Is it free?</summary><p>Yes, to start.</p></details>' ), 'faq parse' );
check( null === adcanvas_parse_faq( '<details><summary>Notes</summary><p>x</p></details>' ), 'faq ignores non-questions' );

// HTML → text.
$t = adcanvas_html_to_text( '<h2>Pricing</h2><p>See <a href="https://x.test/p">plans</a> and <strong>save</strong>.</p><ul><li>One</li><li>Two</li></ul>' );
check( false !== strpos( $t, '### Pricing' ) && false !== strpos( $t, '[plans](https://x.test/p)' ) && false !== strpos( $t, '**save**' ) && false !== strpos( $t, "- One\n- Two" ), "html_to_text:\n$t" );

function head() { ob_start(); run( 'wp_head' ); return ob_get_clean(); }
function graph( $html ) { preg_match( '#<script type="application/ld\+json">(.*?)</script>#s', $html, $m ); $j = json_decode( $m[1] ?? '', true ); check( is_array( $j ), 'valid JSON-LD' ); return $j['@graph']; }
function types( $g ) { return array_map( fn( $n ) => implode( '+', (array) $n['@type'] ), $g ); }

// 1) Blog post.
$GLOBALS['Q'] = array( 'kind' => 'post', 'id' => 20 );
$GLOBALS['adcanvas_seen'] = array( 'faq' => array(), 'pricing' => false );
foreach ( array( 'Should I pause a campaign?' => 'Usually not.' ) as $q => $a ) run( 'render_block_core/details', "<details><summary>$q</summary><p>$a</p></details>" );
$html = head(); $g = graph( $html );
echo "post:  ", implode( ', ', types( $g ) ), "\n";
check( array( 'Organization', 'WebSite', 'BreadcrumbList', 'WebPage+FAQPage', 'BlogPosting', 'Person' ) === types( $g ), 'post graph types' );
check( 4 === count( $g[2]['itemListElement'] ) && 'Measurement' === $g[2]['itemListElement'][2]['name'], 'post breadcrumb trail' );
check( 'PT3M' === $g[4]['timeRequired'] && 'Measurement' === $g[4]['articleSection'], 'article fields' );
foreach ( array( 'og:type" content="article', 'article:published_time', 'twitter:site" content="@adcanvas', 'og:image:width" content="1200', 'name="description"', 'rel="alternate" type="text/plain"' ) as $needle ) check( false !== strpos( $html, $needle ), "post head has $needle" );
check( false === strpos( $html, 'rel="canonical"' ), 'no duplicate canonical on singular (core prints it)' );
$robots = run( 'wp_robots', array() ); check( '-1' === ( $robots['max-snippet'] ?? '' ), 'robots max-snippet' );
$content = run( 'the_content', get_post_field( 'post_content', 20 ) ); check( false !== strpos( $content, 'id="how-do-you-calculate-budget-pacing"' ), 'content heading anchors' );

// 2) Front page with pricing table.
$GLOBALS['Q'] = array( 'kind' => 'front', 'id' => 4 );
$GLOBALS['adcanvas_seen'] = array( 'faq' => array(), 'pricing' => false );
run( 'render_block_core/group', '<section></section>', array( 'attrs' => array( 'className' => 'adcanvas-pricing' ) ) );
$g = graph( head() ); echo "front: ", implode( ', ', types( $g ) ), "\n";
check( in_array( 'SoftwareApplication', types( $g ), true ), 'front page has SoftwareApplication' );
$sw = $g[ array_search( 'SoftwareApplication', types( $g ), true ) ];
check( array( '0', '49', '149' ) === array_column( $sw['offers'], 'price' ), 'offers prices' );
check( ! in_array( 'BreadcrumbList', types( $g ), true ), 'no breadcrumbs on front page' );

// 3) Legal sub-page.
$GLOBALS['Q'] = array( 'kind' => 'page', 'id' => 10 );
$GLOBALS['adcanvas_seen'] = array( 'faq' => array(), 'pricing' => false );
$g = graph( head() ); echo "legal: ", implode( ', ', types( $g ) ), "\n";
check( array( 'Home', 'Legal', 'Privacy Policy' ) === array_column( $g[2]['itemListElement'], 'name' ), 'legal breadcrumbs' );

// Breadcrumbs block render.
$block = new WP_Block(); $attributes = array();
function get_block_wrapper_attributes( $a ) { return 'class="wp-block-adcanvas-breadcrumbs ' . $a['class'] . '"'; }
ob_start(); include THEME . '/blocks/breadcrumbs/render.php'; $bc = ob_get_clean();
check( false !== strpos( $bc, '<li aria-current="page">Privacy Policy</li>' ) && false !== strpos( $bc, 'aria-label="Breadcrumb"' ), "breadcrumb block: $bc" );

// TOC block on the post (4 H2 sections + FAQ heading).
$GLOBALS['Q'] = array( 'kind' => 'post', 'id' => 20 ); $block->context['postId'] = 20; $attributes = array( 'minHeadings' => 3 );
ob_start(); include THEME . '/blocks/toc/render.php'; $toc = ob_get_clean();
check( substr_count( $toc, '<li' ) >= 4 && false !== strpos( $toc, 'href="#how-do-you-calculate-budget-pacing"' ), "toc: $toc" );

// robots.txt
$r = run( 'robots_txt', "User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n", 1 );
check( false !== strpos( $r, "Disallow: /?s=" ) && false !== strpos( $r, "User-agent: GPTBot\nDisallow: /" ) && false === strpos( $r, 'OAI-SearchBot' ) && false !== strpos( $r, 'llms.txt' ), "robots.txt:\n$r" );
// llms.txt
function get_posts( $a ) { return array_values( array_filter( $GLOBALS['POSTS'], fn( $p ) => $p->post_type === $a['post_type'] ) ); }
$txt = adcanvas_llms_txt();
check( 0 === strpos( $txt, "# AdCanvas\n\n> The AI canvas" ) && false !== strpos( $txt, '- Pro: $49 per workspace per month.' ) && false !== strpos( $txt, "## Legal\n\n- [Legal](" ) && false !== strpos( $txt, '[Privacy Policy](https://adcanvas.example/legal/privacy/)' ) && false !== strpos( $txt, '## Guides and blog' ) && false === strpos( $txt, '[Home]' ), "llms.txt:\n$txt" );
echo "$ok checks passed\n";
