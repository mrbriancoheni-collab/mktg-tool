<?php
/**
 * Title: Latest blog posts (3)
 * Slug: adcanvas/latest-posts
 * Categories: adcanvas-blog, query
 * Keywords: blog, posts, latest, news
 */
?>
<!-- wp:group {"tagName":"section","align":"full","backgroundColor":"surface","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|50"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull has-surface-background-color has-background" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:group {"align":"wide","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between","verticalAlignment":"bottom"}} -->
<div class="wp-block-group alignwide"><!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'From the blog', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><a href="/blog/"><?php esc_html_e( 'All posts →', 'adcanvas' ); ?></a></p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->

<!-- wp:query {"queryId":11,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false},"align":"wide"} -->
<div class="wp-block-query alignwide"><!-- wp:post-template {"layout":{"type":"grid","columnCount":3},"style":{"spacing":{"blockGap":"var:preset|spacing|40"}}} -->
<!-- wp:pattern {"slug":"adcanvas/post-card"} /-->
<!-- /wp:post-template --></div>
<!-- /wp:query --></section>
<!-- /wp:group -->
