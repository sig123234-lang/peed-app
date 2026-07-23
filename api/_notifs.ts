import { getJSON, putJSON } from './_store';

// 알림 — 이벤트(팔로우/댓글/적립/당첨 등) 발생 시 서버에서 생성해 수신자에게 쌓는다.
export type Notif = {
  id: string;
  uid: string; // 수신자
  type: string; // follow | comment | pb | raffle | notice | system
  title: string;
  body: string;
  actorId?: string;
  postId?: string;
  read: boolean;
  ts: number;
};
const KEY = 'v2/notifs.json';

export async function allNotifs(): Promise<Notif[]> {
  const n = await getJSON<Notif[]>(KEY, []);
  return Array.isArray(n) ? n : [];
}

// 알림 1건 생성(수신자 없음/본인에게 오는 알림은 무시).
export async function notify(
  uid: string,
  n: { type: string; title: string; body: string; actorId?: string; postId?: string }
): Promise<void> {
  if (!uid || (n.actorId && n.actorId === uid)) return;
  const list = await allNotifs();
  list.unshift({
    id: `nt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    uid,
    type: n.type,
    title: n.title,
    body: n.body,
    actorId: n.actorId,
    postId: n.postId,
    read: false,
    ts: Date.now(),
  });
  await putJSON(KEY, list.slice(0, 50000));
}

export async function listFor(uid: string, limit = 50): Promise<Notif[]> {
  const list = await allNotifs();
  return list.filter((n) => n.uid === uid).slice(0, limit);
}

export async function unreadCount(uid: string): Promise<number> {
  const list = await allNotifs();
  return list.reduce((c, n) => (n.uid === uid && !n.read ? c + 1 : c), 0);
}

export async function markAllRead(uid: string): Promise<void> {
  const list = await allNotifs();
  let changed = false;
  for (const n of list) {
    if (n.uid === uid && !n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) await putJSON(KEY, list);
}
