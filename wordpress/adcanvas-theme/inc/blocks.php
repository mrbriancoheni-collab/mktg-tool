<?php
/**
 * Theme blocks (breadcrumbs, table of contents) and the editor's "Search & AI" panel.
 *
 * @package AdCanvas
 */

defined( 'ABSPATH' ) || exit;

add_action(
	'init',
	function () {
		wp_register_script(
			'adcanvas-editor',
			get_theme_file_uri( 'assets/js/editor.js' ),
			array( 'wp-blocks', 'wp-block-editor', 'wp-element', 'wp-i18n', 'wp-components', 'wp-data', 'wp-core-data', 'wp-plugins', 'wp-editor' ),
			ADCANVAS_VERSION,
			true
		);
		wp_set_script_translations( 'adcanvas-editor', 'adcanvas' );
		register_block_type( get_theme_file_path( 'blocks/breadcrumbs' ) );
		register_block_type( get_theme_file_path( 'blocks/toc' ) );
	}
);
