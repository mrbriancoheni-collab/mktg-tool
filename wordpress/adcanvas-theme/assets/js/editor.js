/**
 * AdCanvas editor additions: breadcrumbs and table-of-contents blocks (rendered on the
 * server; static previews here) and a "Search & AI" panel for per-page SEO fields.
 * Plain ES5 + wp globals, so the theme needs no build step.
 */
( function ( wp ) {
	var el = wp.element.createElement;
	var __ = wp.i18n.__;
	var sprintf = wp.i18n.sprintf;
	var useBlockProps = wp.blockEditor.useBlockProps;
	var InspectorControls = wp.blockEditor.InspectorControls;
	var c = wp.components;

	wp.blocks.registerBlockType( 'adcanvas/breadcrumbs', {
		edit: function () {
			return el(
				'nav',
				useBlockProps( { className: 'adcanvas-breadcrumbs', 'aria-label': __( 'Breadcrumb', 'adcanvas' ) } ),
				el( 'ol', null,
					el( 'li', null, el( 'a', { href: '#' }, __( 'Home', 'adcanvas' ) ) ),
					el( 'li', null, el( 'a', { href: '#' }, __( 'Section', 'adcanvas' ) ) ),
					el( 'li', { 'aria-current': 'page' }, __( 'Current page', 'adcanvas' ) )
				)
			);
		},
		save: function () {
			return null;
		},
	} );

	wp.blocks.registerBlockType( 'adcanvas/toc', {
		edit: function ( props ) {
			var a = props.attributes;
			return el( wp.element.Fragment, null,
				el( InspectorControls, null,
					el( c.PanelBody, { title: __( 'Settings', 'adcanvas' ) },
						el( c.RangeControl, { label: __( 'Show when the post has at least this many sections', 'adcanvas' ), min: 1, max: 10, value: a.minHeadings, onChange: function ( v ) { props.setAttributes( { minHeadings: v || 3 } ); } } ),
						el( c.ToggleControl, { label: __( 'Include subheadings (H3)', 'adcanvas' ), checked: !! a.includeH3, onChange: function ( v ) { props.setAttributes( { includeH3: v } ); } } )
					)
				),
				el( 'nav', useBlockProps( { className: 'adcanvas-toc' } ),
					el( 'p', { className: 'adcanvas-toc-title' }, __( 'On this page', 'adcanvas' ) ),
					el( 'p', { className: 'adcanvas-toc-hint' }, sprintf( __( 'Links to each H2 in the post, shown when it has %d or more.', 'adcanvas' ), a.minHeadings ) )
				)
			);
		},
		save: function () {
			return null;
		},
	} );

	var Panel = ( wp.editor && wp.editor.PluginDocumentSettingPanel ) || ( wp.editPost && wp.editPost.PluginDocumentSettingPanel );
	if ( ! Panel || ! wp.plugins ) {
		return;
	}

	function counter( text, ideal ) {
		var n = ( text || '' ).length;
		return sprintf( __( '%1$d / %2$d characters', 'adcanvas' ), n, ideal ) + ( n > ideal ? ' — ' + __( 'may be cut off in results', 'adcanvas' ) : '' );
	}

	function SearchPanel() {
		var postType = wp.data.useSelect( function ( s ) { return s( 'core/editor' ).getCurrentPostType(); }, [] );
		var entity = wp.coreData.useEntityProp( 'postType', postType, 'meta' );
		var meta = entity[ 0 ];
		var setMeta = entity[ 1 ];
		if ( ( postType !== 'post' && postType !== 'page' ) || ! meta ) {
			return null;
		}
		function set( key ) {
			return function ( v ) { var m = {}; m[ key ] = v; setMeta( Object.assign( {}, meta, m ) ); };
		}
		return el( Panel, { name: 'adcanvas-search', title: __( 'Search & AI', 'adcanvas' ) },
			el( c.TextControl, { label: __( 'Search title', 'adcanvas' ), value: meta.adcanvas_seo_title || '', onChange: set( 'adcanvas_seo_title' ), help: counter( meta.adcanvas_seo_title, 60 ) + '. ' + __( 'Leave empty to use the page title.', 'adcanvas' ) } ),
			el( c.TextareaControl, { label: __( 'Meta description', 'adcanvas' ), value: meta.adcanvas_seo_description || '', onChange: set( 'adcanvas_seo_description' ), help: counter( meta.adcanvas_seo_description, 155 ) + '. ' + __( 'Answer the searcher’s question in one sentence. Falls back to the excerpt.', 'adcanvas' ) } ),
			el( c.ToggleControl, { label: __( 'Hide from search engines', 'adcanvas' ), checked: !! meta.adcanvas_noindex, onChange: set( 'adcanvas_noindex' ), help: __( 'Adds noindex and leaves the page out of the sitemap and llms.txt.', 'adcanvas' ) } )
		);
	}

	wp.plugins.registerPlugin( 'adcanvas-search', { render: SearchPanel } );
} )( window.wp );
