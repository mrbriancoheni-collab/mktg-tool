import { useContext, useRef, useState } from "react";
import { Check, Copy, Info, Link2, Megaphone, MessageSquare, Pencil, Plug, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { defaultUtm, formatFor, trackingUrl } from "../../shared/adpack";
import { AdPackDialog } from "./AdPackDialog";
import { IntegrationPanel } from "./Integrations";
import { MockupsSection } from "./Mockups";
import { nanoid } from "nanoid";
import { ASSET_LABELS, CATALOG_BY_TYPE, type AssetKind } from "../../shared/catalog";
import type { Actuals, StageData } from "../../shared/model";
import { api, type IntegrationInfo } from "../lib/api";
import { num, pct, usd } from "../lib/format";
import { ItemIcon } from "../lib/icons";
import { toGraph, useStore, type StageNode } from "../lib/store";
import { SimContext } from "../nodes/StageNode";
import { Markdown } from "./Markdown";
import { track } from "../lib/track";

function NumField({ label, value, onChange, suffix, prefix, help }: { label: string; value?: number; onChange: (v?: number) => void; suffix?: string; prefix?: string; help?: string }) {
  return (
    <label className="field">
      <span>
        {label} {help && <Tip text={help} />}
      </span>
      <div className="num-input">
        {prefix && <i>{prefix}</i>}
        <input
          type="number"
          value={value ?? ""}
          min={0}
          step="any"
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
        {suffix && <i>{suffix}</i>}
      </div>
    </label>
  );
}

/** Small ⓘ tooltip for plain-language explanations. */
export function Tip({ text }: { text: string }) {
  return (
    <span className="tip" tabIndex={0} aria-label={text} data-tip={text}>
      <Info size={12} />
    </span>
  );
}

const editedThisSession = new Set<string>();

type InspectorTab = "plan" | "creative" | "tracking" | "results" | "connection";
let lastTab: InspectorTab = "plan";

const HELP = {
  budget: "How much you plan to spend on this channel per month.",
  cpc: "Average cost each time someone clicks your ad. Your ad platform shows this as CPC.",
  visitors: "For unpaid traffic (SEO, email list, referrals): how many people you expect per month.",
  conversionRate: "Out of everyone who reaches this step, the percentage who move on to the next one.",
  price: "Money earned each time someone completes this step (e.g. order value or deal size). Leave empty if nothing is sold here.",
  split: "When a step leads to several places, how the people moving on are divided between them.",
};

export function Inspector({ node, integrations, onIntegrationsChange }: { node: StageNode; integrations: IntegrationInfo[]; onIntegrationsChange: () => void }) {
  const update = useStore((s) => s.updateNode);
  const checkpoint = useStore((s) => s.checkpoint);
  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);
  const updateEdge = useStore((s) => s.updateEdge);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const sim = useContext(SimContext);
  const d = node.data;
  const item = CATALOG_BY_TYPE[d.type];
  const set = (patch: Partial<StageData>) => {
    update(node.id, patch);
    if (!editedThisSession.has(node.id)) {
      editedThisSession.add(node.id);
      track("node_edited", { type: d.type });
    }
  };
  const setActual = (k: keyof Actuals, v?: number) => set({ actuals: { ...d.actuals, [k]: v } });
  const r = sim?.nodes[node.id];
  const outgoing = edges.filter((e) => e.source === node.id && nodes.find((n) => n.id === e.target)?.data.kind !== "integration");

  const tabs: [InspectorTab, string][] =
    d.kind === "integration"
      ? [["connection", "Connection"], ...(item?.assets?.length ? ([["creative", "Creative"]] as [InspectorTab, string][]) : [])]
      : [
          ["plan", "Plan"],
          ...(item?.assets?.length ? ([["creative", "Creative"]] as [InspectorTab, string][]) : []),
          ...(d.kind === "traffic" || d.kind === "page" ? ([["tracking", "Tracking"]] as [InspectorTab, string][]) : []),
          ["results", "Results"],
        ];
  const [tab, setTabState] = useState<InspectorTab>(tabs.some((t) => t[0] === lastTab) ? lastTab : tabs[0][0]);
  const setTab = (t: InspectorTab) => {
    lastTab = t;
    setTabState(t);
  };
  const active = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];

  return (
    <div className="inspector" key={node.id}>
      <div className="insp-head">
        <ItemIcon item={item} size={34} />
        <div className="grow">
          <input className="insp-name" value={d.label} onFocus={checkpoint} onChange={(e) => set({ label: e.target.value })} aria-label="Name" />
          <div className="muted small">
            {item?.label} · {item?.description}
          </div>
        </div>
        <button className="icon-btn danger" title="Delete (Del)" onClick={() => onNodesChange([{ type: "remove", id: node.id }])}>
          <Trash2 size={16} />
        </button>
      </div>
      <CommentsLink nodeId={node.id} />

      <div className="insp-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={active === id} className={active === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {active === "plan" && (
        <>
          <label className="field">
            <span>Notes</span>
            <textarea rows={3} value={d.notes ?? ""} onFocus={checkpoint} onChange={(e) => set({ notes: e.target.value })} placeholder="Who you're targeting, the message, the offer…" />
          </label>
          {d.kind === "traffic" && (
            <section>
              <h4>Your assumptions</h4>
              <div className="grid2">
                <NumField label="Monthly budget" help={HELP.budget} prefix="$" value={d.budget} onChange={(v) => set({ budget: v })} />
                <NumField label="Cost per click" help={HELP.cpc} prefix="$" value={d.cpc} onChange={(v) => set({ cpc: v })} />
                <NumField label="Or expected visitors" help={HELP.visitors} value={d.visitors} onChange={(v) => set({ visitors: v })} />
              </div>
            </section>
          )}
          {(d.kind === "page" || d.kind === "action") && (
            <section>
              <h4>Your assumptions</h4>
              <div className="grid2">
                <NumField label="% who continue" help={HELP.conversionRate} suffix="%" value={d.conversionRate} onChange={(v) => set({ conversionRate: v })} />
                <NumField label="Revenue per sale" help={HELP.price} prefix="$" value={d.price} onChange={(v) => set({ price: v })} />
              </div>
              {item?.benchmark && (
                <p className="muted small">
                  Typical for {item.label.toLowerCase()}: {item.benchmark[0]}–{item.benchmark[1]}%
                </p>
              )}
            </section>
          )}
          {outgoing.length > 1 && (
            <section>
              <h4>
                Traffic split <Tip text={HELP.split} />
              </h4>
              {outgoing.map((e) => {
                const total = outgoing.reduce((s, x) => s + (x.data?.weight ?? 1), 0);
                const w = e.data?.weight ?? 1;
                return (
                  <div className="split-row" key={e.id}>
                    <span>→ {nodes.find((n) => n.id === e.target)?.data.label}</span>
                    <input type="range" min={0} max={10} step={0.5} value={w} onChange={(ev) => updateEdge(e.id, { weight: Number(ev.target.value) })} aria-label="Share of traffic" />
                    <b>{Math.round((w / total) * 100)}%</b>
                  </div>
                );
              })}
            </section>
          )}
          {r && d.kind !== "integration" && d.kind !== "note" && (
            <section>
              <h4>Forecast for this step</h4>
              <div className="stat-grid">
                <div><span>People arriving</span><b>{num(r.inflow)}</b></div>
                <div><span>Moving on</span><b>{num(r.outflow)}</b></div>
                {r.spend > 0 && <div><span>Spend</span><b>{usd(r.spend)}</b></div>}
                {r.revenue > 0 && <div><span>Revenue</span><b>{usd(r.revenue)}</b></div>}
                {r.spend > 0 && r.outflow > 0 && <div><span>Cost per visitor</span><b>${(r.spend / r.outflow).toFixed(2)}</b></div>}
              </div>
            </section>
          )}
        </>
      )}

      {active === "creative" && (
        <>
          {d.kind === "traffic" && <AdPackLauncher node={node} />}
          {d.kind === "traffic" && <MockupsSection node={node} />}
          {!!item?.assets?.length && <AssetsSection node={node} kinds={item.assets} />}
        </>
      )}

      {active === "tracking" && <TrackingSection node={node} />}

      {active === "results" && (
        <ResultsSection node={node} forecast={r} setActual={setActual} />
      )}

      {active === "connection" && <IntegrationSection node={node} info={integrations.find((i) => i.type === d.type)} onChange={onIntegrationsChange} />}
    </div>
  );
}

function ResultsSection({ node, forecast, setActual }: { node: StageNode; forecast?: { inflow: number; outflow: number; spend: number; revenue: number }; setActual: (k: keyof Actuals, v?: number) => void }) {
  const d = node.data;
  const a = d.actuals ?? {};
  const rows: [string, number | undefined, number | undefined, "money" | "num" | "pct"][] = [];
  if (d.kind === "traffic") {
    rows.push(["Spend", forecast?.spend, a.spend, "money"], ["Clicks", forecast?.outflow, a.clicks, "num"]);
    if (a.spend && a.clicks) rows.push(["Cost per click", d.cpc, a.spend / a.clicks, "money"]);
  } else {
    rows.push(["Visitors", forecast?.inflow, a.clicks, "num"], ["Conversions", forecast?.outflow, a.conversions, "num"]);
    if (a.clicks && a.conversions != null) rows.push(["% who continue", d.conversionRate, (a.conversions / a.clicks) * 100, "pct"]);
  }
  if (forecast?.revenue || a.revenue) rows.push(["Revenue", forecast?.revenue, a.revenue, "money"]);
  const f = (v: number | undefined, k: string) => (v == null ? "—" : k === "money" ? (v < 100 ? `$${v.toFixed(2)}` : usd(v)) : k === "pct" ? pct(v) : num(v));
  return (
    <>
      <section>
        <h4>Plan vs actual (this month)</h4>
        <table className="pva">
          <thead>
            <tr>
              <th></th>
              <th>Plan</th>
              <th>Actual</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, plan, actual, kind]) => {
              const delta = plan && actual != null ? (actual - plan) / plan : null;
              const goodWhenLower = label === "Spend" || label === "Cost per click";
              const good = delta == null ? null : goodWhenLower ? delta <= 0.1 : delta >= -0.1;
              return (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{f(plan, kind)}</td>
                  <td>
                    <b>{f(actual, kind)}</b>
                  </td>
                  <td>{delta != null && <span className={`delta ${good ? "good" : "bad"}`}>{delta >= 0 ? "+" : ""}{Math.round(delta * 100)}%</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!Object.values(a).some((v) => v != null) && <p className="muted small">No results yet. Connect an ad account in Settings → Integrations, import a CSV, or type numbers below.</p>}
      </section>
      <section>
        <h4>Enter results manually</h4>
        <div className="grid2">
          {d.kind === "traffic" && <NumField label="Spend" prefix="$" value={a.spend} onChange={(v) => setActual("spend", v)} />}
          {d.kind === "traffic" && <NumField label="Impressions" value={a.impressions} onChange={(v) => setActual("impressions", v)} />}
          <NumField label={d.kind === "traffic" ? "Clicks" : "Visitors"} value={a.clicks} onChange={(v) => setActual("clicks", v)} />
          <NumField label="Conversions" value={a.conversions} onChange={(v) => setActual("conversions", v)} />
          <NumField label="Revenue" prefix="$" value={a.revenue} onChange={(v) => setActual("revenue", v)} />
        </div>
      </section>
    </>
  );
}

function AdPackLauncher({ node }: { node: StageNode }) {
  const [open, setOpen] = useState(false);
  const campaign = useStore((s) => s.name);
  const d = node.data;
  const format = formatFor(d.type);
  if (!format) return null;
  const defaults = defaultUtm(d.type);
  const link = trackingUrl(d.url ?? "", {
    source: d.utm?.source ?? defaults.source,
    medium: d.utm?.medium ?? defaults.medium,
    campaign: d.utm?.campaign ?? campaign.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, ""),
  });
  return (
    <section>
      <h4>
        <Megaphone size={14} /> Ready-to-upload ads
      </h4>
      <p className="muted small">Ad copy that fits this platform's character limits. Download for bulk upload, or publish as paused drafts.</p>
      <button className="btn primary full" onClick={() => setOpen(true)}>
        <Megaphone size={14} /> Create ad pack
      </button>
      {open && <AdPackDialog node={node} finalUrl={link || d.url || ""} onClose={() => setOpen(false)} />}
    </section>
  );
}

function CommentsLink({ nodeId }: { nodeId: string }) {
  const count = useStore((s) => s.comments.filter((c) => c.nodeId === nodeId && !c.resolved).length);
  const setSync = useStore((s) => s.setSync);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <button
      className="link small comments-link"
      onClick={() => {
        setSync({ commentFilter: nodeId });
        setPanel("comments");
      }}
    >
      <MessageSquare size={13} /> {count ? `${count} open comment${count > 1 ? "s" : ""}` : "Add a comment"}
    </button>
  );
}

function TrackingSection({ node }: { node: StageNode }) {
  const update = useStore((s) => s.updateNode);
  const campaign = useStore((s) => s.name);
  const [copied, setCopied] = useState(false);
  const d = node.data;
  const defaults = defaultUtm(d.type);
  const utm = {
    source: d.utm?.source ?? defaults.source,
    medium: d.utm?.medium ?? defaults.medium,
    campaign: d.utm?.campaign ?? campaign.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, ""),
  };
  const setUtm = (k: keyof typeof utm, v: string) => update(node.id, { utm: { ...utm, ...d.utm, [k]: v } });
  const link = d.kind === "traffic" ? trackingUrl(d.url ?? "", utm) : "";
  return (
    <section>
      <h4>
        <Link2 size={14} /> {d.kind === "traffic" ? "Destination & tracking" : "Page URL"}
      </h4>
      <label className="field">
        <span>{d.kind === "traffic" ? "Landing page URL" : "URL"}</span>
        <input placeholder="https://example.com/offer" value={d.url ?? ""} onChange={(e) => update(node.id, { url: e.target.value })} />
      </label>
      {d.kind === "traffic" && (
        <>
          <div className="grid3">
            <label className="field">
              <span>Source <Tip text="utm_source — where the click came from, e.g. facebook, google" /></span>
              <input value={utm.source} onChange={(e) => setUtm("source", e.target.value)} />
            </label>
            <label className="field">
              <span>Medium <Tip text="utm_medium — the type of traffic, e.g. paid_social, cpc, email" /></span>
              <input value={utm.medium} onChange={(e) => setUtm("medium", e.target.value)} />
            </label>
            <label className="field">
              <span>Campaign <Tip text="utm_campaign — the campaign name used in your analytics" /></span>
              <input value={utm.campaign} onChange={(e) => setUtm("campaign", e.target.value)} />
            </label>
          </div>
          {link && (
            <div className="tracking-url">
              <code>{link}</code>
              <button
                className="icon-btn"
                title="Copy tracking URL"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
          <p className="muted small">Use this link in your ads so analytics and revenue imports can credit sales to this channel.</p>
          <CampaignLinker node={node} />
        </>
      )}
    </section>
  );
}

const CAMPAIGN_SOURCE: Record<string, "google_ads_mgr" | "meta_ads_mgr"> = {
  google_search: "google_ads_mgr", google_pmax: "google_ads_mgr", google_shopping: "google_ads_mgr", google_display: "google_ads_mgr", youtube_ads: "google_ads_mgr",
  meta_ads: "meta_ads_mgr", instagram_ads: "meta_ads_mgr", retargeting: "meta_ads_mgr",
};

/** Links a traffic node to live platform campaigns so "Sync data" can pull its actuals. */
function CampaignLinker({ node }: { node: StageNode }) {
  const update = useStore((s) => s.updateNode);
  const source = CAMPAIGN_SOURCE[node.data.type];
  const [list, setList] = useState<{ id: string; name: string; status: string }[] | null>(null);
  const [error, setError] = useState("");
  if (!source) return null;
  const linked = (node.data.platformCampaigns as Record<string, string[]> | undefined)?.[source] ?? [];
  const toggle = (id: string) => {
    const next = linked.includes(id) ? linked.filter((x) => x !== id) : [...linked, id];
    update(node.id, { platformCampaigns: { ...(node.data.platformCampaigns as object), [source]: next } });
  };
  return (
    <div className="campaign-linker">
      <span className="field-label">Linked {source === "google_ads_mgr" ? "Google Ads" : "Meta"} campaigns</span>
      {list ? (
        <div className="campaign-list">
          {list.map((c) => (
            <label key={c.id} className="check small">
              <input type="checkbox" checked={linked.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name} <span className="muted">{c.status.toLowerCase()}</span>
            </label>
          ))}
          {!list.length && <span className="muted small">No campaigns in this account.</span>}
        </div>
      ) : (
        <button
          className="btn full"
          onClick={() =>
            api
              .campaigns(source)
              .then(setList)
              .catch((e) => setError((e as Error).message))
          }
        >
          {linked.length ? `${linked.length} linked — edit` : "Link campaigns for live data"}
        </button>
      )}
      {error && <p className="small muted">{error.includes("Connect") ? `Connect ${source === "google_ads_mgr" ? "Google Ads" : "Meta Ads Manager"} in Settings → Integrations first.` : error}</p>}
    </div>
  );
}

function IntegrationSection({ info, onChange }: { node: StageNode; info?: IntegrationInfo; onChange: () => void }) {
  if (!info) return null;
  return (
    <section>
      <h4>
        <Plug size={14} /> Connection
      </h4>
      <IntegrationPanel info={info} onChange={onChange} />
    </section>
  );
}

function AssetsSection({ node, kinds }: { node: StageNode; kinds: AssetKind[] }) {
  const [kind, setKind] = useState<AssetKind>(kinds[0]);
  const [instructions, setInstructions] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const addAsset = useStore((s) => s.addAsset);
  const updateAsset = useStore((s) => s.updateAsset);
  const removeAsset = useStore((s) => s.removeAsset);

  const generate = async () => {
    setError("");
    setStreaming("");
    abort.current = new AbortController();
    try {
      const full = await api.asset(toGraph(useStore.getState()), node.id, kind, instructions, setStreaming, abort.current.signal);
      addAsset(node.id, { id: nanoid(8), kind, content: full, createdAt: Date.now() });
      track("asset_generated", { kind });
      setInstructions("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setStreaming(null);
    }
  };

  return (
    <section>
      <h4>
        <Sparkles size={14} /> AI assets
      </h4>
      <div className="chips">
        {kinds.map((k) => (
          <button key={k} className={`chip ${k === kind ? "active" : ""}`} onClick={() => setKind(k)}>
            {ASSET_LABELS[k]}
          </button>
        ))}
      </div>
      <input
        className="field-input"
        placeholder="Optional direction, e.g. 'playful tone, mention free shipping'"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && streaming === null && generate()}
      />
      {streaming === null ? (
        <button className="btn primary full" onClick={generate}>
          <Sparkles size={14} /> Generate {ASSET_LABELS[kind].toLowerCase()}
        </button>
      ) : (
        <button className="btn full" onClick={() => abort.current?.abort()}>
          <Square size={14} /> Stop
        </button>
      )}
      {error && <div className="error">{error}</div>}
      <p className="ai-note">AI-generated content can be inaccurate. Review claims, offers and ad-policy compliance before publishing.</p>
      {streaming !== null && (
        <div className="asset streaming">
          <div className="asset-head">
            <b>{ASSET_LABELS[kind]}</b>
            <span className="spinner" />
          </div>
          <Markdown text={streaming || "…"} />
        </div>
      )}
      {(node.data.assets ?? []).map((a) => (
        <div className="asset" key={a.id}>
          <div className="asset-head">
            <b>{ASSET_LABELS[a.kind]}</b>
            <span className="muted small">{new Date(a.createdAt).toLocaleDateString()}</span>
            <button
              className="icon-btn"
              title="Copy"
              onClick={() => {
                navigator.clipboard.writeText(a.content);
                setCopied(a.id);
                setTimeout(() => setCopied(null), 1200);
              }}
            >
              {copied === a.id ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <button className="icon-btn" title={editing === a.id ? "Done" : "Edit"} onClick={() => setEditing(editing === a.id ? null : a.id)}>
              {editing === a.id ? <X size={14} /> : <Pencil size={14} />}
            </button>
            <button className="icon-btn danger" title="Delete" onClick={() => removeAsset(node.id, a.id)}>
              <Trash2 size={14} />
            </button>
          </div>
          {editing === a.id ? (
            <textarea className="asset-edit" rows={14} value={a.content} onChange={(e) => updateAsset(node.id, a.id, e.target.value)} />
          ) : (
            <Markdown text={a.content} />
          )}
        </div>
      ))}
    </section>
  );
}
