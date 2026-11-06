#!/usr/bin/env bash
# Checks the WordPress theme without a WordPress install:
#  1. php -l on every PHP file, node --check on the editor script
#  2. expands templates/patterns/parts and validates the block markup (also the starter content)
#  3. runs the SEO/schema/llms.txt code against a stubbed WordPress
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; wp="$(cd "$here/../.." && pwd)"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
find "$wp/adcanvas-theme" -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null
node --check "$wp/adcanvas-theme/assets/js/editor.js"
php "$here/expand.php" "$wp/adcanvas-theme" "$tmp/templates"
node "$here/validate.mjs" "$tmp/templates"
mkdir "$tmp/content" && php -r '$x=simplexml_load_file($argv[1]); foreach($x->channel->item as $i){ file_put_contents($argv[2]."/".$i->children("wp",true)->post_name.".html",(string)$i->children("content",true)->encoded); }' "$wp/adcanvas-starter-content.xml" "$tmp/content"
node "$here/validate.mjs" "$tmp/content"
php "$here/harness.php"
