import { getJSON, putJSON } from './_store';

// 팔로우 그래프 — a 가 b 를 팔로우한다는 방향성 엣지.
export type Edge = { a: string; b: string; at: number };
const KEY = 'v2/follows.json';

export async function allEdges(): Promise<Edge[]> {
  const e = await getJSON<Edge[]>(KEY, []);
  return Array.isArray(e) ? e : [];
}

async function save(e: Edge[]): Promise<void> {
  await putJSON(KEY, e.slice(0, 100000));
}

export async function follow(a: string, b: string): Promise<void> {
  if (!a || !b || a === b) return;
  const e = await allEdges();
  if (e.some((x) => x.a === a && x.b === b)) return;
  e.push({ a, b, at: Date.now() });
  await save(e);
}

export async function unfollow(a: string, b: string): Promise<void> {
  const e = await allEdges();
  const next = e.filter((x) => !(x.a === a && x.b === b));
  if (next.length !== e.length) await save(next);
}

export function followingIds(edges: Edge[], uid: string): string[] {
  return edges.filter((x) => x.a === uid).map((x) => x.b);
}

export function followerIds(edges: Edge[], uid: string): string[] {
  return edges.filter((x) => x.b === uid).map((x) => x.a);
}

export function followerCount(edges: Edge[], uid: string): number {
  return edges.reduce((n, x) => (x.b === uid ? n + 1 : n), 0);
}
