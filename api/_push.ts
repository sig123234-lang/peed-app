import webpush from 'web-push';

import { getJSON, putJSON } from './_store';

// 웹푸시(Web Push) — 앱을 안 보고 있어도 잠금화면/알림센터에 뜨는 진짜 푸시.
// 브라우저마다 구독 endpoint 가 다르고, 구독은 기기 단위라 한 회원이 여러 개를
// 가질 수 있다(폰 + 노트북). 만료된 구독은 발송 실패(404/410) 시 정리한다.
export type PushSub = {
  id: string;
  uid: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ua: string;
  createdAt: number;
};

const KEY = 'v2/push_subs.json';

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function publicKey(): string {
  return String(process.env.VAPID_PUBLIC_KEY || '');
}

let ready = false;
function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!ready) {
    webpush.setVapidDetails(
      String(process.env.VAPID_SUBJECT || 'mailto:admin@peed.co.kr'),
      String(process.env.VAPID_PUBLIC_KEY),
      String(process.env.VAPID_PRIVATE_KEY)
    );
    ready = true;
  }
  return true;
}

async function all(): Promise<PushSub[]> {
  const s = await getJSON<PushSub[]>(KEY, []);
  return Array.isArray(s) ? s : [];
}

/** 같은 endpoint 는 기기 하나 — 중복 저장하지 않고 소유자만 갱신한다. */
export async function subscribe(
  uid: string,
  sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } },
  ua = ''
): Promise<void> {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!uid || !endpoint || !p256dh || !auth) return;
  const list = await all();
  const idx = list.findIndex((s) => s.endpoint === endpoint);
  const row: PushSub = {
    id: idx >= 0 ? list[idx].id : `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    uid,
    endpoint,
    keys: { p256dh, auth },
    ua: String(ua).slice(0, 200),
    createdAt: idx >= 0 ? list[idx].createdAt : Date.now(),
  };
  if (idx >= 0) list[idx] = row;
  else list.push(row);
  await putJSON(KEY, list.slice(0, 50000));
}

export async function unsubscribe(endpoint: string): Promise<void> {
  if (!endpoint) return;
  const list = await all();
  await putJSON(
    KEY,
    list.filter((s) => s.endpoint !== endpoint)
  );
}

export async function hasSubscription(uid: string): Promise<boolean> {
  const list = await all();
  return list.some((s) => s.uid === uid);
}

/** 특정 회원의 모든 기기로 발송. 죽은 구독은 자동 정리. */
export async function sendTo(
  uid: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<number> {
  if (!ensureVapid() || !uid) return 0;
  const list = await all();
  const mine = list.filter((s) => s.uid === uid);
  if (!mine.length) return 0;
  const data = JSON.stringify({
    title: String(payload.title || 'PEED'),
    body: String(payload.body || ''),
    url: String(payload.url || '/'),
    tag: String(payload.tag || 'peed'),
  });
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    mine.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys } as any,
          data
        );
        sent++;
      } catch (e: any) {
        // 410 Gone / 404 = 구독 만료(앱 삭제·권한 해제). 지워야 계속 재시도하지 않는다.
        const code = Number(e?.statusCode) || 0;
        if (code === 404 || code === 410) dead.push(s.endpoint);
      }
    })
  );
  if (dead.length) {
    const fresh = await all();
    await putJSON(
      KEY,
      fresh.filter((s) => !dead.includes(s.endpoint))
    );
  }
  return sent;
}

/** 전체 회원 발송(경품 신규 등록 같은 공지성 푸시). */
export async function sendToAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<number> {
  const list = await all();
  const uids = Array.from(new Set(list.map((s) => s.uid)));
  let sent = 0;
  for (const uid of uids) sent += await sendTo(uid, payload);
  return sent;
}
