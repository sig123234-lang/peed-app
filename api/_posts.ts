import { getJSON, putJSON } from './_store';

// 서버에 저장되는 SNS 게시물(리뷰). 작성자 계정(authorId)에 귀속 → 진짜 멀티유저 피드.
export type ServerComment = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  ts: number;
};

export type ServerPost = {
  id: string;
  authorId: string;
  kind: string;
  store: string;
  category: string;
  location: string;
  image: string; // 대표 이미지 URL
  images: string[]; // 갤러리 URL
  rating: number;
  caption: string;
  tags: string[];
  people: number;
  price: number;
  isBurning: boolean;
  earnedPb: number;
  isPrivate: boolean;
  saveCount: number;
  comments: ServerComment[];
  createdAt: number;
};

const KEY = 'v2/posts.json';

export async function allPosts(): Promise<ServerPost[]> {
  const list = await getJSON<ServerPost[]>(KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function savePosts(list: ServerPost[]): Promise<void> {
  await putJSON(KEY, list.slice(0, 5000));
}

export async function createPost(
  authorId: string,
  input: Partial<ServerPost> & { images?: string[] }
): Promise<ServerPost> {
  const list = await allPosts();
  const images = Array.isArray(input.images) ? input.images.filter(Boolean).slice(0, 5) : [];
  const post: ServerPost = {
    id: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    authorId,
    kind: input.kind || 'eat',
    store: String(input.store || ''),
    category: String(input.category || ''),
    location: String(input.location || ''),
    image: images[0] || String(input.image || ''),
    images,
    rating: Number(input.rating) || 0,
    caption: String(input.caption || ''),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 10) : [],
    people: Number(input.people) || 1,
    price: Number(input.price) || 0,
    isBurning: !!input.isBurning,
    earnedPb: Number(input.earnedPb) || 0,
    isPrivate: !!input.isPrivate,
    saveCount: 0,
    comments: [],
    createdAt: Date.now(),
  };
  list.unshift(post);
  await savePosts(list);
  return post;
}

export async function updatePost(
  id: string,
  authorId: string,
  patch: { caption?: string; isPrivate?: boolean }
): Promise<ServerPost | null> {
  const list = await allPosts();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0 || list[idx].authorId !== authorId) return null;
  if (typeof patch.caption === 'string') list[idx].caption = patch.caption.slice(0, 2000);
  if (typeof patch.isPrivate === 'boolean') list[idx].isPrivate = patch.isPrivate;
  await savePosts(list);
  return list[idx];
}

export async function removePost(id: string, authorId: string): Promise<boolean> {
  const list = await allPosts();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0 || list[idx].authorId !== authorId) return false;
  list.splice(idx, 1);
  await savePosts(list);
  return true;
}

export async function incSaveCount(id: string, delta: number): Promise<void> {
  const list = await allPosts();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return;
  list[idx].saveCount = Math.max(0, (list[idx].saveCount || 0) + delta);
  await savePosts(list);
}

export async function addComment(id: string, comment: ServerComment): Promise<ServerPost | null> {
  const list = await allPosts();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx].comments = [...(list[idx].comments || []), comment].slice(-200);
  await savePosts(list);
  return list[idx];
}

/** 댓글 수정 — 작성자 본인만. */
export async function editComment(
  postId: string,
  commentId: string,
  userId: string,
  text: string
): Promise<{ post: ServerPost; comment: ServerComment } | null> {
  const list = await allPosts();
  const idx = list.findIndex((p) => p.id === postId);
  if (idx < 0) return null;
  const c = (list[idx].comments || []).find((x) => x.id === commentId);
  if (!c || c.userId !== userId) return null;
  c.text = String(text || '').slice(0, 500);
  await savePosts(list);
  return { post: list[idx], comment: c };
}

/** 댓글 삭제 — 작성자 본인 또는 게시물 주인. */
export async function removeComment(
  postId: string,
  commentId: string,
  userId: string
): Promise<ServerPost | null> {
  const list = await allPosts();
  const idx = list.findIndex((p) => p.id === postId);
  if (idx < 0) return null;
  const post = list[idx];
  const c = (post.comments || []).find((x) => x.id === commentId);
  if (!c) return null;
  if (c.userId !== userId && post.authorId !== userId) return null;
  post.comments = (post.comments || []).filter((x) => x.id !== commentId);
  await savePosts(list);
  return post;
}
