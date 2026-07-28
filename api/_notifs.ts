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

// 알림은 두 갈래다.
//
//  · 채팅(dm) — 알림함에 쌓지 않는다. 메시지는 대화방 자체가 목록이고,
//    안 읽은 개수는 채팅 아이콘의 숫자 뱃지가 이미 보여준다. 알림함에까지
//    쌓으면 대화 한 번에 수십 줄이 밀려들어 나머지 알림을 덮어버린다.
//  · 그 외(팔로우/댓글/적립/당첨/공지…) — 알림함에 쌓인다.
//
// 다만 푸시는 양쪽 다 보낸다 — 앱을 안 보고 있을 때 메시지가 온 걸 모르면
// 안 되기 때문이다. "알림함에 남기느냐"와 "푸시를 쏘느냐"는 별개다.
const CHAT_TYPES = new Set(['dm']);

/** 채팅에서 비롯된 알림인가 — 알림함이 아니라 채팅 뱃지로 표시된다. */
export function isChatType(type: string): boolean {
  return CHAT_TYPES.has(type);
}

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
// 웹푸시는 종류를 가리지 않고 보낸다 — 앱을 안 보고 있어도 도착해야 한다.
// 알림함에 남기는 건 채팅이 아닌 알림뿐이다(위 CHAT_TYPES 주석 참고).
export async function notify(
  uid: string,
  n: { type: string; title: string; body: string; actorId?: string; postId?: string }
): Promise<void> {
  if (!uid || (n.actorId && n.actorId === uid)) return;
  // 채팅은 알림함을 건너뛰고 푸시만 — 표시는 채팅 뱃지가 맡는다.
  if (!isChatType(n.type)) {
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

// 읽을 때도 채팅을 걸러낸다 — 분리 이전에 쌓여 있던 옛 채팅 알림이
// 알림함에 그대로 남아 있기 때문이다.
export async function listFor(uid: string, limit = 50): Promise<Notif[]> {
  const list = await allNotifs();
  return list.filter((n) => n.uid === uid && !isChatType(n.type)).slice(0, limit);
}

export async function unreadCount(uid: string): Promise<number> {
  const list = await allNotifs();
  return list.reduce((c, n) => (n.uid === uid && !n.read && !isChatType(n.type) ? c + 1 : c), 0);
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
