import { useState } from "react";
import { Check, MessageSquarePlus, RotateCcw, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { setUserName, userName } from "../lib/sync";

export function CommentsPanel() {
  const comments = useStore((s) => s.comments);
  const nodes = useStore((s) => s.nodes);
  const filter = useStore((s) => s.commentFilter);
  const boardId = useStore((s) => s.boardId);
  const shareToken = useStore((s) => s.shareToken);
  const readOnly = useStore((s) => s.readOnly);
  const setSync = useStore((s) => s.setSync);
  const select = useStore((s) => s.select);
  const [text, setText] = useState("");
  const [name, setName] = useState(userName());
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState("");

  const label = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.data.label ?? "Deleted element" : "Whole board");
  const list = comments
    .filter((c) => (filter ? c.nodeId === filter : true))
    .filter((c) => showResolved || !c.resolved)
    .sort((a, b) => b.createdAt - a.createdAt);

  const post = async () => {
    if (!text.trim()) return;
    if (!name.trim()) return setError("Add your name so others know who commented.");
    setUserName(name);
    setError("");
    try {
      const c = await api.addComment({ boardId, shareToken }, { nodeId: filter, author: name.trim(), text });
      setSync({ comments: [...useStore.getState().comments, c] });
      setText("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const update = async (id: string, resolved: boolean) => {
    const c = await api.resolveComment(boardId!, id, resolved);
    setSync({ comments: useStore.getState().comments.map((x) => (x.id === id ? c : x)) });
  };
  const remove = async (id: string) => {
    await api.deleteComment(boardId!, id);
    setSync({ comments: useStore.getState().comments.filter((x) => x.id !== id) });
  };

  return (
    <div className="comments">
      <div className="comments-head">
        {filter ? (
          <span className="chip active">
            On: {label(filter)}
            <button className="chip-x" onClick={() => setSync({ commentFilter: null })} aria-label="Show all comments">
              <X size={12} />
            </button>
          </span>
        ) : (
          <span className="muted small">All comments · select an element to comment on it</span>
        )}
        <label className="check small">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Resolved
        </label>
      </div>

      <div className="comment-compose">
        {!userName() && <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />}
        <textarea
          rows={3}
          placeholder={filter ? `Comment on “${label(filter)}”…` : "Comment on the board…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && post()}
        />
        <button className="btn primary" onClick={post} disabled={!text.trim()}>
          <MessageSquarePlus size={15} /> Comment
        </button>
        {error && <div className="error">{error}</div>}
      </div>

      {list.length === 0 && <p className="muted small pad">No {showResolved ? "" : "open "}comments yet.</p>}
      {list.map((c) => (
        <div key={c.id} className={`comment ${c.resolved ? "resolved" : ""}`}>
          <div className="comment-meta">
            <span className="avatar">{c.author.slice(0, 1).toUpperCase()}</span>
            <b>{c.author}</b>
            <span className="muted small">{new Date(c.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
            {!readOnly && (
              <>
                <button className="icon-btn" title={c.resolved ? "Reopen" : "Resolve"} onClick={() => update(c.id, !c.resolved)}>
                  {c.resolved ? <RotateCcw size={14} /> : <Check size={14} />}
                </button>
                <button className="icon-btn danger" title="Delete" onClick={() => remove(c.id)}>
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
          {!filter && (
            <button className="link small" onClick={() => c.nodeId && select(c.nodeId)}>
              {label(c.nodeId)}
            </button>
          )}
          <p>{c.text}</p>
        </div>
      ))}
    </div>
  );
}
