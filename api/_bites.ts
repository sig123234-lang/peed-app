import { getJSON, putJSON } from './_store';

// 바이트(스토리) — 서버 저장, 24시간 후 만료. 팔로우한 사람 + 나의 스토리를 본다.
export type ServerBite = {
  id: string;
  authorId: string;
  image: string; // 업로드된 URL (없으면 '' — 그라디언트 배경 텍스트 스토리)
  caption: string;
  overlays: any[];
  filter?: string;
  bg?: string[];
  audience: 'all' | 'close';
  createdAt: number;
};
const KEY = 'v2/bites.json';
const TTL = 24 * 60 * 60 * 1000;

export async function allBites(): Promise<ServerBite[]> {
  const b = await getJSON<ServerBite[]>(KEY, []);
  if (!Array.isArray(b)) return [];
  const now = Date.now();
  return b.filter((x) => x && typeof x.createdAt === 'number' && now - x.createdAt < TTL);
}

export async function addBite(
  authorId: string,
  input: Omit<ServerBite, 'id' | 'authorId' | 'createdAt'>
): Promise<ServerBite> {
  const list = await allBites(); // 만료된 건 정리하며 로드
  const bite: ServerBite = {
    ...input,
    id: `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    authorId,
    createdAt: Date.now(),
  };
  list.unshift(bite);
  await putJSON(KEY, list.slice(0, 20000));
  return bite;
}
