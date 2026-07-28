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
  userId?: string; // 작성자 프로필로 이동 + 멘션 탭용
  userName: string;
  text: string;
  ts?: number; // 상대시간 표시용
  avatar?: any; // 작성자 프로필 사진(URL 문자열 또는 이미지 소스)
  handle?: string;
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

// 컴포저에서 사진을 배치한 결과 — 확대/축소, 이동, 회전.
//
// 사진은 프레임에 갇힌 배경이 아니라 배경 위에 얹힌 '물체'다. 원본 비율 그대로
// (contain) 깔린 상태를 scale 1 로 보고, 줄이면 뒤 배경이 드러나고 키우면
// 프레임 밖으로 넘친다. x·y 는 캔버스 크기로 나눈 비율이라 뷰어 크기가 달라도
// 같은 구도로 재현된다(픽셀로 저장하면 화면마다 어긋난다). rotate 는 도(0~360).
export type BiteImageFit = {
  scale: number;
  x: number;
  y: number;
  rotate?: number;
};

export type Bite = {
  id: string;
  author: FeedUser;
  image?: any; // omitted for text-only (gradient background) stories
  caption: string;
  overlays?: BiteOverlay[];
  filter?: string; // filter preset key (see biteStyles)
  bg?: string[]; // gradient stops for a photo-less story
  fit?: BiteImageFit; // 사진 구도(확대/이동) — 없으면 원본을 꽉 채움
  audience?: 'all' | 'close'; // 전체 공개 / 친한 친구
  createdAt: number; // ms epoch — used for the 24h expiry
  likeCount?: number; // 좋아요 수
  liked?: boolean; // 내가 좋아요 눌렀는지
};

/** Won formatter without relying on Intl (Hermes-safe). */
export const won = (n: number) =>
  `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

// 도장 패스포트 — 고른 지역의 서로 다른 매장에 리뷰를 남길 때마다 도장이
// 하나씩 찍힌다. 목표 개수를 채우면 보너스 PB 를 받고 지역을 다시 고른다.
// 실제 계산은 서버(api/_passport.ts)가 하고, 여기서는 그 상태를 받아 둔다.
export type Passport = {
  region: string; // 진행 중인 지역 키(예: "경기 고양시 덕양구"). 비면 미선택.
  stores: string[]; // 이번 지역에서 도장 찍은 매장명
  completed: number; // 완주 횟수
  history: string[]; // 완주한 지역들
};

export const EMPTY_PASSPORT: Passport = {
  region: '',
  stores: [],
  completed: 0,
  history: [],
};

export function normalizePassport(p: any): Passport {
  return {
    region: String(p?.region || ''),
    stores: Array.isArray(p?.stores) ? p.stores.map(String) : [],
    completed: Number(p?.completed) || 0,
    history: Array.isArray(p?.history) ? p.history.map(String) : [],
  };
}

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
    // 이용 사진이 없으면 비워 둔다. 예전엔 이니셜 아바타를 대신 넣었는데,
    // 원형 아바타가 카드 폭으로 늘어나 보기 흉했다. 화면 쪽에서 글자 카드로 그린다.
    image: sp.image ? { uri: sp.image } : null,
    rating: Number(sp.rating) || 0,
    caption: sp.caption || '',
    tags: Array.isArray(sp.tags) ? sp.tags : [],
    people: Number(sp.people) || 1,
    price: Number(sp.price) || 0,
    saved: false,
    saveCount: Number(sp.saveCount) || 0,
    comments: Array.isArray(sp.comments)
      ? sp.comments.map((c: any) => ({
          id: c.id,
          userId: c.userId,
          userName: c.userName,
          text: c.text,
          ts: c.ts,
          avatar: c.avatar || '',
          handle: c.handle || '',
        }))
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
    fit: sb.fit
      ? {
          scale: Number(sb.fit.scale) || 1,
          x: Number(sb.fit.x) || 0,
          y: Number(sb.fit.y) || 0,
          rotate: Number(sb.fit.rotate) || 0,
        }
      : undefined,
    audience: sb.audience === 'close' ? 'close' : 'all',
    createdAt: Number(sb.createdAt) || Date.now(),
    likeCount: Number(sb.likeCount) || 0,
    liked: !!sb.liked,
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
    fit?: BiteImageFit;
    audience?: 'all' | 'close';
  }) => void;
  // 내 스토리 수정/삭제. 수정은 보낸 항목만 반영되고, fit 에 null 을 주면
  // 사진 구도를 기본으로 되돌린다.
  editBite: (
    biteId: string,
    patch: {
      image?: any;
      caption?: string;
      overlays?: BiteOverlay[];
      filter?: string;
      bg?: string[];
      fit?: BiteImageFit | null;
      audience?: 'all' | 'close';
    }
  ) => void;
  deleteBite: (biteId: string) => void;
  toggleBiteLike: (biteId: string) => void;
  passport: Passport;
  passportGoal: number;
  passportReward: number;
  pickRegion: (regionKey: string) => Promise<void>;
  refreshPassport: () => Promise<void>;
  toggleSave: (postId: string) => void;
  toggleFollow: (userId: string) => void;
  addComment: (postId: string, text: string) => void;
  editComment: (postId: string, commentId: string, text: string) => void;
  deleteComment: (postId: string, commentId: string) => void;
  editPost: (postId: string, patch: { caption?: string; isPrivate?: boolean }) => void;
  deletePost: (postId: string) => void;
  profileAvatar: string | null;
  setProfileAvatar: (uri: string | null) => void;
  addPost: (input: {
    store: string;
    kind?: FeedKind;
    category?: string;
    location?: string;
    // 이용 사진은 선택이다. 없으면 홈 피드에는 안 뜨고 프로필에서만 보인다.
    image?: any;
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

// 캔버스로 줄여 담기 — 실패하면 ''(호출부가 원본 그대로 올리는 길로 넘어간다).
function downscaleToDataUrl(uri: string, max: number): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new (window as any).Image();
      // crossOrigin 은 원격 이미지에만 필요하다. blob:/같은 출처에까지 붙이면
      // 브라우저에 따라 로드 자체가 막혀 사진이 통째로 사라진다.
      if (/^https?:/i.test(uri)) img.crossOrigin = 'anonymous';
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

// 원본 바이트를 그대로 data URL 로 — 브라우저가 그림을 못 그려도(디코딩 실패
// 등) 파일 자체는 읽을 수 있다. 프로필 사진이 쓰던 방식과 같다.
function rawToDataUrl(uri: string): Promise<string> {
  return fetch(uri)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => resolve('');
          fr.readAsDataURL(blob);
        })
    )
    .catch(() => '');
}

// 웹: 사진 uri(blob:/http/data) → 업로드용 data URL. 네이티브/실패 시 ''.
//
// 웹 파일선택기는 data: 가 아니라 blob: URL 을 준다. 예전에는 캔버스로 줄이는
// 길 하나뿐이라 그게 실패하면 그대로 '' 이 되고, 호출부는 사진 없는 글/스토리를
// 서버에 만들어버렸다(올린 사진이 조용히 사라짐). 이제 캔버스가 실패하면 원본을
// 그대로 올리는 길로 물러선다 — 용량은 커져도 사진을 잃지는 않는다.
export async function imageUriToDataUrl(uri: string, max = 1280): Promise<string> {
  if (!uri) return '';
  if (uri.startsWith('data:')) return uri;
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  const small = await downscaleToDataUrl(uri, max);
  if (small) return small;
  const raw = await rawToDataUrl(uri);
  return raw.startsWith('data:image/') ? raw : '';
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
  const [passport, setPassport] = useState<Passport>(EMPTY_PASSPORT);
  const [passportGoal, setPassportGoal] = useState(5);
  const [passportReward, setPassportReward] = useState(2);
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

  // 서버에서 도장 패스포트 로드.
  const refreshPassport = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const r = await fetch('/api/public?action=passport', { credentials: 'include' });
      const d = await r.json();
      if (d?.passport) setPassport(normalizePassport(d.passport));
      if (Number(d?.goal)) setPassportGoal(Number(d.goal));
      if (Number(d?.reward)) setPassportReward(Number(d.reward));
    } catch {
      // ignore
    }
  }, []);

  // 지역 선택. 진행 중이던 지역과 다르면 서버가 도장을 비운다.
  const pickRegion = useCallback(async (key: string) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const r = await fetch('/api/public?action=pickRegion', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: key }),
      });
      const d = await r.json();
      if (d?.passport) setPassport(normalizePassport(d.passport));
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
      await refreshPassport();
    })();
  }, [refreshFeed, refreshMyPosts, refreshFollow, refreshBites, refreshPassport]);

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
    const meAv = meRef.current.avatar;
    const c = {
      id: `uc${commentSeq}`,
      userId: meRef.current.id,
      userName: meRef.current.name,
      text: t,
      ts: Date.now(),
      avatar: typeof meAv === 'string' ? meAv : meAv?.uri || '',
      handle: meRef.current.handle,
    };
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

  const editComment = useCallback((postId: string, commentId: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    const apply = (p: Post) =>
      p.id === postId
        ? { ...p, comments: p.comments.map((c) => (c.id === commentId ? { ...c, text: t } : c)) }
        : p;
    setPosts((prev) => prev.map(apply));
    setMyPosts((prev) => prev.map(apply));
    fetch('/api/public?action=editComment', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, commentId, text: t }),
    }).catch(() => {});
  }, []);

  const deleteComment = useCallback((postId: string, commentId: string) => {
    const apply = (p: Post) =>
      p.id === postId ? { ...p, comments: p.comments.filter((c) => c.id !== commentId) } : p;
    setPosts((prev) => prev.map(apply));
    setMyPosts((prev) => prev.map(apply));
    fetch('/api/public?action=deleteComment', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, commentId }),
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
          // 리뷰는 사진을 못 읽어도 본문·적립까지 날리진 않는다. 다만 사진이
          // 조용히 빠지면 모르니 알려는 준다.
          if (localUri && !dataUrl && typeof window !== 'undefined') {
            window.alert('사진을 불러오지 못해 사진 없이 올라갑니다.');
          }
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
        fit: input.fit,
        audience: input.audience ?? 'all',
        createdAt: Date.now(),
      };
      setBites((prev) => [optimistic, ...prev]);
      if (Platform.OS !== 'web') return;
      (async () => {
        try {
          const localUri: string = input.image?.uri || '';
          const dataUrl = localUri ? await imageUriToDataUrl(localUri) : '';
          // 사진을 골랐는데 못 읽었으면 사진 없는 빈 스토리가 서버에 남는다.
          // 만들지 말고 되돌린 뒤 알린다 — 조용히 사라지는 게 제일 나쁘다.
          if (localUri && !dataUrl) {
            setBites((prev) => prev.filter((b) => b.id !== optimistic.id));
            if (typeof window !== 'undefined') {
              window.alert('사진을 불러오지 못했어요. 다시 시도해주세요.');
            }
            return;
          }
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
              fit: input.fit,
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

  // 내 스토리 고치기. 보낸 항목만 바뀐다 — 사진을 안 건드렸으면 image 키를
  // 아예 빼서 서버의 기존 사진이 남게 한다.
  const editBite = useCallback<FeedContextValue['editBite']>(
    (biteId, patch) => {
      // 낙관적 반영(사진은 로컬 uri 로 바로 보여준다).
      setBites((prev) =>
        prev.map((b) =>
          b.id !== biteId
            ? b
            : {
                ...b,
                ...(patch.image !== undefined ? { image: patch.image } : null),
                ...(patch.caption !== undefined ? { caption: patch.caption } : null),
                ...(patch.overlays !== undefined ? { overlays: patch.overlays } : null),
                ...(patch.filter !== undefined ? { filter: patch.filter } : null),
                ...(patch.bg !== undefined ? { bg: patch.bg } : null),
                ...(patch.fit !== undefined ? { fit: patch.fit ?? undefined } : null),
                ...(patch.audience !== undefined ? { audience: patch.audience } : null),
              }
        )
      );
      if (Platform.OS !== 'web') return;
      (async () => {
        try {
          const body: Record<string, any> = { id: biteId };
          if (patch.caption !== undefined) body.caption = patch.caption;
          if (patch.overlays !== undefined) body.overlays = patch.overlays;
          if (patch.filter !== undefined) body.filter = patch.filter;
          if (patch.bg !== undefined) body.bg = patch.bg;
          if (patch.fit !== undefined) body.fit = patch.fit; // null 이면 구도 초기화
          if (patch.audience !== undefined) body.audience = patch.audience;

          if (patch.image !== undefined) {
            const uri: string = patch.image?.uri || '';
            if (!uri) body.image = '';
            else if (uri.startsWith('/api/') || uri.startsWith('http')) {
              // 이미 서버에 있는 사진 — 그대로 두면 되니 보내지 않는다.
            } else {
              const dataUrl = await imageUriToDataUrl(uri);
              if (!dataUrl) {
                if (typeof window !== 'undefined') {
                  window.alert('사진을 불러오지 못했어요. 다시 시도해주세요.');
                }
                await refreshBites(); // 낙관적 반영을 서버 값으로 되돌린다
                return;
              }
              body.image = dataUrl;
            }
          }

          await fetch('/api/public?action=editBite', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          await refreshBites();
        } catch {
          await refreshBites();
        }
      })();
    },
    [refreshBites]
  );

  const deleteBite = useCallback((biteId: string) => {
    setBites((prev) => prev.filter((b) => b.id !== biteId));
    if (Platform.OS !== 'web') return;
    fetch('/api/public?action=deleteBite', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: biteId }),
    }).catch(() => {});
  }, []);

  const toggleBiteLike = useCallback((biteId: string) => {
    setBites((prev) =>
      prev.map((b) =>
        b.id === biteId
          ? { ...b, liked: !b.liked, likeCount: Math.max(0, (b.likeCount || 0) + (b.liked ? -1 : 1)) }
          : b
      )
    );
    if (Platform.OS !== 'web') return;
    fetch('/api/public?action=biteLike', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: biteId }),
    }).catch(() => {});
  }, []);

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
      editBite,
      deleteBite,
      toggleBiteLike,
      passport,
      passportGoal,
      passportReward,
      pickRegion,
      refreshPassport,
      toggleSave,
      toggleFollow,
      addComment,
      editComment,
      deleteComment,
      editPost,
      deletePost,
      addPost,
      profileAvatar,
      setProfileAvatar,
    }),
    [me, postsView, myPosts, refreshFeed, refreshMyPosts, updateMe, followCounts, bites, addBite, editBite, deleteBite, toggleBiteLike, passport, passportGoal, passportReward, pickRegion, refreshPassport, toggleSave, toggleFollow, addComment, editComment, deleteComment, editPost, deletePost, addPost, profileAvatar, setProfileAvatar]
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
