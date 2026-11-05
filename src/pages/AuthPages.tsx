import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type AuthMode = "login" | "signup" | "forgot" | "reset" | "invite";

export function AuthPage({ mode, token, onDone }: { mode: AuthMode; token?: string; onDone: () => void }) {
  const [m, setM] = useState<AuthMode>(mode);
  const [f, setF] = useState({ name: "", email: "", password: "", workspaceName: "", accept: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [invite, setInvite] = useState<{ workspace: string; inviter: string | null; email: string; role: string } | null>(null);
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  useEffect(() => {
    if (mode === "invite" && token)
      api
        .getInvite(token)
        .then((i) => {
          setInvite(i);
          setF((x) => ({ ...x, email: i.email }));
          setM("signup");
        })
        .catch((e) => setError((e as Error).message));
  }, [mode, token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (m === "login") await api.login({ email: f.email, password: f.password, invite: invite ? token : undefined });
      else if (m === "signup") await api.signup({ name: f.name, email: f.email, password: f.password, workspaceName: f.workspaceName || undefined, acceptTerms: f.accept, invite: invite ? token : undefined });
      else if (m === "forgot") {
        await api.forgot(f.email);
        setInfo("If an account exists for that email, we've sent a reset link. It expires in an hour.");
        return;
      } else if (m === "reset") await api.reset(token ?? "", f.password);
      history.replaceState(null, "", "/");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = { login: "Welcome back", signup: invite ? `Join ${invite.workspace}` : "Create your account", forgot: "Reset your password", reset: "Choose a new password", invite: "Accept invite" }[m];

  return (
    <div className="auth">
      <a className="brand" href="/">
        <span className="logo">◆</span> AdCanvas
      </a>
      <form className="auth-card" onSubmit={submit}>
        <h1>{title}</h1>
        {invite && (
          <p className="muted">
            {invite.inviter ?? "A teammate"} invited <b>{invite.email}</b> to join as {invite.role}.
          </p>
        )}
        {m === "signup" && (
          <label className="field">
            <span>Your name</span>
            <input autoFocus required value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
          </label>
        )}
        {m !== "reset" && (
          <label className="field">
            <span>Work email</span>
            <input type="email" required autoFocus={m !== "signup"} value={f.email} readOnly={!!invite} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
          </label>
        )}
        {m !== "forgot" && (
          <label className="field">
            <span>{m === "reset" ? "New password" : "Password"}</span>
            <input type="password" required minLength={m === "login" ? undefined : 10} value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete={m === "login" ? "current-password" : "new-password"} />
            {m !== "login" && <small className="muted">At least 10 characters.</small>}
          </label>
        )}
        {m === "signup" && !invite && (
          <label className="field">
            <span>Company or team name (optional)</span>
            <input value={f.workspaceName} onChange={(e) => set("workspaceName", e.target.value)} autoComplete="organization" />
          </label>
        )}
        {m === "signup" && (
          <label className="check small">
            <input type="checkbox" checked={f.accept} onChange={(e) => set("accept", e.target.checked)} required />
            <span>
              I agree to the{" "}
              <a href="/legal/terms" target="_blank">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="/legal/privacy" target="_blank">
                Privacy Policy
              </a>
              .
            </span>
          </label>
        )}
        {error && <div className="error">{error}</div>}
        {info && <div className="note small">{info}</div>}
        <button className="btn primary full" disabled={busy}>
          {busy ? <span className="spinner" /> : null}
          {{ login: "Sign in", signup: invite ? "Create account & join" : "Create account", forgot: "Send reset link", reset: "Set password", invite: "Continue" }[m]}
        </button>
        <div className="auth-links">
          {m === "login" && (
            <>
              <button type="button" className="link" onClick={() => setM("forgot")}>
                Forgot password?
              </button>
              <button type="button" className="link" onClick={() => setM("signup")}>
                Create an account
              </button>
            </>
          )}
          {m === "signup" && (
            <button type="button" className="link" onClick={() => setM("login")}>
              Already have an account? Sign in{invite ? " to join" : ""}
            </button>
          )}
          {m === "forgot" && (
            <button type="button" className="link" onClick={() => setM("login")}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
