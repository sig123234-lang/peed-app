import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

// Bump the version in this key whenever the seed data changes, so already-saved
// clients drop stale content. v4 = 실사용 전환(데모 게시물 전량 제거).
const FEED_KEY = 'PEED_FEED_v4';

// Bites = Instagram-story-style quick photo posts. Ephemeral: they vanish 24h
// after upload (pruned on load). No PB — reviews are the only thing that earns.
const BITES_KEY = 'PEED_BITES_v2';
const BITE_TTL = 24 * 60 * 60 * 1000; // 24h in ms

// The social graph of PEED — the 먹스타그램 feed. A "review" is a post. Posts use
// real Mapo-gu (마포구) spots; photos/avatars are verified Unsplash stock shots.

export type FeedKind = 'eat' | 'drink' | 'play' | 'enjoy';

export type FeedUser = {
  id: string;
  name: string;
  handle: string;
  avatar: any;
  isMe?: boolean;
  isFollowing?: boolean;
};

export type FeedComment = {
  id: string;
  userName: string;
  text: string;
};

export type Post = {
  id: string;
  author: FeedUser;
  kind: FeedKind;
  store: string;
  category: string;
  location: string;
  image: any;
  rating: number;
  caption: string;
  tags: string[];
  people: number;
  price: number;
  saved: boolean;
  saveCount: number;
  comments: FeedComment[];
  timeLabel: string;
  isBurning: boolean;
  earnedPb: number;
  isPrivate?: boolean; // 비공개 = 홈 피드엔 안 보이고 내 프로필에만
};

// A draggable decoration placed on a story (Instagram-style). Position is stored
// as a 0..1 fraction of the canvas so it renders identically at any size.
export type BiteOverlay = {
  id: string;
  kind: 'text' | 'emoji';
  value: string;
  x: number; // 0..1 (center)
  y: number; // 0..1 (center)
  color?: string; // text color
  size?: number; // font size
  font?: string; // BITE_FONTS key
  align?: 'left' | 'center' | 'right';
  highlight?: boolean; // colored background behind text (IG-style)
};

export type Bite = {
  id: string;
  author: FeedUser;
  image?: any; // omitted for text-only (gradient background) stories
  caption: string;
  overlays?: BiteOverlay[];
  filter?: string; // filter preset key (see biteStyles)
  bg?: string[]; // gradient stops for a photo-less story
  audience?: 'all' | 'close'; // 전체 공개 / 친한 친구
  createdAt: number; // ms epoch — used for the 24h expiry
};

/** Won formatter without relying on Intl (Hermes-safe). */
export const won = (n: number) =>
  `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

// 도장깨기 board — shared so the review flow and the passport agree.
export const STAMP_DISTRICT = '마포구';
export const STAMP_BOARD = [
  '홍대',
  '연남',
  '상수',
  '합정',
  '망원',
  '성산',
  '서교',
];

/** Find a stamp-board neighborhood mentioned in free text (store/caption). */
export const detectNeighborhood = (text: string) =>
  STAMP_BOARD.find((n) => text.includes(n)) ?? '';

// 기본 아바타 = 이름 이니셜을 브랜드색 원 안에 그린 SVG(스톡 사진 X). 아바타가
// 없으면 어디서든 이 값을 쓴다.
const AVATAR_BG = '#6275D8';
export function initialAvatar(name?: string): { uri: string } {
  const ch = (name || '').trim().charAt(0).toUpperCase() || '·';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='60' fill='${AVATAR_BG}'/><text x='50%' y='50%' dy='.35em' text-anchor='middle' font-family='Arial, sans-serif' font-size='54' fill='#ffffff'>${ch}</text></svg>`;
  return { uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}
// 서버 아바타(URL 문자열) → 이미지 소스. 없으면 이니셜 아바타.
function avatarSource(url: string | undefined, name?: string): any {
  return url ? { uri: url } : initialAvatar(name);
}

// 로그인 전 기본 프로필 — 로그인하면 실제 카카오/네이버/구글 프로필로 교체된다.
const DEFAULT_ME: FeedUser = {
  id: 'me',
  name: '나',
  handle: '@me',
  avatar: initialAvatar('나'),
  isMe: true,
};

// 서버 게시물(공개 피드/유저 게시물) → 클라이언트 Post 형태.
function mapServerPost(sp: any, meId: string): Post {
  const authorId = sp.author?.id || '';
  return {
    id: sp.id,
    author: {
      id: authorId,
      name: sp.author?.name || 'PEED 유저',
      handle: sp.author?.handle || '@peed',
      avatar: avatarSource(sp.author?.avatar, sp.author?.name),
      isMe: !!meId && authorId === meId,
    },
    kind: (sp.kind as FeedKind) || 'eat',
    store: sp.store || '',
    category: sp.category || '',
    location: sp.location || '',
    image: sp.image ? { uri: sp.image } : initialAvatar(sp.store),
    rating: Number(sp.rating) || 0,
    caption: sp.caption || '',
    tags: Array.isArray(sp.tags) ? sp.tags : [],
    people: Number(sp.people) || 1,
    price: Number(sp.price) || 0,
    saved: false,
    saveCount: Number(sp.saveCount) || 0,
    comments: Array.isArray(sp.comments)
      ? sp.comments.map((c: any) => ({ id: c.id, userName: c.userName, text: c.text }))
      : [],
    timeLabel: sp.timeLabel || '방금',
    isBurning: !!sp.isBurning,
    earnedPb: Number(sp.earnedPb) || 0,
    isPrivate: !!sp.isPrivate,
  };
}

// 서버 바이트(스토리) → 클라이언트 Bite 형태.
function mapServerBite(sb: any): Bite {
  return {
    id: sb.id,
    author: {
      id: sb.author?.id || '',
      name: sb.author?.name || 'PEED 유저',
      handle: sb.author?.handle || '@peed',
      avatar: avatarSource(sb.author?.avatar, sb.author?.name),
      isMe: !!sb.isMe,
    },
    image: sb.image ? { uri: sb.image } : undefined,
    caption: sb.caption || '',
    overlays: Array.isArray(sb.overlays) ? sb.overlays : [],
    filter: sb.filter,
    bg: sb.bg,
    audience: sb.audience === 'close' ? 'close' : 'all',
    createdAt: Number(sb.createdAt) || Date.now(),
  };
}

type FeedContextValue = {
  me: FeedUser;
  posts: Post[];
  myPosts: Post[]; // 내 게시물(비공개 포함) — 프로필 그리드용
  refreshFeed: () => void;
  refreshMyPosts: () => void;
  updateMe: (patch: { name?: string; handle?: string }) => void; // 프로필 편집 즉시 반영
  followCounts: { followers: number; following: number };
  bites: Bite[];
  addBite: (input: {
    image?: any;
    caption: string;
    overlays?: BiteOverlay[];
    filter?: string;
    bg?: string[];
    audience?: 'all' | 'close';
  }) => void;
  stamps: string[];
  collectStamp: (neighborhood: string) => void;
  toggleSave: (postId: string) => void;
  toggleFollow: (userId: string) => void;
  addComment: (postId: string, text: string) => void;
  editPost: (postId: string, patch: { caption?: string; isPrivate?: boolean }) => void;
  deletePost: (postId: string) => void;
  profileAvatar: string | null;
  setProfileAvatar: (uri: string | null) => void;
  addPost: (input: {
    store: string;
    kind?: FeedKind;
    category?: string;
    location?: string;
    image: any;
    rating: number;
    caption: string;
    tags?: string[];
    people?: number;
    price?: number;
    isBurning?: boolean;
    earnedPb?: number;
    isPrivate?: boolean;
  }) => void;
};

const FeedContext = createContext<FeedContextValue | undefined>(undefined);

let biteSeq = 0;
let commentSeq = 0;

// 웹: 사진 uri(blob:/http/data) → 다운스케일 JPEG data URL(업로드용). 네이티브/실패 시 ''.
export async function imageUriToDataUrl(uri: string, max = 1280): Promise<string> {
  if (!uri) return '';
  if (uri.startsWith('data:')) return uri;
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  return new Promise((resolve) => {
    try {
      const img = new (window as any).Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const scale = Math.min(1, max / Math.max(w, h || 1));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve('');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = uri;
    } catch {
      resolve('');
    }
  });
}

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followCounts, setFollowCounts] = useState<{ followers: number; following: number }>({
    followers: 0,
    following: 0,
  });
  const followingRef = useRef<string[]>([]);
  useEffect(() => {
    followingRef.current = followingIds;
  }, [followingIds]);
  const [bites, setBites] = useState<Bite[]>([]);
  const [stamps, setStamps] = useState<string[]>([]);
  // 내 프로필 사진 — 마이 편집 + 홈 바이트 카드 등 앱 전체가 같은 값을 공유.
  const [profileAvatar, setProfileAvatarState] = useState<string | null>(null);
  // 로그인한 실제 사용자 — 로컬에 브릿지된 프로필(SessionSync)에서 하이드레이트.
  const [meBase, setMeBase] = useState<FeedUser>(DEFAULT_ME);

  useEffect(() => {
    AsyncStorage.getItem('PROFILE_AVATAR')
      .then((v) => {
        if (v) setProfileAvatarState(v);
      })
      .catch(() => {});
  }, []);

  // 프로필 사진이 있으면 me.avatar 에 반영 → 홈/우측바/새 글 작성자 모두 동기화.
  const me = useMemo<FeedUser>(
    () => (profileAvatar ? { ...meBase, avatar: { uri: profileAvatar } } : meBase),
    [meBase, profileAvatar]
  );
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // 서버에서 공개 피드 로드.
  const refreshFeed = useCallback(async (meId?: string) => {
    const id = meId ?? meRef.current.id;
    try {
      const r = await fetch('/api/public?action=feed');
      const d = await r.json();
      if (Array.isArray(d?.posts)) setPosts(d.posts.map((sp: any) => mapServerPost(sp, id)));
    } catch {
      // ignore
    }
  }, []);

  // 서버에서 내 게시물(비공개 포함) 로드.
  const refreshMyPosts = useCallback(async (meId?: string) => {
    const id = meId ?? meRef.current.id;
    if (!id || id === 'me') {
      setMyPosts([]);
      return;
    }
    try {
      const r = await fetch(`/api/public?action=userPosts&uid=${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      const d = await r.json();
      if (Array.isArray(d?.posts)) setMyPosts(d.posts.map((sp: any) => mapServerPost(sp, id)));
    } catch {
      // ignore
    }
  }, []);

  // 내 팔로잉 목록 + 팔로워/팔로잉 수(서버).
  const refreshFollow = useCallback(async (meId?: string) => {
    const id = meId ?? meRef.current.id;
    if (!id || id === 'me') {
      setFollowingIds([]);
      setFollowCounts({ followers: 0, following: 0 });
      return;
    }
    try {
      const r = await fetch(`/api/public?action=followInfo&uid=${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      const d = await r.json();
      if (d?.ok) {
        setFollowingIds(Array.isArray(d.followingIds) ? d.followingIds : []);
        setFollowCounts({
          followers: Number(d.counts?.followers) || 0,
          following: Number(d.counts?.following) || 0,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // 서버에서 스토리(바이트) 로드.
  const refreshBites = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const r = await fetch('/api/public?action=bites', { credentials: 'include' });
      const d = await r.json();
      if (Array.isArray(d?.bites)) setBites(d.bites.map(mapServerBite));
    } catch {
      // ignore
    }
  }, []);

  // 서버에서 도장(패스포트) 로드.
  const refreshStamps = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const r = await fetch('/api/public?action=stamps', { credentials: 'include' });
      const d = await r.json();
      if (Array.isArray(d?.stamps)) setStamps(d.stamps);
    } catch {
      // ignore
    }
  }, []);

  // 로그인 유저(서버 프로필) + 서버 게시물/팔로우 로드.
  useEffect(() => {
    let uid = meRef.current.id;
    (async () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const r = await fetch('/api/auth?action=me', { credentials: 'include' });
          const d = await r.json();
          if (d?.user?.id) {
            const u = d.user;
            uid = u.id;
            setMeBase({
              id: u.id,
              name: u.name || '나',
              handle: u.handle || '@me',
              avatar: avatarSource(u.avatar, u.name),
              isMe: true,
            });
          }
        } catch {
          // ignore
        }
      }
      await refreshFeed(uid);
      await refreshMyPosts(uid);
      await refreshFollow(uid);
      await refreshBites();
      await refreshStamps();
    })();
  }, [refreshFeed, refreshMyPosts, refreshFollow, refreshBites, refreshStamps]);

  const setProfileAvatar = useCallback((uri: string | null) => {
    setProfileAvatarState(uri);
    if (uri) AsyncStorage.setItem('PROFILE_AVATAR', uri).catch(() => {});
    else AsyncStorage.removeItem('PROFILE_AVATAR').catch(() => {});
  }, []);

  // 프로필 편집 즉시 반영(이름/아이디) — 새 글 작성자·우측바 등에 바로 적용.
  const updateMe = useCallback((patch: { name?: string; handle?: string }) => {
    setMeBase((prev) => ({
      ...prev,
      name: patch.name ?? prev.name,
      handle: patch.handle ?? prev.handle,
    }));
  }, []);

  // 도장 수집 — 낙관적 반영 + 서버 저장(계정 귀속).
  const collectStamp = useCallback((neighborhood: string) => {
    const name = neighborhood.trim();
    if (!name) return;
    setStamps((prev) => (prev.includes(name) ? prev : [...prev, name]));
    if (Platform.OS === 'web') {
      fetch('/api/public?action=collectStamp', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(() => {});
    }
  }, []);

  const toggleSave = useCallback(
    (postId: string) => {
      const cur = posts.find((p) => p.id === postId);
      const nextOn = cur ? !cur.saved : true;
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, saved: nextOn, saveCount: Math.max(0, p.saveCount + (nextOn ? 1 : -1)) }
            : p
        )
      );
      fetch('/api/public?action=savePost', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, on: nextOn }),
      }).catch(() => {});
    },
    [posts]
  );

  const toggleFollow = useCallback((userId: string) => {
    if (!userId || userId === meRef.current.id) return;
    const isF = followingRef.current.includes(userId);
    // 낙관적 반영
    setFollowingIds((prev) => (isF ? prev.filter((x) => x !== userId) : [...prev, userId]));
    setFollowCounts((prev) => ({
      ...prev,
      following: Math.max(0, prev.following + (isF ? -1 : 1)),
    }));
    fetch(`/api/public?action=${isF ? 'unfollow' : 'follow'}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: userId }),
    }).catch(() => {});
  }, []);

  const editPost = useCallback(
    (postId: string, patch: { caption?: string; isPrivate?: boolean }) => {
      // 낙관적 반영
      const apply = (p: Post) => (p.id === postId ? { ...p, ...patch } : p);
      setPosts((prev) => prev.map(apply));
      setMyPosts((prev) => prev.map(apply));
      fetch('/api/public?action=editPost', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId, ...patch }),
      })
        .then(() => {
          // 공개/비공개가 바뀌면 피드 노출이 달라지므로 재조회.
          if (typeof patch.isPrivate === 'boolean') refreshFeed();
        })
        .catch(() => {});
    },
    [refreshFeed]
  );

  const deletePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setMyPosts((prev) => prev.filter((p) => p.id !== postId));
    fetch('/api/public?action=deletePost', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId }),
    }).catch(() => {});
  }, []);

  const addComment = useCallback((postId: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    commentSeq += 1;
    const c = { id: `uc${commentSeq}`, userName: meRef.current.name, text: t };
    const apply = (p: Post) =>
      p.id === postId ? { ...p, comments: [...p.comments, c] } : p;
    setPosts((prev) => prev.map(apply));
    setMyPosts((prev) => prev.map(apply));
    fetch('/api/public?action=comment', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: postId, text: t }),
    }).catch(() => {});
  }, []);

  const addPost = useCallback<FeedContextValue['addPost']>(
    (input) => {
      const uid = meRef.current.id;
      const localUri: string = input.image?.uri || '';
      // 낙관적: 로컬 사진으로 즉시 표시(공개면 홈 피드에도).
      const optimistic: Post = {
        id: `tmp_${Date.now().toString(36)}`,
        author: meRef.current,
        kind: input.kind ?? 'eat',
        store: input.store,
        category: input.category ?? '',
        location: input.location ?? '',
        image: input.image,
        rating: input.rating,
        caption: input.caption,
        tags: input.tags ?? [],
        people: input.people ?? 1,
        price: input.price ?? 0,
        saved: false,
        saveCount: 0,
        comments: [],
        timeLabel: '방금',
        isBurning: input.isBurning ?? false,
        earnedPb: input.earnedPb ?? 0,
        isPrivate: input.isPrivate ?? false,
      };
      setMyPosts((prev) => [optimistic, ...prev]);
      if (!optimistic.isPrivate) setPosts((prev) => [optimistic, ...prev]);

      // 비로그인(둘러보기)은 서버 저장 없이 로컬 표시만.
      if (!uid || uid === 'me' || Platform.OS !== 'web') return;

      (async () => {
        try {
          const dataUrl = await imageUriToDataUrl(localUri);
          const r = await fetch('/api/public?action=createPost', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store: input.store,
              kind: input.kind ?? 'eat',
              category: input.category ?? '',
              location: input.location ?? '',
              images: dataUrl ? [dataUrl] : [],
              rating: input.rating,
              caption: input.caption,
              tags: input.tags ?? [],
              people: input.people ?? 1,
              price: input.price ?? 0,
              isBurning: input.isBurning ?? false,
              earnedPb: input.earnedPb ?? 0,
              isPrivate: input.isPrivate ?? false,
            }),
          });
          const d = await r.json();
          // 서버 저장 성공/실패와 무관하게 canonical 재조회로 낙관적 항목 정리.
          await refreshMyPosts(uid);
          if (d?.post && !d.post.isPrivate) await refreshFeed(uid);
        } catch {
          // 실패해도 낙관적 항목은 유지(다음 새로고침 때 정리).
        }
      })();
    },
    [refreshFeed, refreshMyPosts]
  );

  const addBite = useCallback<FeedContextValue['addBite']>(
    (input) => {
      biteSeq += 1;
      // 낙관적: 로컬 이미지로 즉시 표시.
      const optimistic: Bite = {
        id: `tmp_b${biteSeq}`,
        author: meRef.current,
        image: input.image,
        caption: input.caption,
        overlays: input.overlays ?? [],
        filter: input.filter,
        bg: input.bg,
        audience: input.audience ?? 'all',
        createdAt: Date.now(),
      };
      setBites((prev) => [optimistic, ...prev]);
      if (Platform.OS !== 'web') return;
      (async () => {
        try {
          const localUri: string = input.image?.uri || '';
          const dataUrl = localUri ? await imageUriToDataUrl(localUri) : '';
          await fetch('/api/public?action=createBite', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: dataUrl,
              caption: input.caption,
              overlays: input.overlays ?? [],
              filter: input.filter,
              bg: input.bg,
              audience: input.audience ?? 'all',
            }),
          });
          await refreshBites();
        } catch {
          // 실패해도 낙관적 항목 유지
        }
      })();
    },
    [refreshBites]
  );

  // 팔로우 상태를 서버 followingIds 기준으로 각 게시물 작성자에 반영.
  const postsView = useMemo(() => {
    const set = new Set(followingIds);
    return posts.map((p) =>
      p.author.isMe ? p : { ...p, author: { ...p.author, isFollowing: set.has(p.author.id) } }
    );
  }, [posts, followingIds]);

  const value = useMemo(
    () => ({
      me,
      posts: postsView,
      myPosts,
      refreshFeed,
      refreshMyPosts,
      updateMe,
      followCounts,
      bites,
      addBite,
      stamps,
      collectStamp,
      toggleSave,
      toggleFollow,
      addComment,
      editPost,
      deletePost,
      addPost,
      profileAvatar,
      setProfileAvatar,
    }),
    [me, postsView, myPosts, refreshFeed, refreshMyPosts, updateMe, followCounts, bites, addBite, stamps, collectStamp, toggleSave, toggleFollow, addComment, editPost, deletePost, addPost, profileAvatar, setProfileAvatar]
  );

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed() {
  const ctx = useContext(FeedContext);
  if (!ctx) {
    throw new Error('useFeed는 FeedProvider 안에서만 사용할 수 있어요.');
  }
  return ctx;
}
