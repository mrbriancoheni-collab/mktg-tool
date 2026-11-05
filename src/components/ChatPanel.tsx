import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { toGraph, useStore } from "../lib/store";
import { Markdown } from "./Markdown";

const STARTERS = [
  "What's the weakest step in this funnel?",
  "How should I split budget across channels?",
  "Write 3 hook ideas for the top-of-funnel ads",
  "What should I track to know if this is working?",
];

export function ChatPanel() {
  const chat = useStore((s) => s.chat);
  const setChat = useStore((s) => s.setChat);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Newer browsers return a Promise from scrollIntoView, which must not leak out of the effect.
    void end.current?.scrollIntoView({ block: "end" });
  }, [chat, pending]);

  const send = async (text: string) => {
    if (!text.trim() || pending !== null) return;
    const history = [...chat, { role: "user" as const, content: text.trim() }];
    setChat(history);
    setInput("");
    setPending("");
    abort.current = new AbortController();
    try {
      const reply = await api.chat(toGraph(useStore.getState()), history, setPending, abort.current.signal);
      setChat([...history, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "_Stopped._" : `**Error:** ${(e as Error).message}`;
      setChat([...history, { role: "assistant", content: msg }]);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="chat">
      <div className="chat-log">
        {chat.length === 0 && pending === null && (
          <div className="chat-empty">
            <p className="muted">Ask anything about this campaign. The assistant sees the whole canvas, your assumptions, and any actuals.</p>
            {STARTERS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
          </div>
        ))}
        {pending !== null && <div className="msg assistant">{pending ? <Markdown text={pending} /> : <span className="spinner" />}</div>}
        <div ref={end} />
      </div>
      <p className="ai-note pad-x">AI answers can be inaccurate — double-check important numbers and claims.</p>
      <div className="chat-input">
        {chat.length > 0 && pending === null && (
          <button className="icon-btn" title="Clear conversation" onClick={() => setChat([])}>
            <Trash2 size={15} />
          </button>
        )}
        <textarea
          rows={2}
          value={input}
          placeholder="Ask the campaign strategist…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        {pending === null ? (
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
