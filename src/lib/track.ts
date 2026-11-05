// Product analytics: records key actions (server-side, per workspace) and
// drives the in-app "Getting started" checklist.

const KEY = "adcanvas-onboarding";
type Listener = () => void;
const listeners = new Set<Listener>();

export const ONBOARDING_STEPS: { event: string; label: string; hint: string }[] = [
  { event: "board_built", label: "Build a funnel", hint: "Click AI Build and describe your business, or start from a template." },
  { event: "node_edited", label: "Adjust an assumption", hint: "Select a step and change its budget or % who continue in the Plan tab." },
  { event: "asset_generated", label: "Create AI ads or copy", hint: "Select a traffic source → Creative tab → Create ad pack." },
  { event: "data_connected", label: "Bring in real results", hint: "Settings → Integrations to connect an ad account, or import a CSV." },
  { event: "analysis_run", label: "Get AI recommendations", hint: "Open Insights → Analyze funnel." },
  { event: "shared", label: "Invite or share", hint: "Invite a teammate in Settings, or share a view-only link from the board menu." },
];

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function onboardingState() {
  return load();
}

export function subscribeOnboarding(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function dismissOnboarding() {
  const s = load();
  s.__dismissed = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

let queue: { event: string; props?: Record<string, unknown>; at: number }[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function track(event: string, props?: Record<string, unknown>) {
  if (ONBOARDING_STEPS.some((s) => s.event === event)) {
    const s = load();
    if (!s[event]) {
      s[event] = true;
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* ignore */
      }
      listeners.forEach((l) => l());
    }
  }
  queue.push({ event, props, at: Date.now() });
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

function flush() {
  if (!queue.length) return;
  const events = queue;
  queue = [];
  fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => {});
}
window.addEventListener("pagehide", flush);
