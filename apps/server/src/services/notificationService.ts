import type { Database } from '../db.ts';
import { newId } from '../util/id.ts';

export interface Notification {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export async function pushNotification(
  db: Database,
  userId: string,
  kind: string,
  title: string,
  body: string,
): Promise<Notification> {
  const settings = await db.getSettings(userId);
  const id = newId('ntf');
  const createdAt = new Date().toISOString();
  if (settings && settings.notifications_enabled === 0) {
    return { id, userId, kind, title, body, createdAt, readAt: createdAt };
  }
  await db.insertNotification({
    id,
    user_id: userId,
    kind,
    title,
    body,
    created_at: createdAt,
    read_at: null,
  });
  return { id, userId, kind, title, body, createdAt, readAt: null };
}

export async function listNotifications(db: Database, userId: string, limit = 50): Promise<Notification[]> {
  const rows = await db.listNotifications(userId, limit);
  return rows.map((r: any) => ({
    id: String(r.id),
    userId: String(r.user_id),
    kind: String(r.kind),
    title: String(r.title),
    body: String(r.body),
    createdAt: String(r.created_at),
    readAt: r.read_at == null ? null : String(r.read_at),
  }));
}

export async function markAllRead(db: Database, userId: string): Promise<number> {
  return await db.markAllNotificationsRead(userId);
}

export async function markRead(db: Database, userId: string, id: string): Promise<boolean> {
  return await db.markNotificationRead(userId, id);
}
