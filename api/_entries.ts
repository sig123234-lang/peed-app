import { getJSON, putJSON } from './_store';

// 경품 응모 내역 — 유저별 productId 응모 수. 서버 저장(진짜 응모).
export type Entry = { id: string; uid: string; productId: string; count: number; ts: number };
const KEY = 'v2/entries.json';

export async function allEntries(): Promise<Entry[]> {
  const e = await getJSON<Entry[]>(KEY, []);
  return Array.isArray(e) ? e : [];
}

export async function addEntry(uid: string, productId: string, count: number): Promise<void> {
  const e = await allEntries();
  e.unshift({
    id: `en_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    uid,
    productId,
    count: Math.max(1, Math.round(count)),
    ts: Date.now(),
  });
  await putJSON(KEY, e.slice(0, 100000));
}

// 유저의 productId별 누적 응모 수.
export async function myCounts(uid: string): Promise<Record<string, number>> {
  const e = await allEntries();
  const out: Record<string, number> = {};
  for (const x of e) if (x.uid === uid) out[x.productId] = (out[x.productId] || 0) + x.count;
  return out;
}

// 전체 productId별 총 응모 수.
export async function totals(): Promise<Record<string, number>> {
  const e = await allEntries();
  const out: Record<string, number> = {};
  for (const x of e) out[x.productId] = (out[x.productId] || 0) + x.count;
  return out;
}
