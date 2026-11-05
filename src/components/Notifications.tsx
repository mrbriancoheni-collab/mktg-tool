import { useEffect, useState } from "react";
import { AtSign, Bell, BellRing, CheckCheck, MessageSquare, TriangleAlert, UserPlus } from "lucide-react";
import { api } from "../lib/api";

type Data = Awaited<ReturnType<typeof api.notifications>>;
const ICON: Record<string, React.ReactNode> = {
  mention: <AtSign size={15} />,
  guest_comment: <MessageSquare size={15} />,
  member_joined: <UserPlus size={15} />,
  alert: <TriangleAlert size={15} />,
  report_failed: <TriangleAlert size={15} />,
};

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : new Date(t).toLocaleDateString();
};

export function NotificationBell() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => api.notifications().then(setData).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".notif") && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="notif board-menu">
      <button className="icon-btn" title="Notifications" aria-label={`Notifications${data?.unread ? ` (${data.unread} unread)` : ""}`} onClick={() => (setOpen(!open), load())}>
        {data?.unread ? <BellRing size={16} /> : <Bell size={16} />}
        {!!data?.unread && <span className="notif-dot">{data.unread > 9 ? "9+" : data.unread}</span>}
      </button>
      {open && (
        <div className="dropdown right notif-panel">
          <div className="row notif-head">
            <b>Notifications</b>
            <div className="spacer" />
            {!!data?.unread && (
              <button className="link small" onClick={() => api.markRead().then(load)}>
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          {!data?.items.length && <p className="muted small pad">You're all caught up. Mentions (@name), guest comments, new teammates and critical alerts show up here.</p>}
          {data?.items.map((n) => (
            <a
              key={n.id}
              className={`notif-item ${n.read ? "" : "unread"}`}
              href={n.link ?? "#"}
              onClick={() => !n.read && api.markRead([n.id])}
            >
              <span className="notif-icon">{ICON[n.kind] ?? <Bell size={15} />}</span>
              <span className="grow">
                <b>{n.title}</b>
                {n.body && <span className="muted small notif-body">{n.body}</span>}
              </span>
              <span className="muted small">{ago(n.createdAt)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
