// Structural checks for block markup: balanced block comments, valid JSON attrs,
// balanced HTML tags inside each static block, and a clean parse by WordPress's parser.
import fs from "node:fs";
import path from "node:path";
import { parse } from "@wordpress/block-serialization-default-parser";
const dir = process.argv[2]; // a folder of .html block-markup files
const VOID = new Set(["img","br","hr","input","meta","link","source"]);
let errors = 0;
const err = (f, m) => { errors++; console.log(`✗ ${f}: ${m}`); };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  if (/<\?php|\$adcanvas/.test(src)) err(f, "unrendered PHP");
  const stack = [];
  const re = /<!--\s+(\/)?wp:([a-z0-9/-]+)(\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g;
  let m;
  while ((m = re.exec(src))) {
    const [, close, name, , json, selfClose] = m;
    if (json) { try { JSON.parse(json); } catch (e) { err(f, `bad JSON on ${name}: ${json.slice(0, 80)}`); } }
    if (selfClose) continue;
    if (!close) stack.push({ name, at: m.index });
    else {
      const top = stack.pop();
      if (!top || top.name !== name) err(f, `closing wp:${name} but open is ${top?.name} @${m.index}`);
      else {
        // HTML tag balance for the block's own markup (children blocks included — still must balance).
        const inner = src.slice(top.at, m.index).replace(/<!--[\s\S]*?-->/g, "");
        const tags = []; const tre = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/)?>/g; let t;
        while ((t = tre.exec(inner))) {
          const tn = t[2].toLowerCase(); if (VOID.has(tn) || t[3]) continue;
          if (!t[1]) tags.push(tn); else { const o = tags.pop(); if (o !== tn) { err(f, `HTML mismatch in wp:${name}: </${tn}> vs <${o}>`); break; } }
        }
        if (tags.length) err(f, `unclosed <${tags.join(",")}> in wp:${name}`);
      }
    }
  }
  if (stack.length) err(f, `unclosed blocks: ${stack.map((s) => s.name).join(", ")}`);
  const blocks = parse(src);
  const freeform = blocks.filter((b) => !b.blockName && b.innerHTML.trim());
  if (freeform.length) err(f, `stray HTML outside blocks: ${freeform[0].innerHTML.trim().slice(0, 80)}`);
}
console.log(errors ? `${errors} problem(s)` : "all markup OK");
process.exit(errors ? 1 : 0);
