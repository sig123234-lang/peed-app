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
  // 사진 배치(확대·축소/이동/회전). x·y 는 캔버스 크기 대비 비율이라 화면
  // 크기가 달라도 올릴 때 잡은 구도 그대로 재현된다. 없으면 원본 비율 그대로.
  fit?: { scale: number; x: number; y: number; rotate?: number };
  audience: 'all' | 'close';
  createdAt: number;
  likes?: string[]; // 좋아요 누른 유저 id 들
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

/**
 * 내 스토리 고치기 — 올린 사람만.
 *
 * bg 는 항상 '뒤에 깔리는 배경'이고 image 는 그 위에 얹히는 사진이라 둘은
 * 공존한다(사진을 줄이면 배경이 드러난다). 사진을 없앨 때만 배치(fit)를 지운다.
 * createdAt 은 건드리지 않는다 — 만료 시각을 뒤로 미루는 편법이 되면 안 된다.
 */
// fit 은 세 가지 뜻을 구분해야 한다: 없음(=안 건드림) / null(=기본 구도로 되돌림)
// / 값(=그 구도로). undefined 하나로 뭉치면 확대를 원래대로 돌려놔도 예전 구도가
// 그대로 남는다.
export type BitePatch = Partial<
  Pick<ServerBite, 'image' | 'caption' | 'overlays' | 'filter' | 'bg' | 'audience'>
> & { fit?: ServerBite['fit'] | null };

export async function updateBite(
  id: string,
  authorId: string,
  patch: BitePatch
): Promise<ServerBite | null> {
  const list = await allBites();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0 || list[idx].authorId !== authorId) return null;
  const cur = list[idx];

  if (typeof patch.image === 'string') {
    cur.image = patch.image;
    if (!patch.image) cur.fit = undefined; // 사진이 없어졌으면 배치도 의미가 없다
  }
  if (typeof patch.caption === 'string') cur.caption = patch.caption.slice(0, 500);
  if (Array.isArray(patch.overlays)) cur.overlays = patch.overlays.slice(0, 40);
  if (typeof patch.filter === 'string') cur.filter = patch.filter;
  if (Array.isArray(patch.bg)) cur.bg = patch.bg;
  if (patch.fit !== undefined) cur.fit = patch.fit ?? undefined;
  if (patch.audience === 'all' || patch.audience === 'close') cur.audience = patch.audience;

  await putJSON(KEY, list);
  return cur;
}

/** 좋아요 토글 — 누구나 누를 수 있다. 돌려주는 값은 내 상태와 총 개수. */
export async function toggleLike(
  id: string,
  userId: string
): Promise<{ liked: boolean; count: number } | null> {
  if (!userId) return null;
  const list = await allBites();
  const bite = list.find((b) => b.id === id);
  if (!bite) return null;
  const likes = Array.isArray(bite.likes) ? bite.likes : [];
  const i = likes.indexOf(userId);
  if (i >= 0) likes.splice(i, 1);
  else likes.push(userId);
  bite.likes = likes;
  await putJSON(KEY, list);
  return { liked: i < 0, count: likes.length };
}

/** 내 바이트 지우기 — 올린 사람만. */
export async function removeBite(id: string, authorId: string): Promise<boolean> {
  const list = await allBites();
  const idx = list.findIndex((b) => b.id === id);
  if (idx < 0 || list[idx].authorId !== authorId) return false;
  list.splice(idx, 1);
  await putJSON(KEY, list);
  return true;
}
