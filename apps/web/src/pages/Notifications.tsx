import { useEffect, useState } from 'react';
import { Shell } from '../components/Shell';
import { Button, EmptyState, Skeleton } from '../components/ui';
import { api, type Notification } from '../lib/api';
import { timeAgo } from '../lib/format';

const KIND_GLYPH: Record<string, string> = {
  welcome: '👋', badge: '🏅', pb: '🚀', integrity: '🛡️', system: '🔔',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[] | null>(null);

  const load = () =>
    api.notifications().then(({ notifications }) => setItems(notifications)).catch(() => setItems([]));

  useEffect(() => { void load(); }, []);

  const unread = (Array.isArray(items) ? items : []).filter((n) => !n?.readAt).length;

  return (
    <Shell
      title="Notifications"
      actions={
        unread > 0 ? (
          <Button variant="ghost" onClick={() => api.markAllNotificationsRead().then(load)}>
            Mark all read ({unread})
          </Button>
        ) : undefined
      }
    >
      {!items ? (
        <div className="fz-card"><Skeleton height={200} /></div>
      ) : items.length === 0 ? (
        <EmptyState title="All quiet" body="Badges, personal bests and sync updates will show up here." />
      ) : (
        <div className="fz-card">
          {items.map((n) => (
            <div key={n.id} className={`fz-notif${n.readAt ? '' : ' fz-notif--unread'}`}>
              <div aria-hidden style={{ fontSize: 20 }}>{KIND_GLYPH[n.kind] ?? '🔔'}</div>
              <div style={{ minWidth: 0 }}>
                <h4>{n.title}</h4>
                <p>{n.body}</p>
              </div>
              <time dateTime={n.createdAt}>{timeAgo(n.createdAt)}</time>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
