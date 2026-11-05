import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  BarChart3,
  Cloud,
  CloudOff,
  Download,
  Hand,
  MousePointer2,
  Plus,
  Eye,
  FileUp,
  Hammer,
  Loader2,
  MessageCircle,
  MessageSquare,
  PanelRightClose,
  Redo2,
  RefreshCcw,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  Upload,
} from "lucide-react";
import { defaultUtm } from "../shared/adpack";
import { CATALOG_BY_TYPE } from "../shared/catalog";
import { simulate } from "../shared/simulate";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { BoardMenu, type Dialog } from "./components/BoardMenu";
import { BriefModal } from "./components/BriefModal";
import { ChatPanel } from "./components/ChatPanel";
import { CommentsPanel } from "./components/CommentsPanel";
import { PrivacyDialog, ReportsDialog, ShareDialog } from "./components/Dialogs";
import { Inspector } from "./components/Inspector";
import { KpiBar } from "./components/KpiBar";
import { Palette } from "./components/Palette";
import { api, type IntegrationInfo } from "./lib/api";
import { download, parseActualsCSV, parseRevenueCSV } from "./lib/format";
import { toGraph, useStore, type Panel } from "./lib/store";
import { useBoardSync } from "./lib/sync";
import { SettingsDialog } from "./components/SettingsDialog";
import { ConfirmHost } from "./components/Confirm";
import { Checklist, Tour } from "./components/Onboarding";
import { track } from "./lib/track";
import { FlowEdge } from "./nodes/FlowEdge";
import { SimContext, StageNode } from "./nodes/StageNode";
import { StickyNode } from "./nodes/StickyNode";

const nodeTypes = { stage: StageNode, sticky: StickyNode };
const edgeTypes = { flow: FlowEdge };
// userSpaceOnUse keeps arrowheads a fixed size when edge thickness reflects volume.
const defaultEdgeOptions = { type: "flow", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, markerUnits: "userSpaceOnUse" } };

function SaveStatus() {
  const st = useStore((s) => s.saveState);
  if (st === "saving") return <span className="save-status"><Loader2 size={13} className="spin" /> Saving…</span>;
  if (st === "saved") return <span className="save-status"><Cloud size={13} /> Saved</span>;
  if (st === "offline") return <span className="save-status bad"><CloudOff size={13} /> Offline — changes will retry</span>;
  if (st === "error") return <span className="save-status bad"><CloudOff size={13} /> Save failed</span>;
  return null;
}

function Presence() {
  const others = useStore((s) => s.others);
  if (!others.length) return null;
  return (
    <div className="presence" title={`Also here: ${others.map((o) => o.name).join(", ")}`}>
      {others.slice(0, 4).map((p) => (
        <span key={p.clientId} className="avatar" title={`${p.name}${p.editor ? "" : " (viewing)"}`} style={{ background: `hsl(${(p.name.charCodeAt(0) * 47) % 360} 60% 50%)` }}>
          {p.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {others.length > 4 && <span className="avatar more">+{others.length - 4}</span>}
    </div>
  );
}

function Canvas({ onAccountChange }: { onAccountChange?: () => void }) {
  const s = useStore();
  const [tool, setTool] = useState<"hand" | "select">("hand");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settings, setSettings] = useState<null | "account" | "members" | "billing">(null);
  const rf = useReactFlow();
  const [showBrief, setShowBrief] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [aiMode, setAiMode] = useState<"live" | "demo" | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [toast, setToast] = useState("");
  const [syncing, setSyncing] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);
  const ro = s.readOnly;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }, []);
  useBoardSync(flash);

  // Messages after returning from OAuth or Stripe.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("connected")) track("data_connected", { via: "oauth", type: q.get("connected") });
    if (q.get("connected")) flash(`Connected ${q.get("connected")!.replace(/_/g, " ")}. Select it on the canvas to choose an account.`);
    if (q.get("oauth_error")) flash(`Connection failed: ${q.get("oauth_error")}`);
    if (q.get("billing") === "success") {
      flash("Thanks! Your plan is being upgraded — it can take a few seconds to show.");
      setTimeout(() => onAccountChange?.(), 3000);
    }
  }, [flash, onAccountChange]);

  const graph = useMemo(() => toGraph(s), [s.nodes, s.edges, s.name, s.goal]);
  const sim = useMemo(() => simulate(graph), [graph]);
  const selected = s.nodes.filter((n) => n.selected);
  const selectedNode = selected.length === 1 && selected[0].data.kind !== "note" ? selected[0] : null;

  // Fit the view whenever a different board is opened.
  useEffect(() => {
    if (s.boardId) setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 80);
  }, [s.boardId, rf]);

  const loadIntegrations = useCallback(async () => {
    try {
      const list = await api.integrations();
      setIntegrations(list);
      const st = useStore.getState();
      if (st.readOnly) return;
      for (const n of st.nodes) {
        if (n.data.kind !== "integration") continue;
        const status = list.find((i) => i.type === n.data.type)?.connected ? "connected" : "not_connected";
        if (n.data.integration?.status !== status) st.updateNode(n.id, { integration: { status } });
      }
    } catch {
      /* server offline; handled by status badge */
    }
  }, []);

  useEffect(() => {
    api.status().then((r) => setAiMode(r.ai)).catch(() => setAiMode(null));
  }, []);
  useEffect(() => {
    if (!ro) loadIntegrations();
  }, [s.nodes.length, s.boardId, ro, loadIntegrations]);

  // Keyboard shortcuts (ignored while typing or in view-only mode).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (ro || el.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        s.duplicateSelected();
      } else if (e.key === "h" && !mod) {
        setTool("hand");
      } else if (e.key === "v" && !mod) {
        setTool("select");
      } else if (e.key === "n" && !mod) {
        const { x, y } = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        s.addNode("sticky", { x: x - 100, y: y - 80 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s, rf, ro]);

  const addAtCenter = (type: string) => {
    const { x, y } = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    s.addNode(type, { x: x - 110 + Math.random() * 40, y: y - 40 + Math.random() * 40 });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/adcanvas");
    if (!type || ro) return;
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    s.addNode(type, { x: p.x - 110, y: p.y - 35 });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.sync(graph);
      if (!r.sources.length) {
        if (r.errors?.length) return flash(`Sync failed: ${r.errors.join("; ")}`);
        flash("No connected data sources. Add an ad platform or GA4 integration to the canvas and connect it, or import a CSV.");
      } else {
        s.applyActuals(r.actuals);
        s.setView("analyze");
        track("data_connected", { via: "sync", sources: r.sources });
        flash(`Synced ${Object.keys(r.actuals).length} nodes from ${r.sources.join(", ")}${r.sample ? " (includes sample data from preview connectors)" : ""}.${r.errors?.length ? ` Problems: ${r.errors.join("; ")}` : ""}`);
      }
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const importCSV = async (file: File) => {
    const text = await file.text();
    // Revenue/orders export (Shopify, Stripe, CRM) → attribute by UTM to traffic sources.
    const revenue = parseRevenueCSV(text);
    if (revenue) {
      const map: Record<string, { revenue: number; conversions: number }> = {};
      let unmatched = 0;
      for (const row of revenue) {
        const n = s.nodes.find((n) => {
          if (n.data.kind !== "traffic") return false;
          const src = (n.data.utm?.source ?? defaultUtm(n.data.type).source).toLowerCase();
          const camp = (n.data.utm?.campaign ?? "").toLowerCase();
          return !!src && src === row.source && (!row.campaign || !camp || camp === row.campaign);
        });
        if (!n) {
          unmatched++;
          continue;
        }
        const m = (map[n.id] ??= { revenue: 0, conversions: 0 });
        m.revenue += row.amount;
        m.conversions += 1;
      }
      s.applyActuals(map);
      s.setView("analyze");
      track("data_connected", { via: "revenue_csv" });
      flash(`Attributed ${revenue.length - unmatched} of ${revenue.length} orders/deals to ${Object.keys(map).length} traffic sources by UTM (last touch).${unmatched ? ` ${unmatched} had no matching utm_source — set UTMs on your traffic nodes.` : ""}`);
      return;
    }
    const rows = parseActualsCSV(text);
    const map: Record<string, (typeof rows)[number]["actuals"]> = {};
    const missed: string[] = [];
    for (const r of rows) {
      const key = r.node.toLowerCase();
      const n = s.nodes.find((n) => n.id === r.node || n.data.label.toLowerCase() === key);
      if (n) map[n.id] = r.actuals;
      else missed.push(r.node);
    }
    s.applyActuals(map);
    s.setView("analyze");
    track("data_connected", { via: "csv" });
    flash(`Imported actuals for ${Object.keys(map).length} nodes${missed.length ? `; no match for: ${missed.slice(0, 3).join(", ")}` : ""}.`);
  };

  const importJSON = async (file: File) => {
    try {
      const g = JSON.parse(await file.text());
      if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error("Not an AdCanvas file");
      s.importGraph(g);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 50);
    } catch (e) {
      flash(`Import failed: ${(e as Error).message}`);
    }
  };

  const tab = (p: Panel, icon: React.ReactNode, label: string, badge?: number) => (
    <button className={`tab ${s.panel === p ? "active" : ""}`} onClick={() => s.setPanel(s.panel === p ? null : p)}>
      {icon}
      {label}
      {!!badge && <span className="tab-badge">{badge}</span>}
    </button>
  );
  const openComments = s.comments.filter((c) => !c.resolved).length;

  return (
    <SimContext.Provider value={sim}>
      <div className={`app ${ro ? "read-only" : ""}`}>
        <header className="topbar">
          <a className="brand" href="/">
            <span className="logo">◆</span> AdCanvas
          </a>
          {!s.shareToken && <BoardMenu onDialog={setDialog} onError={flash} onSettings={setSettings} />}
          <input className="title-input" value={s.name} readOnly={ro} onChange={(e) => s.setName(e.target.value)} aria-label="Campaign name" />
          <div className="seg" role="tablist">
            <button className={s.view === "build" ? "on" : ""} onClick={() => s.setView("build")}>
              <Hammer size={14} /> Build
            </button>
            <button className={s.view === "analyze" ? "on" : ""} onClick={() => s.setView("analyze")}>
              <BarChart3 size={14} /> Analyze
            </button>
          </div>
          {!ro && <SaveStatus />}
          <div className="spacer" />
          <Presence />
          {ro ? (
            <span className="ro-badge">
              <Eye size={14} /> {s.shareToken ? "View only · comments on" : "Viewer access"}
            </span>
          ) : (
            <>
              <button className="icon-btn" title="Undo (⌘Z)" onClick={s.undo} disabled={!s.past.length}>
                <Undo2 size={16} />
              </button>
              <button className="icon-btn" title="Redo (⇧⌘Z)" onClick={s.redo} disabled={!s.future.length}>
                <Redo2 size={16} />
              </button>
              <span className="sep" />
              <button className="btn ghost" title="Pull metrics from connected integrations" onClick={sync} disabled={syncing}>
                <RefreshCcw size={15} className={syncing ? "spin" : ""} /> Sync data
              </button>
              <button
                className="btn ghost"
                title="Import a CSV: per-node actuals (node,spend,impressions,clicks,conversions,revenue) or orders/deals with utm_source,utm_campaign,revenue"
                onClick={() => csvInput.current?.click()}
              >
                <FileUp size={15} /> CSV
              </button>
              <button
                className="icon-btn"
                title="Export campaign JSON"
                onClick={() => download(`${s.name.replace(/\W+/g, "-").toLowerCase() || "campaign"}.adcanvas.json`, JSON.stringify({ ...graph, summary: s.summary }, null, 2))}
              >
                <Download size={16} />
              </button>
              <button className="icon-btn" title="Import campaign JSON into this board" onClick={() => jsonInput.current?.click()}>
                <Upload size={16} />
              </button>
              <span className="sep" />
              <button className="btn primary" data-tour="ai-build" onClick={() => setShowBrief(true)}>
                <Sparkles size={15} /> AI Build
              </button>
            </>
          )}
          {s.me && (
            <button className="avatar me" title={`${s.me.user.email} · ${s.me.workspace.name} (${s.me.role}) — settings`} onClick={() => setSettings("account")}>
              {(s.me.user.name || s.me.user.email).slice(0, 1).toUpperCase()}
            </button>
          )}
          <span
            className={`ai-badge ${aiMode ?? "off"}`}
            title={aiMode === "demo" ? "No API key configured — AI responses are demo templates" : aiMode === "live" ? "Connected to Claude" : "Server offline"}
          >
            {aiMode === "live" ? "AI live" : aiMode === "demo" ? "AI demo" : "offline"}
          </span>
          <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0]).finally(() => (e.target.value = ""))} />
          <input ref={jsonInput} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0]).finally(() => (e.target.value = ""))} />
        </header>

        <div className="body">
          {!ro && (
            <div className={`palette-wrap ${paletteOpen ? "open" : ""}`} data-tour="palette">
              <Palette
                onAdd={(t) => {
                  addAtCenter(t);
                  setPaletteOpen(false);
                }}
              />
            </div>
          )}

          <main className={`canvas tool-${tool}`} data-tour="canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <ReactFlow
              nodes={s.nodes}
              edges={s.edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              onNodesChange={ro ? (ch) => s.onNodesChange(ch.filter((c) => c.type === "select" || c.type === "dimensions")) : s.onNodesChange}
              onEdgesChange={ro ? undefined : s.onEdgesChange}
              onConnect={ro ? undefined : s.onConnect}
              onNodeDragStart={ro ? undefined : s.checkpoint}
              onNodeClick={(_, n) => {
                if (n.data.kind === "note") return;
                if (ro) {
                  s.setSync({ commentFilter: n.id });
                  s.setPanel("comments");
                } else if (s.panel !== "chat" && s.panel !== "comments") s.setPanel("inspector");
                else if (s.panel === "comments") s.setSync({ commentFilter: n.id });
              }}
              nodesDraggable={!ro}
              nodesConnectable={!ro}
              connectionMode={ConnectionMode.Loose}
              deleteKeyCode={ro ? null : ["Backspace", "Delete"]}
              multiSelectionKeyCode={["Shift", "Meta", "Control"]}
              // Drag empty space to pan (like Miro's hand); Shift-drag or the Select tool draws a selection box.
              selectionOnDrag={!ro && tool === "select"}
              panOnDrag={ro || tool === "hand" ? true : [1, 2]}
              selectionKeyCode="Shift"
              panOnScroll
              zoomOnPinch
              snapToGrid
              snapGrid={[10, 10]}
              minZoom={0.15}
              fitView
              fitViewOptions={{ padding: 0.15, minZoom: 0.5, maxZoom: 1.1 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
              <Controls position="bottom-left" showInteractive={!ro} />
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeColor={(n) => (n.data as { color?: string }).color ?? CATALOG_BY_TYPE[(n.data as { type: string }).type]?.color ?? "#999"}
              />
            </ReactFlow>

            {s.nodes.length > 0 && (
              <div data-tour="kpis" className="kpi-anchor">
                <KpiBar sim={sim} />
              </div>
            )}
            {!ro && (
              <div className="tool-switch" role="radiogroup" aria-label="Canvas tool">
                <button className={tool === "hand" ? "on" : ""} title="Hand: drag to move around (H)" onClick={() => setTool("hand")} role="radio" aria-checked={tool === "hand"}>
                  <Hand size={16} />
                </button>
                <button className={tool === "select" ? "on" : ""} title="Select: drag to select several steps (V)" onClick={() => setTool("select")} role="radio" aria-checked={tool === "select"}>
                  <MousePointer2 size={16} />
                </button>
              </div>
            )}
            {!ro && (
              <button className="fab" onClick={() => setPaletteOpen(true)} aria-label="Add a step">
                <Plus size={22} />
              </button>
            )}
            {!ro && s.boardId && <Checklist />}

            {s.nodes.length === 0 && !ro && s.boardId && (
              <div className="welcome">
                <h1>Map your campaign. Let AI do the heavy lifting.</h1>
                <p>Describe what you're selling and AI will lay out the full funnel — channels, pages, follow-ups, tracking and budget — then write the copy and analyze the numbers.</p>
                <div className="row center">
                  <button className="btn primary lg" onClick={() => setShowBrief(true)}>
                    <Sparkles size={18} /> Build with AI
                  </button>
                </div>
                <p className="muted small">Or drag building blocks in from the left. Drag the canvas to move around, Shift-drag to select, and select any step then press + to add what comes next.</p>
              </div>
            )}
            {toast && <div className="toast">{toast}</div>}
          </main>

          <aside className={`side ${s.panel ? "open" : ""}`} data-tour="side">
            <div className="tabs">
              {!ro && tab("inspector", <SlidersHorizontal size={14} />, "Inspect")}
              {tab("analysis", <BarChart3 size={14} />, "Insights")}
              {!ro && tab("chat", <MessageCircle size={14} />, "AI")}
              {tab("comments", <MessageSquare size={14} />, "Comments", openComments)}
              {s.panel && (
                <button className="icon-btn" title="Close panel" onClick={() => s.setPanel(null)}>
                  <PanelRightClose size={16} />
                </button>
              )}
            </div>
            <div className="side-body">
              {s.panel === "inspector" &&
                (selectedNode ? (
                  <Inspector node={selectedNode} integrations={integrations} onIntegrationsChange={loadIntegrations} />
                ) : (
                  <p className="muted pad">
                    {selected.length > 1
                      ? `${selected.length} items selected. ⌘D duplicates, Delete removes.`
                      : "Select a node on the canvas to edit its settings, set tracking URLs, enter actuals, connect integrations, or generate AI copy and ad packs."}
                  </p>
                ))}
              {s.panel === "analysis" && <AnalysisPanel integrations={integrations} />}
              {s.panel === "chat" && <ChatPanel />}
              {s.panel === "comments" && <CommentsPanel />}
            </div>
          </aside>
        </div>

        {showBrief && (
          <BriefModal
            onClose={() => setShowBrief(false)}
            onDone={() => {
              setShowBrief(false);
              s.setPanel("analysis");
              setTimeout(() => rf.fitView({ padding: 0.15, duration: 500 }), 60);
            }}
          />
        )}
        {settings && s.me && <SettingsDialog me={s.me} initialTab={settings} onClose={() => setSettings(null)} onChanged={() => onAccountChange?.()} />}
        {dialog === "share" && <ShareDialog onClose={() => setDialog(null)} />}
        <ConfirmHost />
        {!ro && <Tour enabled={!!s.boardId} />}
        {paletteOpen && <div className="palette-scrim" onClick={() => setPaletteOpen(false)} />}
        {dialog === "reports" && <ReportsDialog integrations={integrations} onClose={() => setDialog(null)} />}
        {dialog === "privacy" && <PrivacyDialog onClose={() => setDialog(null)} />}
      </div>
    </SimContext.Provider>
  );
}

export default function App({ onAccountChange }: { readOnlyShare?: boolean; onAccountChange?: () => void }) {
  return (
    <ReactFlowProvider>
      <Canvas onAccountChange={onAccountChange} />
    </ReactFlowProvider>
  );
}
