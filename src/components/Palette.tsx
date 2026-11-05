import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { CATALOG, type NodeKind } from "../../shared/catalog";
import { ItemIcon } from "../lib/icons";

const KINDS: { kind: NodeKind; title: string }[] = [
  { kind: "traffic", title: "Traffic & channels" },
  { kind: "page", title: "Pages" },
  { kind: "action", title: "Actions & flow" },
  { kind: "integration", title: "Integrations & tools" },
  { kind: "note", title: "Whiteboard" },
];

type Seg = "all" | "b2b" | "b2c";

function loadSeg(): Seg {
  try {
    return (localStorage.getItem("adcanvas-seg") as Seg) || "all";
  } catch {
    return "all";
  }
}

export function Palette({ onAdd }: { onAdd: (type: string) => void }) {
  const [q, setQ] = useState("");
  const [seg, setSegState] = useState<Seg>(loadSeg);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const query = q.trim().toLowerCase();

  const setSeg = (s: Seg) => {
    setSegState(s);
    try {
      localStorage.setItem("adcanvas-seg", s);
    } catch {
      /* ignore */
    }
  };

  const visible = CATALOG.filter(
    (c) =>
      (seg === "all" || c.segment === "both" || c.segment === seg) &&
      (!query || `${c.label} ${c.description} ${c.group}`.toLowerCase().includes(query)),
  );

  return (
    <aside className="palette">
      <input className="search" placeholder={`Search ${visible.length} elements…`} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg seg-sm" role="radiogroup" aria-label="Business type">
        {(["all", "b2b", "b2c"] as Seg[]).map((s) => (
          <button key={s} className={seg === s ? "on" : ""} onClick={() => setSeg(s)} role="radio" aria-checked={seg === s}>
            {s === "all" ? "All" : s.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="palette-scroll">
        {KINDS.map(({ kind, title }) => {
          const items = visible.filter((c) => c.kind === kind);
          if (!items.length) return null;
          const groups = [...new Set(items.map((i) => i.group))];
          return (
            <section key={kind}>
              <h3>{title}</h3>
              {groups.map((g) => {
                const open = query ? true : !closed[g];
                return (
                  <div key={g} className="palette-group">
                    {kind !== "note" && (
                      <button className={`group-toggle ${open ? "open" : ""}`} onClick={() => setClosed({ ...closed, [g]: open })}>
                        <ChevronRight size={12} /> {g} <span>{items.filter((i) => i.group === g).length}</span>
                      </button>
                    )}
                    {open && (
                      <div className="palette-grid">
                        {items
                          .filter((i) => i.group === g)
                          .map((c) => (
                            <button
                              key={c.type}
                              className="palette-item"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("application/adcanvas", c.type);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onClick={() => onAdd(c.type)}
                              title={`${c.description} — drag onto the canvas or click to add`}
                            >
                              <ItemIcon item={c} size={24} />
                              <span className="palette-label">{c.label}</span>
                              {c.segment !== "both" && <span className={`seg-tag ${c.segment}`}>{c.segment.toUpperCase()}</span>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        {!visible.length && <p className="muted small">No elements match “{q}”.</p>}
      </div>
      <footer className="palette-foot">
        <a href="/legal/privacy" target="_blank">Privacy</a>
        <a href="/legal/terms" target="_blank">Terms</a>
        <a href="/legal/acceptable-use" target="_blank">Acceptable use</a>
      </footer>
    </aside>
  );
}
