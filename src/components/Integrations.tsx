// Integrations: connection panel (shared by the inspector and the hub),
// the Settings → Integrations hub, and campaign auto-matching.
import { useEffect, useState } from "react";
import { Check, Plug, Send, Sparkles, Wand2 } from "lucide-react";
import { CATALOG, CATALOG_BY_TYPE } from "../../shared/catalog";
import { roleAtLeast } from "../../shared/plans";
import { api, type IntegrationInfo, type Me } from "../lib/api";
import { ItemIcon } from "../lib/icons";
import { useStore } from "../lib/store";
import { track } from "../lib/track";

export function AccountPicker({ info, onChange }: { info: IntegrationInfo; onChange: () => void }) {
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

export function IntegrationPanel({ info, onChange }: { info: IntegrationInfo; onChange: () => void }) {
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const name = useStore((s) => s.name);

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
    <div className="integration-panel">
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
              {info.oauth === "google" ? "Google" : "Meta"} sign-in isn't configured on this server yet. An admin needs to add the {info.oauth === "google" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "META_APP_ID / META_APP_SECRET"} settings — see docs/SETUP.md.
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
            <Plug size={14} /> Connect {CATALOG_BY_TYPE[info.type]?.label}
          </button>
        </>
      )}
      {msg && <p className="small muted">{msg}</p>}
    </div>
  );
}


const GROUP_ORDER = ["Ad platforms", "Analytics & attribution", "CRM & sales tools", "Email & SMS", "Commerce & payments", "Automation & data", "Support & reviews", "Sites & forms"];

/** Settings → Integrations: connect and manage every tool in one place. */
export function IntegrationsHub({ me }: { me: Me }) {
  const [list, setList] = useState<IntegrationInfo[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "connected" | "live">("all");
  const admin = roleAtLeast(me.role, "admin");
  const load = () => api.integrations().then(setList);
  useEffect(() => {
    load();
  }, []);
  if (!list) return <span className="spinner" />;
  const byType = new Map(list.map((i) => [i.type, i]));
  const items = CATALOG.filter((c) => c.kind === "integration" && byType.has(c.type)).filter((c) => {
    const i = byType.get(c.type)!;
    return filter === "all" || (filter === "connected" ? i.connected : i.live);
  });
  return (
    <div className="hub">
      <div className="row">
        <p className="muted small grow">
          Connect ad accounts to pull real results onto your boards, and tools like Slack to receive reports. {admin ? "" : "Only admins can connect or disconnect tools."}
        </p>
        <div className="seg seg-sm">
          {(["all", "connected", "live"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "connected" ? `Connected (${list.filter((i) => i.connected).length})` : "Live data"}
            </button>
          ))}
        </div>
      </div>
      {GROUP_ORDER.map((g) => {
        const group = items.filter((c) => c.group === g);
        if (!group.length) return null;
        return (
          <section key={g}>
            <h4>{g}</h4>
            <div className="hub-grid">
              {group.map((c) => {
                const info = byType.get(c.type)!;
                return (
                  <div key={c.type} className={`hub-card ${info.connected ? "connected" : ""} ${open === c.type ? "expanded" : ""}`}>
                    <button className="hub-card-head" onClick={() => setOpen(open === c.type ? null : c.type)} aria-expanded={open === c.type}>
                      <ItemIcon item={c} size={30} />
                      <div className="grow">
                        <b>{c.label}</b>
                        <div className="muted small">{info.connected ? (info.needsAccount ? "Choose an account" : `Connected${info.account ? ` · ${info.account}` : ""}`) : c.description}</div>
                      </div>
                      {info.connected ? <span className="pill ok-pill">Connected</span> : info.live ? <span className="pill">Live</span> : <span className="pill muted-pill">Preview</span>}
                    </button>
                    {open === c.type && admin && (
                      <div className="hub-card-body">
                        <IntegrationPanel info={info} onChange={load} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Reviews auto-matched campaigns and links them to canvas steps. */
export function AutoMatchDialog({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const boardId = useStore((s) => s.boardId)!;
  const nodes = useStore((s) => s.nodes);
  const update = useStore((s) => s.updateNode);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.automatch>> | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .automatch(boardId)
      .then((d) => {
        setData(d);
        const p: Record<string, boolean> = {};
        for (const c of d) for (const s of c.suggestions) for (const k of s.campaigns) p[`${s.nodeId}|${c.connector}|${k.id}`] = k.score >= 0.25 || s.campaigns.length === 1;
        setPicked(p);
      })
      .catch((e) => setError((e as Error).message));
  }, [boardId]);

  const apply = () => {
    useStore.getState().checkpoint();
    let n = 0;
    for (const c of data ?? [])
      for (const s of c.suggestions) {
        const ids = s.campaigns.filter((k) => picked[`${s.nodeId}|${c.connector}|${k.id}`]).map((k) => k.id);
        if (!ids.length) continue;
        const node = nodes.find((x) => x.id === s.nodeId);
        if (!node) continue;
        update(s.nodeId, { platformCampaigns: { ...(node.data.platformCampaigns as object), [c.connector]: ids } });
        n += ids.length;
      }
    track("campaigns_matched", { count: n });
    onDone(`Linked ${n} campaign${n === 1 ? "" : "s"}. Click Sync data to pull results.`);
    onClose();
  };

  const total = data?.reduce((s, c) => s + c.suggestions.length, 0) ?? 0;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Match campaigns">
        <header>
          <h2>
            <Wand2 size={18} /> Match live campaigns to your board
          </h2>
        </header>
        {!data && !error && <span className="spinner" />}
        {error && <div className="error">{error}</div>}
        {data && !data.length && <p className="muted">Connect Google Ads or Meta Ads Manager (Settings → Integrations) and choose an account first.</p>}
        {data?.map((c) => (
          <section key={c.connector}>
            <h4>{CATALOG_BY_TYPE[c.connector]?.label}</h4>
            {c.error && <div className="error">{c.error}</div>}
            {!c.error && !c.suggestions.length && <p className="muted small">No campaigns matched steps on this board.</p>}
            {c.suggestions.map((s) => (
              <div key={s.nodeId} className="match-row">
                <b>{nodes.find((n) => n.id === s.nodeId)?.data.label}</b>
                {s.campaigns.map((k) => {
                  const key = `${s.nodeId}|${c.connector}|${k.id}`;
                  return (
                    <label key={k.id} className="check small">
                      <input type="checkbox" checked={!!picked[key]} onChange={(e) => setPicked({ ...picked, [key]: e.target.checked })} /> {k.name}
                      <span className={`pill ${k.score >= 0.5 ? "ok-pill" : "muted-pill"}`}>{k.score >= 0.5 ? "strong match" : "possible"}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
        <footer className="row">
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!total} onClick={apply}>
            <Sparkles size={14} /> Link selected campaigns
          </button>
        </footer>
      </div>
    </div>
  );
}
