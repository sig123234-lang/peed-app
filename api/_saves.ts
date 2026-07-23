import { getJSON, putJSON } from './_store';

// 저장(찜) — 유저별 저장한 postId 목록. 서버 저장(기기 바뀌어도 유지).
type Store = Record<string, string[]>;
const KEY = 'v2/saves.json';

async function all(): Promise<Store> {
  const s = await getJSON<Store>(KEY, {} as Store);
  return s && typeof s === 'object' ? s : ({} as Store);
}

export async function savedIds(uid: string): Promise<string[]> {
  const s = await all();
  return Array.isArray(s[uid]) ? s[uid] : [];
}

export async function setSaved(uid: string, postId: string, on: boolean): Promise<string[]> {
  const s = await all();
  const cur = new Set(Array.isArray(s[uid]) ? s[uid] : []);
  if (on) cur.add(postId);
  else cur.delete(postId);
  s[uid] = Array.from(cur);
  await putJSON(KEY, s);
  return s[uid];
}
