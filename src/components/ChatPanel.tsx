import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Square, Trash2, Undo2, Wand2, X } from "lucide-react";
import type { Op } from "../../shared/ops";
import { api } from "../lib/api";
import { toGraph, useStore, type ChatMessage } from "../lib/store";
import { track } from "../lib/track";
import { Markdown } from "./Markdown";

const STARTERS = [
  "Add retargeting for people who didn't buy",
  "Cut total budget by 15% without losing customers",
  "What's the weakest step in this funnel?",
  "Rebalance budget toward the channels with the best ROAS",
  "Add an email nurture for leads who don't book",
];

export function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const setChat = useStore((s) => s.setChat);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<ChatMessage | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Newer browsers return a Promise from scrollIntoView, which must not leak out of the effect.
    void end.current?.scrollIntoView({ block: "end" });
  }, [chat, pending]);

  const send = async (text: string) => {
    if (!text.trim() || pending) return;
    const history = [...chat, { role: "user" as const, content: text.trim() }];
    setChat(history);
    setInput("");
    let msg: ChatMessage = { role: "assistant", content: "" };
    setPending(msg);
    abort.current = new AbortController();
    try {
      await api.assistant(
        toGraph(useStore.getState()),
        history.map((m) => ({ role: m.role, content: m.content })),
        (ev) => {
          if (ev.type === "text") msg = { ...msg, content: msg.content + ev.delta };
          else if (ev.type === "changes") msg = { ...msg, proposal: { summary: ev.summary, ops: ev.ops as Op[], described: ev.described, warnings: ev.warnings, status: "pending" } };
          else if (ev.type === "error") msg = { ...msg, content: `${msg.content}\n\n**Error:** ${ev.message}` };
          setPending(msg);
        },
        abort.current.signal,
      );
      setChat([...history, msg]);
      track("assistant_used", { proposed: !!msg.proposal });
    } catch (e) {
      const m = (e as Error).name === "AbortError" ? "_Stopped._" : `**Error:** ${(e as Error).message}`;
      setChat([...history, { role: "assistant", content: msg.content ? `${msg.content}\n\n${m}` : m }]);
    } finally {
      setPending(null);
    }
  };

  const decide = (index: number, apply: boolean) => {
    const s = useStore.getState();
    const m = s.chat[index];
    if (!m.proposal || m.proposal.status !== "pending") return;
    if (apply) {
      s.checkpoint(); // so the whole AI edit can be undone in one step
      s.applyRemoteOps(m.proposal.ops);
      track("ai_edit_applied", { changes: m.proposal.described.length });
    }
    s.setChat(s.chat.map((x, i) => (i === index ? { ...x, proposal: { ...x.proposal!, status: apply ? "applied" : "discarded" } } : x)));
  };

  return (
    <div className="chat">
      <div className="chat-log">
        {chat.length === 0 && !pending && (
          <div className="chat-empty">
            <p className="muted">
              Ask about your campaign, or tell me what to change. I'll explain the plan and show you the edits before anything happens.
            </p>
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {[...chat, ...(pending ? [pending] : [])].map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? m.content ? <Markdown text={m.content} /> : <span className="spinner" /> : m.content}
            {m.proposal && <Proposal p={m.proposal} onApply={() => decide(i, true)} onDiscard={() => decide(i, false)} live={m === pending} />}
          </div>
        ))}
        <div ref={end} />
      </div>
      <p className="ai-note pad-x">AI suggestions can be wrong — review changes before applying. Applied changes can be undone (⌘Z).</p>
      <div className="chat-input">
        {chat.length > 0 && !pending && (
          <button className="icon-btn" title="Clear conversation" onClick={() => setChat([])}>
            <Trash2 size={15} />
          </button>
        )}
        <textarea
          rows={2}
          value={input}
          placeholder="Ask a question or describe a change…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        {!pending ? (
          <button className="send" onClick={() => send(input)} disabled={!input.trim()} aria-label="Send">
            <ArrowUp size={16} />
          </button>
        ) : (
          <button className="send" onClick={() => abort.current?.abort()} aria-label="Stop">
            <Square size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function Proposal({ p, onApply, onDiscard, live }: { p: NonNullable<ChatMessage["proposal"]>; onApply: () => void; onDiscard: () => void; live: boolean }) {
  return (
    <div className={`proposal ${p.status}`}>
      <div className="proposal-head">
        <Wand2 size={15} />
        <b>{p.status === "applied" ? "Applied" : p.status === "discarded" ? "Discarded" : "Proposed changes"}</b>
      </div>
      <p className="small">{p.summary}</p>
      <ul>
        {p.described.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      {!!p.warnings.length && <p className="small muted">Skipped: {p.warnings.join("; ")}</p>}
      {p.status === "pending" && !live && (
        <div className="row">
          <button className="btn primary" onClick={onApply}>
            <Check size={14} /> Apply
          </button>
          <button className="btn" onClick={onDiscard}>
            <X size={14} /> Discard
          </button>
        </div>
      )}
      {p.status === "applied" && (
        <button className="link small" onClick={() => useStore.getState().undo()}>
          <Undo2 size={12} /> Undo
        </button>
      )}
    </div>
  );
}
