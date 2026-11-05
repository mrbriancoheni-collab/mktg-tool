// Top-level routing: legal pages, auth pages, public share links, the
// marketing site for signed-out visitors, and the app for signed-in users.

import { useCallback, useEffect, useState } from "react";
import App from "./App";
import { LegalPage } from "./components/LegalPage";
import { api, onUnauthorized, type Me } from "./lib/api";
import { useStore } from "./lib/store";
import { AuthPage, type AuthMode } from "./pages/AuthPages";
import { Landing } from "./pages/Landing";

// Report uncaught client errors to the server (forwarded to Sentry when configured).
const report = (message: string, stack?: string) =>
  fetch("/api/client-errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, stack, url: location.pathname }) }).catch(() => {});
window.addEventListener("error", (e) => report(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => report(String(e.reason?.message ?? e.reason), e.reason?.stack));

export function Root() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const m = await api.me();
      useStore.getState().setSync({ me: m });
      setMe(m);
    } catch {
      useStore.getState().setSync({ me: null });
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const on401 = () => setMe(null);
    onUnauthorized.addEventListener("401", on401);
    return () => onUnauthorized.removeEventListener("401", on401);
  }, [refresh]);

  const legal = path.match(/^\/legal\/([a-z-]+)\/?$/);
  if (legal) return <LegalPage slug={legal[1]} />;

  // Public share links don't need an account.
  if (params.get("share")) return <App readOnlyShare />;

  const invite = path.match(/^\/invite\/([\w-]+)/);
  const authMode: AuthMode | null = invite ? "invite" : path === "/login" ? "login" : path === "/signup" ? "signup" : path === "/forgot" ? "forgot" : path === "/reset" ? "reset" : null;

  if (me === undefined) return <div className="boot"><span className="spinner" /></div>;

  if (invite && me) return <AcceptInvite token={invite[1]} onDone={refresh} />;
  if (authMode && !me) return <AuthPage mode={authMode} token={invite?.[1] ?? params.get("token") ?? undefined} onDone={refresh} />;
  if (!me) return path === "/" ? <Landing /> : <AuthPage mode="login" onDone={refresh} />;
  if (authMode) history.replaceState(null, "", "/");
  return <App onAccountChange={refresh} />;
}

function AcceptInvite({ token, onDone }: { token: string; onDone: () => void }) {
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .acceptInvite(token)
      .then(() => {
        history.replaceState(null, "", "/");
        onDone();
      })
      .catch((e) => setError((e as Error).message));
  }, [token, onDone]);
  return (
    <div className="auth">
      <div className="auth-card">
        {error ? (
          <>
            <h1>Couldn't accept invite</h1>
            <div className="error">{error}</div>
            <a className="btn full" href="/">
              Go to my workspace
            </a>
          </>
        ) : (
          <span className="spinner" />
        )}
      </div>
    </div>
  );
}
