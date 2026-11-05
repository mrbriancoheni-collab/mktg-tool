// Top-level routing: legal pages, auth pages, public share links, the
// marketing site for signed-out visitors, and the app for signed-in users.

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import App from "./App";
import { LegalPage } from "./components/LegalPage";
import { api, onUnauthorized, type Me } from "./lib/api";
import { useStore } from "./lib/store";
import { AuthPage, type AuthMode } from "./pages/AuthPages";
import { Landing } from "./pages/Landing";
const Report = lazy(() => import("./pages/Report").then((m) => ({ default: m.Report })));
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));

// Report uncaught client errors to the server (forwarded to Sentry when configured).
const report = (message: string, stack?: string) =>
  fetch("/api/client-errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, stack, url: location.pathname }) }).catch(() => {});
window.addEventListener("error", (e) => report(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => report(String(e.reason?.message ?? e.reason), e.reason?.stack));

export function Root() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  // The marketing site (WordPress) when the app runs on its own subdomain; undefined until loaded.
  const [site, setSite] = useState<string | null | undefined>(undefined);

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
    api.status().then((st) => setSite(st.marketingUrl ?? null)).catch(() => setSite(null));
    // "Start with Pro" on the marketing site links to /signup?plan=pro — remember it through sign-up (incl. Google).
    const plan = params.get("plan");
    if (plan === "pro" || plan === "team") try { sessionStorage.setItem("pendingPlan", plan); } catch { /* storage unavailable */ }
    refresh();
    const on401 = () => setMe(null);
    onUnauthorized.addEventListener("401", on401);
    return () => onUnauthorized.removeEventListener("401", on401);
  }, [refresh]);

  usePendingCheckout(me);

  const boot = <div className="boot"><span className="spinner" /></div>;
  const legal = path.match(/^\/legal\/([a-z-]+)\/?$/);
  if (legal) {
    if (site === undefined) return boot;
    if (site) {
      location.replace(`${site}/legal/${legal[1]}/`);
      return boot;
    }
    return <LegalPage slug={legal[1]} />;
  }
  if (path === "/report" && (params.get("share") || me)) return <Suspense fallback={boot}><Report /></Suspense>;
  if (path === "/admin" && me) return <Suspense fallback={boot}><Admin /></Suspense>;

  // Public share links don't need an account.
  if (params.get("share")) return <App readOnlyShare />;

  const invite = path.match(/^\/invite\/([\w-]+)/);
  const authMode: AuthMode | null = invite ? "invite" : path === "/login" ? "login" : path === "/signup" ? "signup" : path === "/forgot" ? "forgot" : path === "/reset" ? "reset" : null;

  if (me === undefined) return <div className="boot"><span className="spinner" /></div>;

  if (invite && me) return <AcceptInvite token={invite[1]} onDone={refresh} />;
  if (authMode && !me) return <AuthPage mode={authMode} token={invite?.[1] ?? params.get("token") ?? undefined} onDone={refresh} />;
  // With a separate marketing site, the app's root is just the sign-in page.
  if (!me) {
    if (path !== "/") return <AuthPage mode="login" onDone={refresh} />;
    if (site === undefined) return boot;
    return site ? <AuthPage mode="login" onDone={refresh} /> : <Landing />;
  }
  if (authMode) history.replaceState(null, "", "/");
  return <App onAccountChange={refresh} />;
}

/** After sign-up from a paid plan's button, send the new workspace owner straight to checkout once. */
function usePendingCheckout(me: Me | null | undefined) {
  useEffect(() => {
    if (!me) return;
    let plan: string | null = null;
    try {
      plan = sessionStorage.getItem("pendingPlan");
      sessionStorage.removeItem("pendingPlan");
    } catch { /* storage unavailable */ }
    if ((plan !== "pro" && plan !== "team") || !me.billingEnabled || me.role !== "owner" || me.workspace.plan !== "free") return;
    api.checkout(plan).then((r) => location.assign(r.url)).catch(() => {});
  }, [me]);
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
