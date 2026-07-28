import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StampPassport } from '@/components/feed/StampPassport';
import { AvatarCropper } from '@/components/ui/AvatarCropper';

import { useFeed, won } from '@/context/feed';
import { usePb } from '@/context/pb';
import { useReservations } from '@/context/reservations';
import { useShell } from '@/context/shell';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

const width = APP_WIDTH;
const GRID_GAP = 3;
const GRID_ITEM = (width - spacing.lg * 2 - GRID_GAP * 2) / 3;

const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// 프로필 사진을 정사각 size로 압축(JPEG)해서 로컬 저장 한도 안에 들어오게 한다.
// 웹은 canvas로 리사이즈, 그 외(native)는 원본 URI 그대로.
function downscaleAvatar(uri: string, size = 512): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      resolve(uri);
      return;
    }
    try {
      const el = new (window as any).Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(uri);
          const s = Math.min(el.width, el.height) || size;
          const sx = (el.width - s) / 2;
          const sy = (el.height - s) / 2;
          ctx.drawImage(el, sx, sy, s, s, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(uri);
        }
      };
      el.onerror = () => resolve(uri);
      el.src = uri;
    } catch {
      resolve(uri);
    }
  });
}

type TabType = 'reviews' | 'reservations' | 'entries' | 'wins';

type MyScreenProps = {
  initialTab?: TabType;
};

// Unified profile post — both live feed posts and historical reviews render as
// this in the grid + detail modal.
type GridPost = {
  key: string;
  images: any[];
  isBurning: boolean;
  store: string;
  category: string;
  date: string;
  rating?: number;
  caption: string;
  earnedPb: number;
  people: string;
  price: string;
  menu?: string;
  platform?: string;
  address?: string;
  isPrivate?: boolean;
};

type EntryItem = {
  id: string;
  title: string;
  image: any;
  myCount: number;
  announcementDate: string;
  status: string;
};

type WinItem = {
  id: string;
  title: string;
  image: any;
  wonDate: string;
  status: '수령전' | '배송중' | '수령완료';
};

// 실 사용 전환 — 내 게시물은 서버(myPosts)에서만 온다. 데모 리뷰 제거.

const TABS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'reviews', label: '내 피드', icon: 'grid' },
  { key: 'reservations', label: '예약', icon: 'calendar-outline' },
  { key: 'entries', label: '응모중', icon: 'ticket-outline' },
  { key: 'wins', label: '당첨', icon: 'trophy-outline' },
];

export default function MyScreen({ initialTab = 'reviews' }: MyScreenProps) {
  const { setTab, openOverlay, dropOverlay, openFollowList, setShowReview } = useShell();
  const { pb } = usePb();
  const {
    myPosts,
    me,
    passport,
    passportGoal,
    profileAvatar,
    setProfileAvatar,
    editPost,
    deletePost,
    followCounts,
    updateMe,
    refreshMyPosts,
    refreshFeed,
  } = useFeed();
  const { reservations, cancel, markVisited } = useReservations();

  // 팔로워/팔로잉 = 서버 팔로우 그래프 기준.
  const followingCount = followCounts.following;
  const followerCount = followCounts.followers;

  // 응모중 경품 = 서버의 실제 응모 내역(내 응모 수 > 0).
  const [entryItems, setEntryItems] = useState<EntryItem[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    (async () => {
      try {
        const [pr, rs] = await Promise.all([
          fetch('/api/products').then((r) => r.json()),
          fetch('/api/public?action=raffleState', { credentials: 'include' }).then((r) => r.json()),
        ]);
        const my = (rs && rs.myEntries) || {};
        const items: EntryItem[] = (pr.products || [])
          .filter((p: any) => (my[p.id] || 0) > 0)
          .map((p: any) => ({
            id: p.id,
            title: p.name,
            image: { uri: p.image || '' },
            myCount: my[p.id],
            announcementDate: p.announcementDate || '-',
            status: '응모중',
          }));
        setEntryItems(items);
      } catch {
        // ignore
      }
    })();
  }, []);

  // 당첨 내역 = 어드민 추첨 결과 + 배송 상태(서버에서 합쳐서 내려준다).
  const [winItems, setWinItems] = useState<WinItem[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let alive = true;
    fetch('/api/public?action=myWins', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d?.items)) return;
        setWinItems(
          d.items.map((w: any) => ({
            id: w.id,
            title: w.title,
            image: { uri: w.image || '' },
            wonDate: w.wonDate || '-',
            status: w.status || '수령전',
          }))
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);


  // 도장 지역 선택창 — 프로필의 '도장' 칩과 패스포트 카드 양쪽에서 연다.
  const [passportOpen, setPassportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selected, setSelected] = useState<GridPost | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [detailRatio, setDetailRatio] = useState(1); // 상세 이미지 가로/세로 비율
  // 게시물 수정/삭제(인스타식) — 문구 편집은 로컬 오버라이드 + 피드 반영, 저장 유지.
  const [postMenu, setPostMenu] = useState(false);
  const [editPostOpen, setEditPostOpen] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({});
  const [privacyEdits, setPrivacyEdits] = useState<Record<string, boolean>>({});
  const [hiddenPosts, setHiddenPosts] = useState<string[]>([]);

  // 편집 가능한 프로필(사진/이름/아이디/소개) — 기기에 저장돼 새로고침 후에도 유지.
  const [name, setName] = useState('나');
  const [handle, setHandle] = useState(me.handle);
  const [bioLine, setBioLine] = useState('놀·먹·즐·마 기록 중 🍽');
  const [editOpen, setEditOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftHandle, setDraftHandle] = useState(handle);
  const [draftBio, setDraftBio] = useState(bioLine);
  const [draftAvatar, setDraftAvatar] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);

  // 프로필 사진은 피드 컨텍스트에서 공유(홈 바이트 카드 등과 동일한 값).
  const avatarSource = profileAvatar ? { uri: profileAvatar } : me.avatar;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    (async () => {
      try {
        const [n, h, b, edits, priv, hidden] = await Promise.all([
          AsyncStorage.getItem('PROFILE_NAME'),
          AsyncStorage.getItem('PROFILE_HANDLE'),
          AsyncStorage.getItem('PROFILE_BIO'),
          AsyncStorage.getItem('POST_CAPTION_EDITS'),
          AsyncStorage.getItem('POST_PRIVACY_EDITS'),
          AsyncStorage.getItem('POST_HIDDEN'),
        ]);
        if (n) setName(n);
        if (h) setHandle(h);
        if (b) setBioLine(b);
        if (edits) setCaptionEdits(JSON.parse(edits));
        if (priv) setPrivacyEdits(JSON.parse(priv));
        if (hidden) setHiddenPosts(JSON.parse(hidden));
      } catch {
        // ignore
      }
    })();
  }, []);

  const openEdit = () => {
    setDraftName(name);
    setDraftHandle(handle);
    setDraftBio(bioLine);
    setDraftAvatar(profileAvatar);
    setEditOpen(true);
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (typeof window !== 'undefined' && window.alert) window.alert('사진 접근 권한이 필요해요.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!res.canceled) {
      const uri = res.assets[0].uri;
      // 웹: 위치/확대 조정 크로퍼 열기. 네이티브: 자체 크롭 UI가 이미 처리.
      if (Platform.OS === 'web') setCropUri(uri);
      else setDraftAvatar(await downscaleAvatar(uri, 512));
    }
  };

  const saveProfile = async () => {
    const nextName = draftName.trim() || me.name || '나';
    let nextHandle = draftHandle.trim().replace(/\s/g, '');
    if (!nextHandle.startsWith('@')) nextHandle = '@' + nextHandle.replace(/^@+/, '');
    if (nextHandle === '@') nextHandle = me.handle;
    const nextBio = draftBio.trim() || '놀·먹·즐·마 기록 중 🍽';

    // 즉시 로컬 반영(낙관적).
    setName(nextName);
    setHandle(nextHandle);
    setBioLine(nextBio);
    updateMe({ name: nextName, handle: nextHandle });
    AsyncStorage.setItem('PROFILE_NAME', nextName).catch(() => {});
    AsyncStorage.setItem('PROFILE_HANDLE', nextHandle).catch(() => {});
    AsyncStorage.setItem('PROFILE_BIO', nextBio).catch(() => {});
    setEditOpen(false);

    // 아바타 업로드(새 사진이면) → 서버 URL 확보.
    // 웹 파일선택기는 data: 가 아니라 blob: URL 을 준다. 크롭이 실패하면 그 blob:
    // 이 그대로 넘어오는데, 예전에는 data: 로 시작할 때만 업로드해서 blob: 이
    // 서버에 저장되고 새로고침하면 사진이 사라졌다. 이제 blob: 도 변환해 올린다.
    let avatarUrl = draftAvatar || '';
    if (Platform.OS === 'web' && draftAvatar && !draftAvatar.startsWith('/api/')) {
      try {
        let dataUrl = draftAvatar;
        if (draftAvatar.startsWith('blob:')) {
          const blob = await (await fetch(draftAvatar)).blob();
          dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = () => reject(new Error('read_failed'));
            fr.readAsDataURL(blob);
          });
        }
        if (dataUrl.startsWith('data:')) {
          const r = await fetch('/api/public?action=upload', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl }),
          });
          const d = await r.json();
          if (d?.url) avatarUrl = d.url;
          else throw new Error('upload_failed');
        }
      } catch {
        // 업로드 실패를 조용히 넘기면 사진이 안 바뀐 이유를 알 수 없다.
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('프로필 사진 업로드에 실패했어요. 다시 시도해 주세요.');
        }
        avatarUrl = '';
      }
    }
    if (avatarUrl) setProfileAvatar(avatarUrl);
    else if (!draftAvatar) setProfileAvatar(null);

    // 서버 계정에 프로필 저장 → 다른 사람이 내 글에서 보는 이름/사진도 갱신.
    if (Platform.OS === 'web') {
      try {
        await fetch('/api/auth?action=profile', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nextName, handle: nextHandle, bio: nextBio, avatar: avatarUrl }),
        });
        // 서버 프로필이 바뀌었으니 내 게시물/피드의 작성자 정보 재조회.
        refreshMyPosts();
        refreshFeed();
      } catch {
        // ignore
      }
    }
  };

  const shareProfile = async () => {
    const url = typeof window !== 'undefined' && window.location ? window.location.origin : 'https://peed.co.kr';
    const text = `${name}(${handle}) 님의 PEED 프로필`;
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: 'PEED', text, url });
        return;
      }
    } catch {
      // 공유 취소 등 — 아래 복사로 폴백
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(`${text} ${url}`);
      if (typeof window !== 'undefined' && window.alert) window.alert('프로필 링크를 복사했어요!');
    }
  };

  // My live feed posts (from reviews I've submitted) prepended to history.
  const gridPosts = useMemo<GridPost[]>(() => {
    const mine = myPosts.map<GridPost>((p) => ({
      key: p.id,
      images: p.image ? [p.image] : [],
      isBurning: p.isBurning,
      store: p.store,
      category: p.category,
      date: p.timeLabel,
      rating: p.rating,
      caption: p.caption,
      earnedPb: p.earnedPb,
      people: `${p.people}인`,
      price: won(p.price),
      isPrivate: p.isPrivate,
    }));
    return mine
      .filter((p) => !hiddenPosts.includes(p.key))
      .map((p) => {
        const caption = captionEdits[p.key] != null ? captionEdits[p.key] : p.caption;
        const isPrivate = privacyEdits[p.key] != null ? privacyEdits[p.key] : p.isPrivate;
        return { ...p, caption, isPrivate };
      });
  }, [myPosts, captionEdits, privacyEdits, hiddenPosts]);

  // 도장 진행도 — 이번 지역에서 찍은 개수와 지금까지 완주한 지역 수.
  const stampCount = passport.stores.length;

  // 상세 모달을 셸 오버레이로 등록 → 안드로이드 뒤로가기/스와이프가 좌상단
  // 버튼과 동일하게 '모달 닫기'를 하도록(홈으로 안 감).
  const closeDetailFn = useCallback(() => setDetailVisible(false), []);
  const openPost = (post: GridPost) => {
    setSelected(post);
    setImgIndex(0);
    setDetailRatio(1);
    setDetailVisible(true);
    openOverlay(closeDetailFn);
  };
  const closeDetail = () => {
    setDetailVisible(false);
    dropOverlay(closeDetailFn);
  };

  // 게시물 "…" 메뉴 + 수정/삭제 (오버레이 등록 → 뒤로가기로 닫힘).
  const closePostMenuFn = useCallback(() => setPostMenu(false), []);
  const closeEditPostFn = useCallback(() => setEditPostOpen(false), []);
  const openPostMenu = () => {
    setPostMenu(true);
    openOverlay(closePostMenuFn);
  };
  const closePostMenu = () => {
    setPostMenu(false);
    dropOverlay(closePostMenuFn);
  };
  const startEditPost = () => {
    if (!selected) return;
    closePostMenu();
    setEditCaption(selected.caption);
    setEditPrivate(!!selected.isPrivate);
    setEditPostOpen(true);
    openOverlay(closeEditPostFn);
  };
  const closeEditPost = () => {
    setEditPostOpen(false);
    dropOverlay(closeEditPostFn);
  };
  const saveEditPost = () => {
    if (!selected) return;
    const cap = editCaption.trim();
    const nextCap = { ...captionEdits, [selected.key]: cap };
    const nextPriv = { ...privacyEdits, [selected.key]: editPrivate };
    setCaptionEdits(nextCap);
    setPrivacyEdits(nextPriv);
    AsyncStorage.setItem('POST_CAPTION_EDITS', JSON.stringify(nextCap)).catch(() => {});
    AsyncStorage.setItem('POST_PRIVACY_EDITS', JSON.stringify(nextPriv)).catch(() => {});
    editPost(selected.key, { caption: cap, isPrivate: editPrivate }); // 피드 게시물이면 홈에도 반영
    setSelected({ ...selected, caption: cap, isPrivate: editPrivate }); // 상세 즉시 반영
    closeEditPost();
  };
  const deleteSelectedPost = () => {
    if (!selected) return;
    const ok =
      typeof window === 'undefined' || !window.confirm ? true : window.confirm('이 게시물을 삭제할까요?');
    if (!ok) return;
    const next = [...hiddenPosts, selected.key];
    setHiddenPosts(next);
    AsyncStorage.setItem('POST_HIDDEN', JSON.stringify(next)).catch(() => {});
    deletePost(selected.key); // 피드 게시물이면 제거
    closePostMenu();
    closeDetail();
  };

  // 상세 이미지 높이 — 원본 비율대로(위 잘림 방지). 너무 세로로 긴 사진만 클램프.
  const detailImgHeight = Math.round(
    Math.max(width * 0.72, Math.min(width * 1.4, width / (detailRatio || 1)))
  );

  const winBadge = (status: WinItem['status']) => {
    if (status === '수령전') return { wrap: styles.badgePending, text: styles.badgePendingText };
    if (status === '배송중') return { wrap: styles.badgeShipping, text: styles.badgeShippingText };
    return { wrap: styles.badgeDone, text: styles.badgeDoneText };
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.centerWrap}>
        {/* ── profile header ── */}
        <View style={styles.profileTop}>
          <Image source={avatarSource} style={styles.avatar} />
          <View style={styles.statsRow}>
            <Stat value={comma(gridPosts.length)} label="게시물" />
            <Stat
              value={comma(followerCount)}
              label="팔로워"
              onPress={() => me.id && me.id !== 'me' && openFollowList(me.id, 'followers')}
            />
            <Stat
              value={comma(followingCount)}
              label="팔로잉"
              onPress={() => me.id && me.id !== 'me' && openFollowList(me.id, 'following')}
            />
          </View>
        </View>

        <Text style={styles.name}>{name}</Text>
        <Text style={styles.handle}>{handle}</Text>
        <Text style={styles.bio}>
          {bioLine}{'\n'}🗺️{' '}
          {passport.region
            ? `${passport.region} 도장 모으는 중`
            : passport.completed > 0
              ? `${passport.completed}개 지역 완주`
              : '리뷰로 PB 모으는 중'}
        </Text>

        <View style={styles.chips}>
          <View style={[styles.chip, styles.chipPb]}>
            <Text style={styles.chipPbText}>💎 {comma(pb)} PB</Text>
          </View>
          {/* 도장 칩 — 지역을 아직 안 골랐을 때만 선택창을 연다.
              한번 고르면 완주까지 지역은 고정(변경 불가). */}
          <TouchableOpacity
            style={[styles.chip, styles.chipStamp]}
            onPress={() => {
              if (!passport.region) setPassportOpen(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.chipStampText}>
              🔴 도장 {passport.region ? `${stampCount}/${passportGoal}` : passport.completed}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── 도장 패스포트 — 지역을 고르고 그 지역 매장 N곳에 리뷰를 남기면 보너스 PB ── */}
        <View style={styles.passportWrap}>
          <StampPassport
            onOpenReview={() => setShowReview(true)}
            picking={passportOpen}
            setPicking={setPassportOpen}
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.editBtn} activeOpacity={0.85} onPress={openEdit}>
            <Text style={styles.editBtnText}>프로필 편집</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.85} onPress={shareProfile}>
            <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.85}
            onPress={() => setTab('settings')}
          >
            <Ionicons name="settings-outline" size={18} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* ── tabs ── */}
        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={styles.tab}
                onPress={() => setActiveTab(t.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={t.icon}
                  size={20}
                  color={active ? colors.textPrimary : colors.textTertiary}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t.label}
                </Text>
                {active && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── tab content ── */}
        {activeTab === 'reviews' && gridPosts.length === 0 && (
          <View style={styles.resEmpty}>
            <Text style={styles.resEmptyEmoji}>🍽</Text>
            <Text style={styles.resEmptyText}>
              아직 올린 게시물이 없어요{'\n'}버닝 매장에서 첫 리뷰를 남겨보세요
            </Text>
          </View>
        )}
        {activeTab === 'reviews' && gridPosts.length > 0 && (
          <View style={styles.grid}>
            {gridPosts.map((post) => (
              <TouchableOpacity
                key={post.key}
                style={styles.gridItem}
                onPress={() => openPost(post)}
                activeOpacity={0.9}
              >
                {post.images[0] ? (
                  <Image source={post.images[0]} style={styles.gridImage} />
                ) : (
                  // 이용 사진 없이 올린 글 — 영수증 조각처럼 글자로 보여준다.
                  <View style={[styles.gridImage, styles.gridNote]}>
                    <Text style={styles.gridNoteStore} numberOfLines={2}>
                      {post.store || '리뷰'}
                    </Text>
                    {!!post.rating && (
                      <Text style={styles.gridNoteStar}>★ {Number(post.rating).toFixed(1)}</Text>
                    )}
                    <Text style={styles.gridNoteBody} numberOfLines={3}>
                      {post.caption || ''}
                    </Text>
                  </View>
                )}
                {post.isBurning && (
                  <View style={styles.burnDot}>
                    <Text style={styles.burnDotText}>🔥</Text>
                  </View>
                )}
                {post.images.length > 1 && (
                  <View style={styles.multiBadge}>
                    <Ionicons name="copy" size={12} color={colors.white} />
                  </View>
                )}
                {post.isPrivate && (
                  <View style={styles.lockBadge}>
                    <Ionicons name="lock-closed" size={12} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'entries' && entryItems.length === 0 && (
          <View style={styles.resEmpty}>
            <Text style={styles.resEmptyEmoji}>🎟️</Text>
            <Text style={styles.resEmptyText}>
              응모 중인 경품이 없어요{'\n'}PB를 모아 경품에 응모해보세요
            </Text>
          </View>
        )}
        {activeTab === 'entries' && entryItems.length > 0 && (
          <View style={styles.list}>
            {entryItems.map((item) => (
              <View key={item.id} style={styles.listCard}>
                <Image source={item.image} style={styles.listImage} resizeMode="cover" />
                <View style={styles.listInfo}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listSub}>내 응모 {item.myCount}회</Text>
                  <Text style={styles.listSub}>발표일 {item.announcementDate}</Text>
                </View>
                <View style={styles.smallBadge}>
                  <Text style={styles.smallBadgeText}>{item.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'wins' && winItems.length === 0 && (
          <View style={styles.resEmpty}>
            <Text style={styles.resEmptyEmoji}>🏆</Text>
            <Text style={styles.resEmptyText}>
              아직 당첨 내역이 없어요{'\n'}경품에 응모하고 행운을 기대해보세요
            </Text>
          </View>
        )}
        {activeTab === 'wins' && winItems.length > 0 && (
          <View style={styles.list}>
            {winItems.map((item) => {
              const b = winBadge(item.status);
              return (
                <View key={item.id} style={styles.listCard}>
                  <Image source={item.image} style={styles.listImage} resizeMode="cover" />
                  <View style={styles.listInfo}>
                    <Text style={styles.listTitle}>{item.title}</Text>
                    <Text style={styles.listSub}>당첨일 {item.wonDate}</Text>
                  </View>
                  <View style={[styles.smallBadge, b.wrap]}>
                    <Text style={[styles.smallBadgeText, b.text]}>{item.status}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'reservations' && (
          <View style={styles.list}>
            {reservations.length === 0 ? (
              <View style={styles.resEmpty}>
                <Text style={styles.resEmptyEmoji}>🍽</Text>
                <Text style={styles.resEmptyText}>
                  아직 예약이 없어요{'\n'}매장을 예약하고 PB 보너스 받아보세요
                </Text>
              </View>
            ) : (
              reservations.map((r) => {
                const meta =
                  r.status === 'confirmed'
                    ? { label: '예약확정', wrap: styles.resConfirm, text: styles.resConfirmText }
                    : r.status === 'visited'
                      ? { label: '방문완료', wrap: styles.resVisited, text: styles.resVisitedText }
                      : { label: '취소됨', wrap: styles.badgeDone, text: styles.badgeDoneText };
                return (
                  <View key={r.id} style={styles.listCard}>
                    <Image source={r.storeImage} style={styles.listImage} resizeMode="cover" />
                    <View style={styles.listInfo}>
                      <Text style={styles.listTitle}>{r.storeName}</Text>
                      <Text style={styles.listSub}>
                        {r.dateLabel} {r.time} · {r.party}명
                      </Text>
                      {r.heldPb > 0 && (
                        <Text style={styles.listSub}>🔒 보증 {r.heldPb} PB</Text>
                      )}
                    </View>
                    <View style={styles.resRight}>
                      <View style={[styles.smallBadge, meta.wrap]}>
                        <Text style={[styles.smallBadgeText, meta.text]}>
                          {meta.label}
                        </Text>
                      </View>
                      {r.status === 'confirmed' && (
                        <View style={styles.resActions}>
                          <TouchableOpacity
                            onPress={() => markVisited(r.id)}
                            style={styles.resVisitBtn}
                          >
                            <Text style={styles.resVisitBtnText}>방문완료</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => cancel(r.id)}>
                            <Text style={styles.resCancelText}>취소</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        <View style={{ height: 24 }} />
        </View>
      </ScrollView>

      {/* ── detail modal ── */}
      <Modal
        visible={detailVisible}
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <SafeAreaView style={styles.detail} edges={['top', 'bottom']}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={closeDetail} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>게시물</Text>
            <TouchableOpacity onPress={openPostMenu} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {selected && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) =>
                  setImgIndex(Math.round(e.nativeEvent.contentOffset.x / width))
                }
              >
                {selected.images.map((img, i) => (
                  <Image
                    key={i}
                    source={img}
                    style={[styles.detailImage, { height: detailImgHeight }]}
                    resizeMode="cover"
                    onLoad={(e) => {
                      if (i !== 0) return;
                      const src: any = (e.nativeEvent as any)?.source || e.nativeEvent;
                      const w = src?.width;
                      const h = src?.height;
                      if (w && h) setDetailRatio(w / h);
                    }}
                  />
                ))}
              </ScrollView>

              {selected.images.length > 1 && (
                <View style={styles.dots}>
                  {selected.images.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, imgIndex === i && styles.dotActive]}
                    />
                  ))}
                </View>
              )}

              <View style={styles.detailBody}>
                <View style={styles.detailTitleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailStore}>{selected.store}</Text>
                    <Text style={styles.detailMeta}>
                      {selected.category} · {selected.date}
                    </Text>
                  </View>
                  {selected.isPrivate && (
                    <View style={styles.privateChip}>
                      <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
                      <Text style={styles.privateChipText}>비공개</Text>
                    </View>
                  )}
                  {selected.isBurning && (
                    <View style={styles.detailBurn}>
                      <Text style={styles.detailBurnText}>🔥 버닝</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.detailCaption}>{selected.caption}</Text>

                <View style={styles.detailReceipt}>
                  <DRow label="인원" value={selected.people} />
                  <DRow label="결제금액" value={selected.price} />
                  {selected.menu ? <DRow label="메뉴" value={selected.menu} /> : null}
                  {selected.platform ? (
                    <DRow label="리뷰 플랫폼" value={selected.platform} />
                  ) : null}
                  {selected.address ? <DRow label="위치" value={selected.address} /> : null}
                  <View style={styles.detailPbRow}>
                    <Text style={styles.detailPbLabel}>PEEDBACK 적립</Text>
                    <Text style={styles.detailPbValue}>+{selected.earnedPb} PB</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── post "…" menu ── */}
      <Modal visible={postMenu} transparent animationType="fade" onRequestClose={closePostMenu}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closePostMenu}>
          <TouchableOpacity style={styles.sheet} activeOpacity={1}>
            <View style={styles.sheetHandle} />
            <TouchableOpacity style={styles.sheetItem} onPress={startEditPost} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
              <Text style={styles.sheetItemText}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={deleteSelectedPost} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
              <Text style={[styles.sheetItemText, { color: colors.danger }]}>삭제</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetItem, styles.sheetCancel]} onPress={closePostMenu} activeOpacity={0.8}>
              <Text style={styles.sheetCancelText}>취소</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── post edit (Instagram-style) ── */}
      <Modal visible={editPostOpen} animationType="slide" onRequestClose={closeEditPost}>
        <SafeAreaView style={styles.editScreen} edges={['top', 'bottom']}>
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={closeEditPost} hitSlop={10}>
              <Text style={styles.editHeaderCancel}>취소</Text>
            </TouchableOpacity>
            <Text style={styles.editHeaderTitle}>정보 수정</Text>
            <TouchableOpacity onPress={saveEditPost} hitSlop={10}>
              <Text style={styles.editHeaderDone}>완료</Text>
            </TouchableOpacity>
          </View>

          {selected && (
            <ScrollView contentContainerStyle={styles.postEditBody} showsVerticalScrollIndicator={false}>
              <View style={styles.postEditTop}>
                {selected.images[0] ? (
                  <Image source={selected.images[0]} style={styles.postEditThumb} />
                ) : (
                  <View style={[styles.postEditThumb, styles.gridNote]}>
                    <Text style={styles.gridNoteStore} numberOfLines={2}>
                      {selected.store || '리뷰'}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.postEditStore}>{selected.store}</Text>
                  <Text style={styles.postEditMeta}>
                    {selected.category} · {selected.date}
                  </Text>
                </View>
              </View>
              <TextInput
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="문구 입력..."
                placeholderTextColor={colors.textTertiary}
                style={styles.postEditCaption}
                multiline
                autoFocus
                maxLength={300}
              />

              <Text style={styles.postEditLabel}>공개 설정</Text>
              <View style={styles.visRow}>
                <TouchableOpacity
                  style={[styles.visBtn, !editPrivate && styles.visBtnOn]}
                  onPress={() => setEditPrivate(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="earth" size={18} color={!editPrivate ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.visBtnText, !editPrivate && styles.visBtnTextOn]}>공개</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.visBtn, editPrivate && styles.visBtnOn]}
                  onPress={() => setEditPrivate(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="lock-closed" size={18} color={editPrivate ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.visBtnText, editPrivate && styles.visBtnTextOn]}>비공개</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.postEditHint}>
                {editPrivate
                  ? '비공개 — 어디에도 안 보여요. 내 프로필에 놀러 온 사람에게도 숨겨져요.'
                  : selected.images.length > 0
                    ? '공개 — 홈 피드에 노출되고, 내 프로필에 놀러 온 사람도 볼 수 있어요.'
                    : '공개 — 이용 사진이 없어 홈 피드엔 안 뜨지만, 내 프로필에 놀러 온 사람은 볼 수 있어요.'}
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ── profile edit (Instagram-style full screen) ── */}
      <Modal visible={editOpen} animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <SafeAreaView style={styles.editScreen} edges={['top', 'bottom']}>
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={() => setEditOpen(false)} hitSlop={10}>
              <Text style={styles.editHeaderCancel}>취소</Text>
            </TouchableOpacity>
            <Text style={styles.editHeaderTitle}>프로필 편집</Text>
            <TouchableOpacity onPress={saveProfile} hitSlop={10}>
              <Text style={styles.editHeaderDone}>완료</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.editBody} showsVerticalScrollIndicator={false}>
            {/* avatar */}
            <View style={styles.editAvatarWrap}>
              <TouchableOpacity onPress={pickAvatar} activeOpacity={0.85} style={styles.editAvatarBtn}>
                <Image
                  source={draftAvatar ? { uri: draftAvatar } : avatarSource}
                  style={styles.editAvatar}
                />
                <View style={styles.editAvatarBadge}>
                  <Ionicons name="camera" size={15} color={colors.white} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={pickAvatar} hitSlop={8}>
                <Text style={styles.editAvatarText}>프로필 사진 바꾸기</Text>
              </TouchableOpacity>
            </View>

            {/* fields */}
            <View style={styles.editFields}>
              <EditField label="이름" value={draftName} onChangeText={setDraftName} placeholder="이름" maxLength={20} />
              <EditField
                label="사용자 이름"
                value={draftHandle}
                onChangeText={setDraftHandle}
                placeholder="@아이디"
                maxLength={24}
                autoCapitalize="none"
              />
              <EditField
                label="소개"
                value={draftBio}
                onChangeText={setDraftBio}
                placeholder="한 줄 소개"
                maxLength={60}
                multiline
                last
              />
            </View>
          </ScrollView>

          {cropUri && (
            <AvatarCropper
              uri={cropUri}
              onCancel={() => setCropUri(null)}
              onDone={(dataUri) => {
                setDraftAvatar(dataUri);
                setCropUri(null);
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  maxLength,
  multiline,
  autoCapitalize,
  last,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
  last?: boolean;
}) {
  return (
    <View style={[styles.editRow, !last && styles.editRowBorder]}>
      <Text style={styles.editRowLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={styles.editRowInput}
        maxLength={maxLength}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.stat} activeOpacity={onPress ? 0.6 : 1} onPress={onPress} disabled={!onPress}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function DRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dRow}>
      <Text style={styles.dLabel}>{label}</Text>
      <Text style={styles.dValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingTop: spacing.md,
    paddingBottom: 24,
    alignItems: 'center',
  },
  centerWrap: {
    width: APP_WIDTH,
    paddingHorizontal: spacing.lg,
  },

  /* profile header */
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceAlt,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },

  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  handle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  bio: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    fontWeight: '500',
  },

  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  chipPb: {
    backgroundColor: colors.primarySoft,
  },
  chipPbText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  passportWrap: { marginTop: spacing.lg, alignSelf: 'stretch' },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chipStamp: {
    backgroundColor: '#FDECEC',
  },
  chipStampText: {
    color: '#E23B3B',
    fontSize: 13,
    fontWeight: '800',
  },

  editBtn: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inviteText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  inviteCode: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },

  /* tabs */
  tabBar: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 3,
  },
  tabLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.textTertiary,
  },
  tabLabelActive: {
    color: colors.textPrimary,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    height: 2,
    width: '55%',
    backgroundColor: colors.textPrimary,
    borderRadius: 2,
  },

  /* grid */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    paddingTop: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM,
    height: GRID_ITEM,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  // 사진 없는 글 타일 — 영수증 종이 느낌으로 글자만 얹는다.
  gridNote: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm,
    justifyContent: 'center',
    gap: 2,
  },
  gridNoteStore: {
    fontSize: 11.5,
    fontWeight: '900',
    color: colors.paperInk,
    lineHeight: 15,
  },
  gridNoteStar: { fontSize: 10.5, fontWeight: '800', color: colors.tangerine },
  gridNoteBody: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  burnDot: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  burnDotText: {
    fontSize: 11,
  },
  multiBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
  },

  /* entries / wins list */
  list: {
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.soft,
  },
  listImage: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  listInfo: {
    flex: 1,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  listSub: {
    fontSize: 12.5,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  smallBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  smallBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  badgePending: { backgroundColor: colors.coralSoft },
  badgePendingText: { color: colors.coralDeep },
  badgeShipping: { backgroundColor: '#FDF0D9' },
  badgeShippingText: { color: '#B4770E' },
  badgeDone: { backgroundColor: colors.surfaceAlt },
  badgeDoneText: { color: colors.textSecondary },

  /* reservations */
  resConfirm: { backgroundColor: colors.primarySoft },
  resConfirmText: { color: colors.primary },
  resVisited: { backgroundColor: colors.limeSoft },
  resVisitedText: { color: colors.limeInk },
  resRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  resActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  resVisitBtn: {
    backgroundColor: colors.coral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  resVisitBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  resCancelText: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '700',
  },
  resEmpty: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.md,
  },
  resEmptyEmoji: {
    fontSize: 40,
  },
  resEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* menu */
  menu: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  /* profile edit — Instagram style */
  editScreen: { flex: 1, backgroundColor: colors.bg },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  editHeaderCancel: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  editHeaderTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  editHeaderDone: { fontSize: 15, fontWeight: '900', color: colors.primary },
  editBody: { alignItems: 'center', paddingTop: spacing.xl },
  editAvatarWrap: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  editAvatarBtn: { position: 'relative' },
  editAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceAlt,
  },
  editAvatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
  },
  editAvatarText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  editFields: { width: APP_WIDTH, paddingHorizontal: spacing.lg },
  editRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  editRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  editRowLabel: {
    width: 92,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingTop: 2,
  },
  editRowInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    padding: 0,
    ...({ outlineStyle: 'none' } as object),
  },

  /* post "…" menu sheet */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,18,34,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
    width: '100%',
    maxWidth: APP_WIDTH,
    alignSelf: 'center',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.sm,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  sheetItemText: { fontSize: 15.5, fontWeight: '800', color: colors.textPrimary },
  sheetCancel: {
    justifyContent: 'center',
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  sheetCancelText: { fontSize: 15.5, fontWeight: '800', color: colors.textSecondary },

  /* post edit */
  postEditBody: { padding: spacing.lg },
  postEditTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: spacing.lg,
  },
  postEditThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  postEditStore: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  postEditMeta: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  postEditCaption: {
    minHeight: 120,
    fontSize: 15.5,
    lineHeight: 23,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlignVertical: 'top',
    padding: 0,
    ...({ outlineStyle: 'none' } as object),
  },
  postEditHint: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  postEditLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  visRow: { flexDirection: 'row', gap: spacing.md },
  visBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  visBtnOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  visBtnText: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
  visBtnTextOn: { color: colors.primary },

  /* private lock badge (grid + detail) */
  lockBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.pill,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginLeft: spacing.sm,
  },
  privateChipText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },

  /* detail modal */
  detail: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  detailHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  detailImage: {
    width,
    height: width,
    backgroundColor: colors.surfaceAlt,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
  },
  detailBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  detailStore: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  detailMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  detailBurn: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  detailBurnText: {
    color: colors.coralDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  detailCaption: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textPrimary,
    fontWeight: '500',
    marginBottom: spacing.lg,
  },
  detailReceipt: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  dLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  dValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  detailPbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  detailPbLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  detailPbValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.limeInk,
  },
});
