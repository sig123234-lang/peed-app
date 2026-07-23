import { notify } from './_notifs';
import { getJSON, putJSON } from './_store';

/* 자동 추첨 — 상품의 발표일(announcementDate)이 되면 서버가 스스로 추첨한다.
   관리자가 상태를 손으로 바꾸지 않아도 되고, 추첨을 잊어도 발표일이 지켜진다.

   당첨 확률은 '실제 응모 횟수' 에 비례한다(v2/entries.json).
   보유 PB로 추정하던 옛 방식은 응모할수록 PB가 줄어 오히려 불리해졌다. */

const PRODUCTS = 'v2/products.json';
const ENTRIES = 'v2/entries.json';
const SHIPMENTS = 'v2/shipments.json';
const USERS = 'v2/users.json';

function todayStr(): string {
  // 서버가 UTC 로 돌아도 한국 날짜로 판단해야 발표일이 어긋나지 않는다.
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/* 발표일을 'YYYY-MM-DD' 로 정규화한다.
   관리자가 실제로 쓰는 표기를 넉넉히 받는다 — '2026-08-02', '2026.8.2',
   '2026년 8월 2일', '8월 2일', '8/2'.
   연도가 없으면 올해로 보되, 이미 지난 날짜면 내년으로 본다('8월 2일' 을
   내년 발표로 적어둔 경우 오늘 바로 추첨되는 사고를 막는다). */
export function parseAnnounceDate(v: any, today = todayStr()): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const pad = (n: string) => n.padStart(2, '0');

  let y: string | null = null;
  let mo: string | null = null;
  let d: string | null = null;

  let m = s.match(/^(\d{4})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})\s*일?$/);
  if (m) [, y, mo, d] = m;
  if (!y) {
    m = s.match(/^(\d{1,2})\s*[-.\/월]\s*(\d{1,2})\s*일?$/);
    if (m) [, mo, d] = m;
  }
  if (!mo || !d) return null;

  const mi = Number(mo);
  const di = Number(d);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;

  if (!y) {
    const thisYear = today.slice(0, 4);
    const cand = `${thisYear}-${pad(mo)}-${pad(d)}`;
    // 연도 없이 적은 날짜가 이미 지났으면 내년 것으로 해석한다.
    y = cand < today ? String(Number(thisYear) + 1) : thisYear;
  }
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const asDate = parseAnnounceDate;

/** 응모 횟수만큼 티켓을 넣고 뽑는 가중 추첨. 같은 사람이 중복 당첨되지 않는다. */
function pickWinners(counts: Record<string, number>, n: number, exclude: Set<string>): string[] {
  let pool: string[] = [];
  for (const [uid, c] of Object.entries(counts)) {
    if (exclude.has(uid)) continue;
    for (let i = 0; i < c; i++) pool.push(uid);
  }
  const picked: string[] = [];
  while (picked.length < n && pool.length) {
    const uid = pool[Math.floor(Math.random() * pool.length)];
    picked.push(uid);
    pool = pool.filter((x) => x !== uid); // 중복 당첨 방지
  }
  return picked;
}

export type DrawResult = { productId: string; name: string; winners: number };

/**
 * 발표일이 오늘이거나 지났는데 아직 추첨하지 않은 상품을 모두 추첨한다.
 * 여러 번 불려도 안전하다(이미 추첨한 상품은 건너뛴다).
 */
export async function runDueDraws(): Promise<DrawResult[]> {
  const products = await getJSON<any[]>(PRODUCTS, []);
  if (!products.length) return [];

  const today = todayStr();
  const due = products.filter((p) => {
    if (!p || p.drawnAt) return false;
    if ((p.winnersList || []).length) return false;
    const d = asDate(p.announcementDate);
    return !!d && d <= today;
  });
  if (!due.length) return [];

  const [entries, users, shipments] = await Promise.all([
    getJSON<any[]>(ENTRIES, []),
    getJSON<any[]>(USERS, []),
    getJSON<any[]>(SHIPMENTS, []),
  ]);
  const userById: Record<string, any> = {};
  for (const u of users) userById[String(u?.id || '')] = u;

  // 이미 다른 상품에 당첨된 사람은 제외해 당첨을 고르게 분배한다.
  const alreadyWon = new Set<string>();
  for (const p of products) for (const w of p.winnersList || []) alreadyWon.add(String(w?.id || ''));

  const results: DrawResult[] = [];
  const newShipments: any[] = [];

  for (const p of due) {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      if (!e || e.productId !== p.id) continue;
      const uid = String(e.uid || '');
      if (!uid) continue;
      counts[uid] = (counts[uid] || 0) + (Number(e.count) || 0);
    }

    const n = Math.max(1, Number(p.winners) || 1);
    const picked = pickWinners(counts, n, alreadyWon);

    // 응모자가 없으면 당첨자 없이 마감한다(상품이 영원히 열려 있지 않게).
    p.winnersList = picked.map((uid) => ({
      id: uid,
      name: userById[uid]?.name || '',
      handle: userById[uid]?.handle || '',
      pb: Number(userById[uid]?.pb) || 0,
      date: today,
    }));
    p.drawnAt = today;
    p.status = 'ended';
    p.autoDrawn = true;

    for (const uid of picked) {
      alreadyWon.add(uid);
      newShipments.push({
        id: `shipments_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        productId: p.id,
        winnerId: uid,
        product: p.name || '',
        image: p.image || '',
        winnerName: userById[uid]?.name || '',
        method: p.method || '택배 배송',
        address: '',
        contact: userById[uid]?.handle || '',
        tracking: '',
        serial: '',
        pickupPlace: '',
        reviewed: '미작성',
        status: '준비',
        createdAt: Date.now(),
      });
    }

    results.push({ productId: p.id, name: p.name || '', winners: picked.length });
  }

  await putJSON(PRODUCTS, products);
  if (newShipments.length) await putJSON(SHIPMENTS, [...newShipments, ...shipments]);

  // 저장이 끝난 뒤에 알린다(저장 실패 시 헛알림 방지).
  for (const r of results) {
    const p = products.find((x) => x.id === r.productId);
    for (const w of p?.winnersList || []) {
      await notify(String(w.id), {
        type: 'raffle',
        title: '🎉 경품에 당첨되셨어요!',
        body: `'${r.name}' 에 당첨되셨습니다. 마이 > 당첨 탭에서 확인해 주세요.`,
      });
    }
  }
  return results;
}
