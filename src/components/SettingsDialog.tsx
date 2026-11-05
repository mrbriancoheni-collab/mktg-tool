import { useEffect, useState } from "react";
import { Check, Copy, CreditCard, History, Plug, Settings, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { IntegrationsHub } from "./Integrations";
import { PLANS, PUBLIC_PLANS, roleAtLeast, type Role } from "../../shared/plans";
import { api, type Branding, type Member, type Me } from "../lib/api";
import { confirmDialog } from "./Confirm";
import { track } from "../lib/track";

export type SettingsTab = "account" | "members" | "integrations" | "billing" | "workspace" | "audit";
type Tab = SettingsTab;

export function SettingsDialog({ me, initialTab = "account", onClose, onChanged }: { me: Me; initialTab?: Tab; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const admin = roleAtLeast(me.role, "admin");
  const owner = me.role === "owner";
  const tabs: [Tab, string, React.ReactNode, boolean][] = [
    ["account", "Account", <Settings size={14} />, true],
    ["members", "Members", <Users size={14} />, true],
    ["integrations", "Integrations", <Plug size={14} />, true],
    ["billing", "Plan & usage", <CreditCard size={14} />, true],
    ["workspace", "Workspace", <Settings size={14} />, admin],
    ["audit", "Audit log", <History size={14} />, admin],
  ];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide settings" role="dialog" aria-label="Settings">
        <header>
          <h2>Settings — {me.workspace.name}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {tabs
              .filter((t) => t[3])
              .map(([id, label, icon]) => (
                <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                  {icon} {label}
                </button>
              ))}
          </nav>
          <div className="settings-panel">
            {tab === "account" && <AccountTab me={me} onChanged={onChanged} />}
            {tab === "members" && <MembersTab me={me} admin={admin} owner={owner} onChanged={onChanged} />}
            {tab === "integrations" && <IntegrationsHub me={me} />}
            {tab === "billing" && <BillingTab me={me} owner={owner} />}
            {tab === "workspace" && <WorkspaceTab me={me} owner={owner} onChanged={onChanged} />}
            {tab === "audit" && <AuditTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function useMsg() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  const view = msg && <p className={msg.ok ? "ok small" : "error"}>{msg.text}</p>;
  return { run, view };
}

function SecuritySection({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [disablePw, setDisablePw] = useState("");
  const { run, view } = useMsg();
  const on = !!me.user.mfaEnabled;
  return (
    <section>
      <h4>
        <ShieldCheck size={14} /> Two-step verification {on ? <span className="pill ok-pill">On</span> : <span className="pill muted-pill">Off</span>}
      </h4>
      {codes ? (
        <div className="note small">
          <b>Save your recovery codes.</b> Each works once if you lose your phone. They won't be shown again.
          <pre className="codes">{codes.join("\n")}</pre>
          <div className="row">
            <button className="btn" onClick={() => navigator.clipboard.writeText(codes.join("\n"))}>
              <Copy size={14} /> Copy
            </button>
            <button className="btn primary" onClick={() => (setCodes(null), onChanged())}>
              I've saved them
            </button>
          </div>
        </div>
      ) : on ? (
        <>
          <p className="muted small">You'll enter a code from your authenticator app each time you sign in with a password.</p>
          <div className="row">
            <input type="password" placeholder={me.user.hasPassword ? "Password or current code" : "Current code"} value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
            <button
              className="btn"
              disabled={!disablePw}
              onClick={() => run(async () => (await api.mfaDisable(/^\d{6}$/.test(disablePw) ? { code: disablePw } : { password: disablePw }), onChanged()), "Two-step verification turned off.")}
            >
              Turn off
            </button>
          </div>
        </>
      ) : setup ? (
        <div className="mfa-setup">
          <img src={setup.qr} alt="QR code for your authenticator app" width={160} height={160} />
          <div>
            <p className="small">1. Scan this with Google Authenticator, 1Password, Authy or similar.</p>
            <p className="small muted">Can't scan? Enter this key: <code>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code></p>
            <p className="small">2. Enter the 6-digit code it shows:</p>
            <div className="row">
              <input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn primary" disabled={code.length < 6} onClick={() => run(async () => setCodes((await api.mfaEnable(code)).recoveryCodes), "Two-step verification is on.")}>
                Turn on
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="muted small">Protect your account with a code from your phone in addition to your password.</p>
          <button
            className="btn"
            onClick={() =>
              run(async () => {
                const s = await api.mfaSetup();
                const QR = await import("qrcode");
                setSetup({ secret: s.secret, qr: await QR.toDataURL(s.otpauth, { margin: 1, width: 320 }) });
              }, "")
            }
          >
            Set up two-step verification
          </button>
        </>
      )}
      {view}
    </section>
  );
}

function AccountTab({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [name, setName] = useState(me.user.name);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [delPw, setDelPw] = useState("");
  const { run, view } = useMsg();
  return (
    <>
      <section>
        <h4>Profile</h4>
        <label className="field">
          <span>Email</span>
          <input value={me.user.email} readOnly />
        </label>
        <div className="row">
          <label className="field grow">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn" onClick={() => run(async () => (await api.updateAccount({ name }), onChanged()), "Saved.")}>
            Save
          </button>
        </div>
      </section>
      <SecuritySection me={me} onChanged={onChanged} />
      <section>
        <h4>Change password</h4>
        <div className="grid2">
          <label className="field">
            <span>Current password</span>
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New password (10+ characters)</span>
            <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </label>
        </div>
        <button className="btn" disabled={!pw.current || pw.next.length < 10} onClick={() => run(() => api.updateAccount({ currentPassword: pw.current, newPassword: pw.next }), "Password changed. Other sessions were signed out.")}>
          Change password
        </button>
      </section>
      <section>
        <h4>Sign out</h4>
        <button className="btn" onClick={async () => (await api.logout(), (location.href = "/"))}>
          Sign out
        </button>
      </section>
      <section className="danger-zone">
        <h4>Delete account</h4>
        <p className="muted small">Deletes your account. Workspaces where you're the only owner are deleted too, including their boards and connections.</p>
        <div className="row">
          <input type="password" placeholder="Confirm with your password" value={delPw} onChange={(e) => setDelPw(e.target.value)} />
          <button
            className="btn danger"
            disabled={!delPw}
            onClick={() =>
              confirmDialog("Delete your account?", { message: "This cannot be undone. Workspaces where you're the only owner are deleted too.", confirmLabel: "Delete account", danger: true }).then(
                (ok) =>
                  void (ok &&
              run(async () => {
                await api.deleteAccount(delPw);
                location.href = "/";
              }, "Deleted.")))
            }
          >
            <Trash2 size={14} /> Delete account
          </button>
        </div>
      </section>
      {view}
    </>
  );
}

const ROLE_HELP: Record<Role, string> = {
  viewer: "View boards and comment",
  member: "Edit boards, use AI, run reports",
  admin: "Manage members and integrations",
  owner: "Billing and workspace deletion",
};

function MembersTab({ me, admin, owner, onChanged }: { me: Me; admin: boolean; owner: boolean; onChanged: () => void }) {
  const [data, setData] = useState<{ members: Member[]; invites: { id: string; email: string; role: Role; expires_at: string }[] } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const { run, view } = useMsg();
  const load = () => api.members().then(setData);
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      {admin && (
        <section>
          <h4>
            <UserPlus size={14} /> Invite people
          </h4>
          <div className="row">
            <input className="grow" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="btn primary"
              disabled={!email}
              onClick={() =>
                run(async () => {
                  const r = await api.invite(email, role);
                  track("shared", { via: "invite" });
                  setLink(r.url);
                  setEmail("");
                  await load();
                }, "Invite created.")
              }
            >
              Invite
            </button>
          </div>
          <p className="muted small">{ROLE_HELP[role]}. Members limit: {me.usage.memberLimit ?? "unlimited"}.</p>
          {link && (
            <div className="share-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} Copy invite link
              </button>
            </div>
          )}
        </section>
      )}
      <section>
        <h4>Members</h4>
        <table className="table">
          <tbody>
            {data?.members.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.name || m.email}</b>
                  <div className="muted small">{m.email}</div>
                </td>
                <td>
                  {admin && m.id !== me.user.id && (m.role !== "owner" || owner) ? (
                    <select value={m.role} onChange={(e) => run(async () => (await api.setRole(m.id, e.target.value as Role), await load()), "Role updated.")}>
                      {(["viewer", "member", "admin", ...(owner ? ["owner"] : [])] as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="chip">{m.role}</span>
                  )}
                </td>
                <td className="right">
                  {m.id === me.user.id ? (
                    <button className="btn" onClick={async () => (await confirmDialog("Leave this workspace?", { confirmLabel: "Leave", danger: true })) && run(async () => (await api.removeMember(m.id), (location.href = "/")), "Left.")}>
                      Leave
                    </button>
                  ) : (
                    admin &&
                    (m.role !== "owner" || owner) && (
                      <button className="icon-btn danger" title="Remove" onClick={async () => (await confirmDialog(`Remove ${m.email}?`, { message: "They lose access to every board in this workspace.", confirmLabel: "Remove", danger: true })) && run(async () => (await api.removeMember(m.id), await load(), onChanged()), "Removed.")}>
                        <Trash2 size={14} />
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {data?.invites.map((i) => (
              <tr key={i.id} className="muted">
                <td>
                  {i.email}
                  <div className="small">Invite pending · expires {new Date(i.expires_at).toLocaleDateString()}</div>
                </td>
                <td>
                  <span className="chip">{i.role}</span>
                </td>
                <td className="right">
                  <button className="icon-btn danger" title="Revoke invite" onClick={() => run(async () => (await api.revokeInvite(i.id), await load()), "Invite revoked.")}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {view}
    </>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div className="meter">
      <div className="row">
        <span>{label}</span>
        <span className="spacer" />
        <b>
          {used.toLocaleString()} {limit ? `/ ${limit.toLocaleString()}` : "· unlimited"}
        </b>
      </div>
      {limit && (
        <div className="meter-bar">
          <div style={{ width: `${pct}%` }} className={pct > 90 ? "hot" : ""} />
        </div>
      )}
    </div>
  );
}

function BillingTab({ me, owner }: { me: Me; owner: boolean }) {
  const { run, view } = useMsg();
  const go = (fn: () => Promise<{ url: string }>) => run(async () => (location.href = (await fn()).url), "Redirecting to Stripe…");
  const plan = PLANS[me.workspace.plan];
  return (
    <>
      <section>
        <h4>Usage this month</h4>
        <Meter label="AI actions" used={me.usage.ai} limit={me.usage.aiLimit} />
        <Meter label="Boards" used={me.usage.boards} limit={me.usage.boardLimit} />
        <Meter label="Members" used={me.usage.members} limit={me.usage.memberLimit} />
      </section>
      {!me.billingEnabled ? (
        <p className="note small">Billing is disabled on this deployment — every workspace has unlimited usage.</p>
      ) : (
        <section>
          <h4>
            Plan: {plan.name}
            {me.workspace.subscriptionStatus && me.workspace.subscriptionStatus !== "active" ? ` (${me.workspace.subscriptionStatus.replace("_", " ")})` : ""}
          </h4>
          <div className="plans compact">
            {PUBLIC_PLANS.map((id) => {
              const p = PLANS[id];
              const current = id === me.workspace.plan;
              return (
                <div key={id} className={`plan-card ${current ? "featured" : ""}`}>
                  <h3>{p.name}</h3>
                  <div className="price">
                    ${p.priceMonthly}
                    <span>/mo</span>
                  </div>
                  <ul>
                    {p.features.slice(0, 4).map((f) => (
                      <li key={f}>
                        <Check size={13} /> {f}
                      </li>
                    ))}
                  </ul>
                  {current ? (
                    <span className="chip active">Current plan</span>
                  ) : id === "free" ? null : (
                    <button className="btn primary full" disabled={!owner} onClick={() => go(() => api.checkout(id))}>
                      Upgrade to {p.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {me.workspace.plan !== "free" && (
            <button className="btn" disabled={!owner} onClick={() => go(api.portal)}>
              Manage billing, invoices & cancellation
            </button>
          )}
          {!owner && <p className="muted small">Only workspace owners can change the plan.</p>}
        </section>
      )}
      {view}
    </>
  );
}

function BrandingSection({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [b, setB] = useState<Branding>(me.workspace.branding ?? {});
  const { run, view } = useMsg();
  const paid = me.workspace.plan !== "free";
  const onFile = (f?: File) => {
    if (!f) return;
    if (f.size > 200_000) return void alertSize();
    const r = new FileReader();
    r.onload = () => setB({ ...b, logo: String(r.result) });
    r.readAsDataURL(f);
  };
  const alertSize = () => run(async () => Promise.reject(new Error("Logo must be under 200 KB.")), "");
  return (
    <section>
      <h4>Branding (white-label)</h4>
      <p className="muted small">Used on share links, client reports and presentations — great for agencies presenting to clients.</p>
      <div className="branding-grid">
        <label className="field">
          <span>Display name</span>
          <input value={b.name ?? ""} placeholder={me.workspace.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Brand color</span>
          <div className="row">
            <input type="color" value={b.color ?? "#6d5efc"} onChange={(e) => setB({ ...b, color: e.target.value })} />
            <code>{b.color ?? "#6d5efc"}</code>
          </div>
        </label>
        <label className="field">
          <span>Logo (PNG, JPG, SVG, WebP · under 200 KB)</span>
          <div className="row">
            {b.logo && <img src={b.logo} alt="Logo preview" className="logo-preview" />}
            <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
            {b.logo && (
              <button className="link small" onClick={() => setB({ ...b, logo: undefined })}>
                Remove
              </button>
            )}
          </div>
        </label>
        <label className="check small">
          <input type="checkbox" disabled={!paid} checked={!!b.hidePoweredBy} onChange={(e) => setB({ ...b, hidePoweredBy: e.target.checked })} /> Hide “Made with AdCanvas” {paid ? "" : "(Pro and Team plans)"}
        </label>
      </div>
      <button className="btn" onClick={() => run(async () => (await api.setBranding(b), onChanged()), "Branding saved.")}>
        Save branding
      </button>
      {view}
    </section>
  );
}

function WorkspaceTab({ me, owner, onChanged }: { me: Me; owner: boolean; onChanged: () => void }) {
  const [name, setName] = useState(me.workspace.name);
  const [newName, setNewName] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const { run, view } = useMsg();
  return (
    <>
      <section>
        <h4>Workspace name</h4>
        <div className="row">
          <input className="grow" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={() => run(async () => (await api.renameWorkspace(name), onChanged()), "Renamed.")}>
            Save
          </button>
        </div>
      </section>
      <BrandingSection me={me} onChanged={onChanged} />
      <section>
        <h4>Create another workspace</h4>
        <p className="muted small">Useful for agencies: one workspace per client, each with its own members, boards, integrations and billing.</p>
        <div className="row">
          <input className="grow" placeholder="Client or team name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn" disabled={!newName} onClick={() => run(async () => (await api.createWorkspace(newName), (location.href = "/")), "Created.")}>
            Create
          </button>
        </div>
      </section>
      {owner && (
        <section className="danger-zone">
          <h4>Delete workspace</h4>
          <p className="muted small">Permanently deletes all boards, comments, integrations and members' access. Cancel any subscription first in Plan & usage.</p>
          <div className="row">
            <input className="grow" placeholder={`Type "${me.workspace.name}" to confirm`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <button className="btn danger" disabled={confirmName !== me.workspace.name} onClick={() => run(async () => (await api.deleteWorkspace(confirmName), (location.href = "/")), "Deleted.")}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </section>
      )}
      {view}
    </>
  );
}

function AuditTab() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.audit>>>([]);
  useEffect(() => {
    api.audit().then(setRows);
  }, []);
  return (
    <section>
      <h4>Recent activity (last 200 events)</h4>
      <table className="table small">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="muted">{new Date(r.created_at).toLocaleString()}</td>
              <td>
                <code>{r.action}</code>
              </td>
              <td>{r.email ?? "system"}</td>
              <td className="muted">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
