import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type AuthMode = "login" | "signup" | "forgot" | "reset" | "invite" | "mfa";

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthPage({ mode, token, onDone }: { mode: AuthMode; token?: string; onDone: () => void }) {
  const [m, setM] = useState<AuthMode>(mode);
  const [f, setF] = useState({ name: "", email: "", password: "", workspaceName: "", accept: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [invite, setInvite] = useState<{ workspace: string; inviter: string | null; email: string; role: string } | null>(null);
  const [googleLogin, setGoogleLogin] = useState(false);
  const [site, setSite] = useState<string | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    api.status().then((st) => { setGoogleLogin(st.googleLogin); setSite(st.marketingUrl ?? null); }).catch(() => {});
    const err = new URLSearchParams(location.search).get("error");
    if (err) setError(err);
  }, []);
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
      if (m === "mfa") await api.mfa(code);
      else if (m === "login") {
        const r = await api.login({ email: f.email, password: f.password, invite: invite ? token : undefined });
        if (r.mfaRequired) {
          setM("mfa");
          return;
        }
      }
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

  const title = { mfa: "Two-step verification", login: "Welcome back", signup: invite ? `Join ${invite.workspace}` : "Create your account", forgot: "Reset your password", reset: "Choose a new password", invite: "Accept invite" }[m];

  return (
    <div className="auth">
      <a className="brand" href={site ?? "/"}>
        <span className="logo">◆</span> AdCanvas
      </a>
      <form className="auth-card" onSubmit={submit}>
        <h1>{title}</h1>
        {invite && (
          <p className="muted">
            {invite.inviter ?? "A teammate"} invited <b>{invite.email}</b> to join as {invite.role}.
          </p>
        )}
        {m === "mfa" && (
          <label className="field">
            <span>Enter the 6-digit code from your authenticator app, or a recovery code</span>
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
          </label>
        )}
        {(m === "login" || m === "signup") && googleLogin && (
          <>
            <a className="btn full google-btn" href={`/api/auth/google${invite && token ? `?invite=${token}` : ""}`}>
              <GoogleG /> Continue with Google
            </a>
            {m === "signup" && <p className="muted small center-text">By continuing with Google you agree to the <a href="/legal/terms" target="_blank">Terms</a> and <a href="/legal/privacy" target="_blank">Privacy Policy</a>.</p>}
            <div className="divider">or with email</div>
          </>
        )}
        {m === "signup" && (
          <label className="field">
            <span>Your name</span>
            <input autoFocus required value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
          </label>
        )}
        {m !== "reset" && m !== "mfa" && (
          <label className="field">
            <span>Work email</span>
            <input type="email" required autoFocus={m !== "signup"} value={f.email} readOnly={!!invite} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
          </label>
        )}
        {m !== "forgot" && m !== "mfa" && (
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
          {{ mfa: "Verify", login: "Sign in", signup: invite ? "Create account & join" : "Create account", forgot: "Send reset link", reset: "Set password", invite: "Continue" }[m]}
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
