import { useContext, useRef, useState } from "react";
import { Check, Copy, Link2, Megaphone, MessageSquare, Pencil, Plug, Send, Sparkles, Square, Trash2, X } from "lucide-react";
import { defaultUtm, formatFor, trackingUrl } from "../../shared/adpack";
import { AdPackDialog } from "./AdPackDialog";
import { nanoid } from "nanoid";
import { ASSET_LABELS, CATALOG_BY_TYPE, type AssetKind } from "../../shared/catalog";
import type { Actuals, StageData } from "../../shared/model";
import { api, type IntegrationInfo } from "../lib/api";
import { num, pct, usd } from "../lib/format";
import { ItemIcon } from "../lib/icons";
import { toGraph, useStore, type StageNode } from "../lib/store";
import { SimContext } from "../nodes/StageNode";
import { Markdown } from "./Markdown";

function NumField({ label, value, onChange, suffix, prefix }: { label: string; value?: number; onChange: (v?: number) => void; suffix?: string; prefix?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
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
  const set = (patch: Partial<StageData>) => update(node.id, patch);
  const setActual = (k: keyof Actuals, v?: number) => set({ actuals: { ...d.actuals, [k]: v } });
  const r = sim?.nodes[node.id];

  const outgoing = edges.filter((e) => e.source === node.id && nodes.find((n) => n.id === e.target)?.data.kind !== "integration");

  return (
    <div className="inspector" key={node.id}>
      <div className="insp-head">
        <ItemIcon item={item} size={34} />
        <div>
          <div className="insp-type">{item?.label}</div>
          <div className="muted small">{item?.description}</div>
        </div>
        <button className="icon-btn danger" title="Delete node" onClick={() => onNodesChange([{ type: "remove", id: node.id }])}>
          <Trash2 size={16} />
        </button>
      </div>

      <label className="field">
        <span>Name</span>
        <input value={d.label} onFocus={checkpoint} onChange={(e) => set({ label: e.target.value })} />
      </label>
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={d.notes ?? ""} onFocus={checkpoint} onChange={(e) => set({ notes: e.target.value })} placeholder="Targeting, message, offer…" />
      </label>

      {d.kind === "traffic" && (
        <section>
          <h4>Plan</h4>
          <div className="grid2">
            <NumField label="Monthly budget" prefix="$" value={d.budget} onChange={(v) => set({ budget: v })} />
            <NumField label="Cost per click" prefix="$" value={d.cpc} onChange={(v) => set({ cpc: v })} />
            <NumField label="Or fixed visitors" value={d.visitors} onChange={(v) => set({ visitors: v })} />
          </div>
        </section>
      )}
      {(d.kind === "page" || d.kind === "action") && (
        <section>
          <h4>Plan</h4>
          <div className="grid2">
            <NumField label="Conversion rate" suffix="%" value={d.conversionRate} onChange={(v) => set({ conversionRate: v })} />
            <NumField label="Revenue / conversion" prefix="$" value={d.price} onChange={(v) => set({ price: v })} />
          </div>
        </section>
      )}

      {outgoing.length > 1 && (
        <section>
          <h4>Traffic split</h4>
          {outgoing.map((e) => {
            const total = outgoing.reduce((s, x) => s + (x.data?.weight ?? 1), 0);
            const w = e.data?.weight ?? 1;
            return (
              <div className="split-row" key={e.id}>
                <span>→ {nodes.find((n) => n.id === e.target)?.data.label}</span>
                <input type="range" min={0} max={10} step={0.5} value={w} onChange={(ev) => updateEdge(e.id, { weight: Number(ev.target.value) })} />
                <b>{Math.round((w / total) * 100)}%</b>
              </div>
            );
          })}
        </section>
      )}

      {(d.kind === "traffic" || d.kind === "page") && <TrackingSection node={node} />}

      <CommentsLink nodeId={node.id} />

      {r && d.kind !== "integration" && d.kind !== "note" && (
        <section>
          <h4>Forecast</h4>
          <div className="stat-grid">
            <div><span>Arrive</span><b>{num(r.inflow)}</b></div>
            <div><span>Continue</span><b>{num(r.outflow)}</b></div>
            {r.spend > 0 && <div><span>Spend</span><b>{usd(r.spend)}</b></div>}
            {r.revenue > 0 && <div><span>Revenue</span><b>{usd(r.revenue)}</b></div>}
            {r.spend > 0 && r.outflow > 0 && <div><span>Cost / visitor</span><b>${(r.spend / r.outflow).toFixed(2)}</b></div>}
          </div>
        </section>
      )}

      {d.kind !== "integration" && d.kind !== "note" && (
        <section>
          <h4>Actuals <span className="muted small">— enter, import CSV, or sync</span></h4>
          <div className="grid2">
            {d.kind === "traffic" && <NumField label="Spend" prefix="$" value={d.actuals?.spend} onChange={(v) => setActual("spend", v)} />}
            {d.kind === "traffic" && <NumField label="Impressions" value={d.actuals?.impressions} onChange={(v) => setActual("impressions", v)} />}
            <NumField label={d.kind === "traffic" ? "Clicks" : "Visitors"} value={d.actuals?.clicks} onChange={(v) => setActual("clicks", v)} />
            <NumField label="Conversions" value={d.actuals?.conversions} onChange={(v) => setActual("conversions", v)} />
            <NumField label="Revenue" prefix="$" value={d.actuals?.revenue} onChange={(v) => setActual("revenue", v)} />
          </div>
          {d.actuals?.clicks ? (
            <p className="muted small">
              Actual conversion {pct(((d.actuals.conversions ?? 0) / d.actuals.clicks) * 100)}
              {d.actuals.spend ? ` · CPC $${(d.actuals.spend / d.actuals.clicks).toFixed(2)}` : ""}
              {d.actuals.impressions ? ` · CTR ${pct((d.actuals.clicks / d.actuals.impressions) * 100, 2)}` : ""}
            </p>
          ) : null}
        </section>
      )}

      {d.kind === "integration" && (
        <IntegrationSection node={node} info={integrations.find((i) => i.type === d.type)} onChange={onIntegrationsChange} />
      )}

      {!!item?.assets?.length && <AssetsSection node={node} kinds={item.assets} />}
    </div>
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
  const [adPack, setAdPack] = useState(false);
  const d = node.data;
  const defaults = defaultUtm(d.type);
  const utm = {
    source: d.utm?.source ?? defaults.source,
    medium: d.utm?.medium ?? defaults.medium,
    campaign: d.utm?.campaign ?? campaign.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, ""),
  };
  const setUtm = (k: keyof typeof utm, v: string) => update(node.id, { utm: { ...utm, ...d.utm, [k]: v } });
  const link = d.kind === "traffic" ? trackingUrl(d.url ?? "", utm) : "";
  const format = d.kind === "traffic" ? formatFor(d.type) : null;

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
              <span>utm_source</span>
              <input value={utm.source} onChange={(e) => setUtm("source", e.target.value)} />
            </label>
            <label className="field">
              <span>utm_medium</span>
              <input value={utm.medium} onChange={(e) => setUtm("medium", e.target.value)} />
            </label>
            <label className="field">
              <span>utm_campaign</span>
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
          <p className="muted small">UTMs also match revenue imports (CSV with utm_source / utm_campaign + revenue) back to this source.</p>
          <CampaignLinker node={node} />
          {format && (
            <button className="btn full" onClick={() => setAdPack(true)}>
              <Megaphone size={14} /> Create ad pack for upload
            </button>
          )}
          {adPack && <AdPackDialog node={node} finalUrl={link || d.url || ""} onClose={() => setAdPack(false)} />}
        </>
      )}
    </section>
  );
}

function AccountPicker({ info, onChange }: { info: IntegrationInfo; onChange: () => void }) {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  const [login, setLogin] = useState("");
  const load = () =>
    api
      .accounts(info.type)
      .then(setAccounts)
      .catch((e) => setError((e as Error).message));
  return (
    <div className="account-picker">
      <label className="field">
        <span>{info.type === "ga4" ? "GA4 property" : "Ad account"}</span>
        {accounts ? (
          <select
            value={info.account ?? ""}
            onChange={async (e) => {
              await api.setAccount(info.type, e.target.value, login || undefined);
              onChange();
            }}
          >
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.id})
              </option>
            ))}
          </select>
        ) : (
          <button className="btn" onClick={load}>
            {info.account ? `Using ${info.account} — change` : "Load accounts"}
          </button>
        )}
      </label>
      {info.type === "google_ads_mgr" && accounts && (
        <label className="field">
          <span>Manager (MCC) ID, if accessing through one</span>
          <input placeholder="Optional, e.g. 123-456-7890" value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
      )}
      {info.needsAccount && !accounts && <p className="note small">Connected — choose which account to use.</p>}
      {error && <div className="error">{error}</div>}
    </div>
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
      {error && <p className="small muted">{error.includes("Connect") ? `Add and connect ${source === "google_ads_mgr" ? "Google Ads" : "Meta Ads Manager"} on the canvas first.` : error}</p>}
    </div>
  );
}

function IntegrationSection({ node, info, onChange }: { node: StageNode; info?: IntegrationInfo; onChange: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const name = useStore((s) => s.name);
  if (!info) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h4>
        <Plug size={14} /> Connection
      </h4>
      {!info.live && (
        <p className="note small">
          Preview connector: credentials are stored encrypted{info.canSync ? ", and “Sync data” returns sample metrics" : ""}. A live API integration for this tool isn't built yet.
        </p>
      )}
      {info.oauth && !info.connected && (
        <>
          {info.oauthConfigured ? (
            <a className="btn primary full" href={api.oauthStartUrl(info.type)}>
              <Plug size={14} /> Connect with {info.oauth === "google" ? "Google" : "Meta"}
            </a>
          ) : (
            <p className="note small">
              {info.oauth === "google" ? "Google" : "Meta"} sign-in isn't configured on this server yet. An admin needs to add the {info.oauth === "google" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "META_APP_ID / META_APP_SECRET"} settings — see the README.
            </p>
          )}
          {msg && <p className="small muted">{msg}</p>}
        </>
      )}
      {info.oauth && info.connected && <AccountPicker info={info} onChange={onChange} />}
      {info.connected ? (
        <>
          <p className="ok small">
            <Check size={14} /> Connected{info.account ? ` · ${info.account}` : ""}
          </p>
          <div className="row">
            {info.canNotify && (
              <button className="btn" disabled={busy} onClick={() => run(() => api.notify(info.type, `AdCanvas test from “${name}” ✅`), "Test message sent.")}>
                <Send size={14} /> Send test
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => run(() => api.disconnect(info.type), "Disconnected.")}>
              Disconnect
            </button>
          </div>
        </>
      ) : info.oauth ? null : (
        <>
          {info.fields.map((f) => (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                placeholder={f.placeholder}
                value={creds[f.key] ?? ""}
                onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                autoComplete="off"
              />
            </label>
          ))}
          <button className="btn primary" disabled={busy} onClick={() => run(() => api.connect(info.type, creds), "Connected.")}>
            <Plug size={14} /> Connect {CATALOG_BY_TYPE[node.data.type]?.label}
          </button>
        </>
      )}
      {msg && <p className="small muted">{msg}</p>}
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
