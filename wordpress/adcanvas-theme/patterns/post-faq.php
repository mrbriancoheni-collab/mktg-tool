<?php
/**
 * Title: Post FAQ (adds FAQ structured data)
 * Slug: adcanvas/post-faq
 * Categories: adcanvas-blog
 * Keywords: faq, questions, answers, people also ask
 * Description: Questions people actually search for, each answered in 40–60 words. Every Details block whose summary ends in “?” is published as FAQPage structured data.
 */
?>
<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'Frequently asked questions', 'adcanvas' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:details -->
<details class="wp-block-details"><summary><?php esc_html_e( 'A question your readers ask?', 'adcanvas' ); ?></summary><!-- wp:paragraph -->
<p><?php esc_html_e( 'Start with the answer in the first sentence, then add one or two sentences of context or a number.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->

<!-- wp:details -->
<details class="wp-block-details"><summary><?php esc_html_e( 'Another common question?', 'adcanvas' ); ?></summary><!-- wp:paragraph -->
<p><?php esc_html_e( 'Keep each answer self-contained so it still makes sense when quoted on its own.', 'adcanvas' ); ?></p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
