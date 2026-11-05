import { useState } from "react";
import { Download, Megaphone, Sparkles, X } from "lucide-react";
import { AD_SPECS, exportCSV, overLimit, type AdPack } from "../../shared/adpack";
import { api } from "../lib/api";
import { download } from "../lib/format";
import { toGraph, useStore, type StageNode } from "../lib/store";

type Field = "headlines" | "descriptions" | "primaryTexts";
const LIMIT_KEY: Record<Field, "headline" | "description" | "primary"> = { headlines: "headline", descriptions: "description", primaryTexts: "primary" };

export function AdPackDialog({ node, finalUrl, onClose }: { node: StageNode; finalUrl: string; onClose: () => void }) {
  const [pack, setPack] = useState<AdPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [direction, setDirection] = useState("");

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      setPack(await api.adPack(toGraph(useStore.getState()), node.id, finalUrl, direction));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (gi: number, field: Field | "keywords", i: number, v: string) => {
    if (!pack) return;
    const next = structuredClone(pack);
    next.adGroups[gi][field][i] = v;
    setPack(next);
  };

  const spec = pack ? AD_SPECS[pack.format] : null;
  const overs = pack
    ? pack.adGroups.reduce((n, g) => n + (["headlines", "descriptions", "primaryTexts"] as Field[]).reduce((m, f) => m + g[f].filter((t) => overLimit(pack.format, LIMIT_KEY[f], t)).length, 0), 0)
    : 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Ad export pack">
        <header>
          <h2>
            <Megaphone size={18} /> Ad pack — {node.data.label}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <p className="muted">
          Platform-ready ad copy within character limits, exported in a bulk-import format. Review it in the platform's editor (e.g. Google Ads Editor, Meta Ads
          Manager) before publishing — check claims, policy compliance and brand guidelines.
        </p>
        {!finalUrl && <p className="note small">Tip: set a landing URL on this node first so the export includes tracked destination links.</p>}
        <div className="row">
          <input className="field-input" placeholder="Optional direction, e.g. 'focus on free shipping, avoid discounts'" value={direction} onChange={(e) => setDirection(e.target.value)} />
          <button className="btn primary" onClick={generate} disabled={busy}>
            {busy ? <span className="spinner" /> : <Sparkles size={15} />} {pack ? "Regenerate" : "Generate"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}

        {pack && spec && (
          <>
            <p className="small muted" style={{ marginTop: 12 }}>
              {spec.label}: headlines ≤ {spec.headline.max}
              {spec.description.max ? `, descriptions ≤ ${spec.description.max}` : ""}
              {spec.primary.max ? `, primary text ≤ ${spec.primary.max}` : ""} characters.{" "}
              {overs > 0 ? <b className="bad">{overs} over limit — edit the red fields.</b> : <b className="good">All within limits.</b>}
            </p>
            {pack.adGroups.map((g, gi) => (
              <div key={gi} className="adgroup">
                <h3>
                  {g.name} {g.cta && <span className="chip">{g.cta}</span>}
                </h3>
                {(["primaryTexts", "headlines", "descriptions", "keywords"] as const).map((f) =>
                  g[f].length ? (
                    <div key={f} className="adfield">
                      <span className="adfield-label">{f === "primaryTexts" ? "Primary text" : f === "keywords" ? "Keywords" : f[0].toUpperCase() + f.slice(1, -1)}</span>
                      <div className="adfield-items">
                        {g[f].map((t, i) => {
                          const over = f !== "keywords" && overLimit(pack.format, LIMIT_KEY[f], t);
                          const max = f !== "keywords" ? spec[LIMIT_KEY[f]].max : 0;
                          return (
                            <div key={i} className={`adtext ${over ? "over" : ""}`}>
                              <input value={t} onChange={(e) => edit(gi, f, i, e.target.value)} />
                              {max > 0 && (
                                <span className="count">
                                  {t.length}/{max}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            ))}
            <footer>
              <button
                className="btn primary"
                onClick={() => {
                  const f = exportCSV(pack);
                  download(f.filename, f.text, "text/csv");
                }}
              >
                <Download size={15} /> Download {spec.exportLabel}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
