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

// 알림 종류별로 눌렀을 때 이동할 앱 경로. 푸시 클릭·알림함 클릭이 같은 곳으로 간다.
export function routeFor(n: { type: string; postId?: string }): string {
  switch (n.type) {
    case 'raffle':
      return '/?tab=my&sub=wins';
    case 'product':
      return '/?tab=peed';
    case 'dm':
      return '/?tab=dm';
    case 'notice':
      return '/notice';
    case 'comment':
    case 'like':
      return n.postId ? `/?post=${n.postId}` : '/';
    case 'follow':
      return '/?tab=my';
    default:
      return '/notifications';
  }
}

// 알림 1건 생성(수신자 없음/본인에게 오는 알림은 무시).
// 알림함에 쌓는 동시에 웹푸시도 보낸다 — 앱을 안 보고 있어도 도착해야 한다.
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
  // 푸시 실패가 알림 생성을 되돌리지 않게 분리한다.
  try {
    const push = await import('./_push');
    await push.sendTo(uid, {
      title: n.title,
      body: n.body,
      url: routeFor(n),
      tag: n.type,
    });
  } catch {
    // 푸시 미설정이거나 발송 실패 — 알림함에는 이미 쌓였다.
  }
}

/** 알림 1건 삭제(본인 것만). */
export async function removeNotif(uid: string, id: string): Promise<boolean> {
  const list = await allNotifs();
  const next = list.filter((n) => !(n.id === id && n.uid === uid));
  if (next.length === list.length) return false;
  await putJSON(KEY, next);
  return true;
}

/** 내 알림 전체 삭제. */
export async function clearNotifs(uid: string): Promise<number> {
  const list = await allNotifs();
  const next = list.filter((n) => n.uid !== uid);
  const removed = list.length - next.length;
  if (removed) await putJSON(KEY, next);
  return removed;
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
