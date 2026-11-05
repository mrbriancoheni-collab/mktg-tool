import { useEffect, useState } from "react";
import { Check, Copy, CreditCard, History, Settings, Trash2, UserPlus, Users, X } from "lucide-react";
import { PLANS, PUBLIC_PLANS, roleAtLeast, type Role } from "../../shared/plans";
import { api, type Member, type Me } from "../lib/api";

type Tab = "account" | "members" | "billing" | "workspace" | "audit";

export function SettingsDialog({ me, initialTab = "account", onClose, onChanged }: { me: Me; initialTab?: Tab; onClose: () => void; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const admin = roleAtLeast(me.role, "admin");
  const owner = me.role === "owner";
  const tabs: [Tab, string, React.ReactNode, boolean][] = [
    ["account", "Account", <Settings size={14} />, true],
    ["members", "Members", <Users size={14} />, true],
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
              confirm("Permanently delete your account? This cannot be undone.") &&
              run(async () => {
                await api.deleteAccount(delPw);
                location.href = "/";
              }, "Deleted.")
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
                    <button className="btn" onClick={() => confirm("Leave this workspace?") && run(async () => (await api.removeMember(m.id), (location.href = "/")), "Left.")}>
                      Leave
                    </button>
                  ) : (
                    admin &&
                    (m.role !== "owner" || owner) && (
                      <button className="icon-btn danger" title="Remove" onClick={() => confirm(`Remove ${m.email}?`) && run(async () => (await api.removeMember(m.id), await load(), onChanged()), "Removed.")}>
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
