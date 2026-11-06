<?php
/**
 * Title: Related posts (same category)
 * Slug: adcanvas/related-posts
 * Categories: adcanvas-blog, query
 * Keywords: related, more, posts
 * Inserter: no
 */
?>
<!-- wp:group {"tagName":"section","align":"full","backgroundColor":"surface","style":{"spacing":{"padding":{"top":"var:preset|spacing|60","bottom":"var:preset|spacing|60"},"blockGap":"var:preset|spacing|40"}},"layout":{"type":"constrained","contentSize":"1200px"}} -->
<section class="wp-block-group alignfull has-surface-background-color has-background" style="padding-top:var(--wp--preset--spacing--60);padding-bottom:var(--wp--preset--spacing--60)"><!-- wp:heading {"align":"wide"} -->
<h2 class="wp-block-heading alignwide"><?php esc_html_e( 'Keep reading', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:query {"queryId":42,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false},"align":"wide"} -->
<div class="wp-block-query alignwide"><!-- wp:post-template {"layout":{"type":"grid","columnCount":3},"style":{"spacing":{"blockGap":"var:preset|spacing|40"}}} -->
<!-- wp:pattern {"slug":"adcanvas/post-card"} /-->
<!-- /wp:post-template --></div>
<!-- /wp:query --></section>
<!-- /wp:group -->
