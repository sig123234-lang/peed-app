import { getJSON, putJSON } from './_store';

// 도장(동네 패스포트) — 유저별 수집한 동네 목록. 서버 저장(계정 귀속).
type Store = Record<string, string[]>;
const KEY = 'v2/stamps.json';

async function all(): Promise<Store> {
  const s = await getJSON<Store>(KEY, {} as Store);
  return s && typeof s === 'object' ? s : ({} as Store);
}

export async function stampsFor(uid: string): Promise<string[]> {
  const s = await all();
  return Array.isArray(s[uid]) ? s[uid] : [];
}

export async function addStamp(uid: string, name: string): Promise<string[]> {
  const clean = String(name || '').trim();
  const s = await all();
  const cur = new Set(Array.isArray(s[uid]) ? s[uid] : []);
  if (clean) cur.add(clean);
  s[uid] = Array.from(cur);
  await putJSON(KEY, s);
  return s[uid];
}
