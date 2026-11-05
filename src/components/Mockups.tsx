// AI ad mockups: Claude designs the creative (layout, copy, colors, image
// prompt); we render it as SVG for feed (1:1) and story (9:16) formats.
import { useState } from "react";
import { Copy, Download, ImageIcon, Sparkles } from "lucide-react";
import { api, type Mockup } from "../lib/api";
import { toGraph, useStore, type StageNode } from "../lib/store";
import { track } from "../lib/track";
import { svgToPng } from "./FunnelSvg";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word wrap by approximate character width. */
function wrap(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return lines;
}

export function mockupSvg(m: Mockup, format: "square" | "story", brand?: { logo?: string; name?: string }) {
  const W = 1080, H = format === "square" ? 1080 : 1920;
  const pad = 80;
  const story = format === "story";
  const font = "Inter, Arial, Helvetica, sans-serif";
  const text = (lines: string[], x: number, y: number, size: number, weight: number, color: string, lh = 1.15, anchor = "start") =>
    lines.map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(l)}</text>`).join("");
  const imageArea = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${m.fg}" fill-opacity="0.08"/>
     <path d="M${x + w / 2 - 70},${y + h / 2 + 40} l50,-60 l40,45 l30,-30 l60,45 z" fill="${m.fg}" fill-opacity="0.25"/>
     <circle cx="${x + w / 2 + 50}" cy="${y + h / 2 - 50}" r="22" fill="${m.fg}" fill-opacity="0.25"/>
     ${text(wrap(m.imagePrompt, 44, 3), x + w / 2, y + h - 90, 24, 400, m.fg, 1.3, "middle").replace(/<text /g, `<text fill-opacity="0.55" `)}`;
  const button = (y: number) => {
    const w = Math.min(560, 60 + m.cta.length * 30);
    return `<rect x="${pad}" y="${y}" width="${w}" height="104" rx="52" fill="${m.accent}"/>${text([m.cta], pad + w / 2, y + 66, 40, 700, contrast(m.accent), 1, "middle")}`;
  };
  const logo = brand?.logo ? `<image href="${esc(brand.logo)}" x="${W - pad - 220}" y="${pad - 10}" width="220" height="80" preserveAspectRatio="xMaxYMid meet"/>` : brand?.name ? text([brand.name], W - pad, pad + 40, 34, 700, m.fg, 1, "end") : "";
  let body = "";
  const top = story ? 260 : pad + 60;
  switch (m.layout) {
    case "bold-type":
      body = text(wrap(m.headline, story ? 14 : 16, 4), pad, top + 100, story ? 124 : 104, 800, m.fg, 1.08) + text(wrap(m.primary, 34, 3), pad, H - (story ? 520 : 330), 40, 400, m.fg, 1.35) + button(H - (story ? 340 : 200));
      break;
    case "split-image":
      body = imageArea(pad, top + 40, W - pad * 2, story ? 820 : 470) + text(wrap(m.headline, 22, 2), pad, (story ? 1240 : 700), 70, 800, m.fg) + text(wrap(m.primary, 40, 2), pad, (story ? 1430 : 840), 36, 400, m.fg, 1.35) + button(H - (story ? 300 : 170));
      break;
    case "testimonial":
      body = text(["“"], pad, top + 150, 220, 800, m.accent) + text(wrap((m.quote ?? m.primary).replace(/^[“"]|[”"]$/g, ""), story ? 24 : 28, 6), pad, top + 230, story ? 64 : 54, 600, m.fg, 1.3) + text(["★★★★★"], pad, H - (story ? 600 : 380), 52, 400, m.accent) + text(wrap(m.headline, 34, 2), pad, H - (story ? 520 : 300), 38, 700, m.fg) + button(H - (story ? 340 : 200));
      break;
    case "offer-badge":
      body =
        (m.badge ? `<circle cx="${W - pad - 150}" cy="${top + 220}" r="150" fill="${m.accent}"/>${text(wrap(m.badge, 8, 2), W - pad - 150, top + 220 + (m.badge.length > 8 ? -10 : 18), 64, 800, contrast(m.accent), 1.1, "middle")}` : "") +
        text(wrap(m.headline, story ? 14 : 15, 4), pad, top + (story ? 560 : 470), story ? 108 : 92, 800, m.fg, 1.08) +
        text(wrap(m.primary, 36, 2), pad, H - (story ? 520 : 290), 38, 400, m.fg, 1.35) +
        button(H - (story ? 340 : 190));
      break;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${m.bg}"/>${logo}${body}</svg>`;
}

function contrast(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111111" : "#ffffff";
}

export function MockupsSection({ node }: { node: StageNode }) {
  const [list, setList] = useState<Mockup[] | null>(null);
  const [format, setFormat] = useState<"square" | "story">("square");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const me = useStore((s) => s.me);
  const brand = me?.workspace.branding ?? undefined;

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      setList((await api.mockups(toGraph(useStore.getState()), node.id)).variants);
      track("asset_generated", { kind: "mockups" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const download = async (m: Mockup, i: number) => {
    const { data } = await svgToPng(mockupSvg(m, format, brand), 1080);
    const a = document.createElement("a");
    a.href = data;
    a.download = `${node.data.label.replace(/\W+/g, "-").toLowerCase()}-${m.layout}-${format}-${i + 1}.png`;
    a.click();
  };
  return (
    <section>
      <h4>
        <ImageIcon size={14} /> Ad mockups
      </h4>
      <p className="muted small">AI-designed static ads in your brand colors. Use them as drafts or briefs — swap in your own photo using the image prompt.</p>
      <div className="row">
        <button className="btn primary" onClick={generate} disabled={busy}>
          {busy ? <span className="spinner" /> : <Sparkles size={14} />} {list ? "Regenerate" : "Design 4 mockups"}
        </button>
        {list && (
          <div className="seg seg-sm">
            <button className={format === "square" ? "on" : ""} onClick={() => setFormat("square")}>
              Feed 1:1
            </button>
            <button className={format === "story" ? "on" : ""} onClick={() => setFormat("story")}>
              Story 9:16
            </button>
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {list && (
        <div className={`mockup-grid ${format}`}>
          {list.map((m, i) => (
            <figure key={i} className="mockup">
              {/* Rendered from a validated design spec with escaped text. */}
              <div className="mockup-art" dangerouslySetInnerHTML={{ __html: mockupSvg(m, format, brand) }} />
              <figcaption>
                <span className="pill muted-pill">{m.layout.replace("-", " ")}</span>
                <button className="icon-btn" title="Download PNG" onClick={() => download(m, i)}>
                  <Download size={14} />
                </button>
                <button className="icon-btn" title="Copy image prompt" onClick={() => navigator.clipboard.writeText(m.imagePrompt)}>
                  <Copy size={14} />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
