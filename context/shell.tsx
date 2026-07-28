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

import { ReservableStore } from '@/data/stores';

// App shell / navigation state. Login is persisted (refresh keeps you in). Tab
// switches AND overlays (review, reserve modal, store detail) push browser
// history entries (web) so the back button moves within the app — closing the
// topmost overlay first, then stepping back through tabs — instead of leaving.
export type ShellTab = 'home' | 'burning' | 'peed' | 'my' | 'settings' | 'dm' | 'game';
export type InfoKey = 'notice' | 'terms' | 'privacy' | 'support';

const AUTH_KEY = 'PEED_AUTHED';
const isWeb = typeof window !== 'undefined' && !!window.history;

type ShellValue = {
  authed: boolean;
  setAuthed: (v: boolean) => void;
  tab: ShellTab;
  setTab: (t: ShellTab) => void;
  showReview: boolean;
  setShowReview: (v: boolean) => void;
  detailStore: ReservableStore | null;
  openStoreDetail: (store: ReservableStore) => void;
  closeStoreDetail: () => void;
  // Bites (story-style quick posts): a fullscreen composer + viewer, both
  // registered as overlays so the back button closes them.
  biteComposer: boolean;
  biteEditId: string | null; // 값이 있으면 새로 올리기가 아니라 그 스토리 고치기
  openBiteComposer: (biteId?: string) => void;
  closeBiteComposer: () => void;
  biteViewerId: string | null;
  openBiteViewer: (id: string) => void;
  closeBiteViewer: () => void;
  // Settings info pages (공지/약관/개인정보/고객센터) shown as blurred popups.
  infoSheet: InfoKey | null;
  openInfoSheet: (key: InfoKey) => void;
  closeInfoSheet: () => void;
  // 사람/매장 검색 오버레이.
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  // 다른 유저 프로필 보기 오버레이.
  viewUserId: string | null;
  viewUser: (uid: string) => void;
  closeUser: () => void;
  // 팔로워/팔로잉 목록 오버레이.
  followList: { uid: string; mode: 'followers' | 'following' } | null;
  openFollowList: (uid: string, mode: 'followers' | 'following') => void;
  closeFollowList: () => void;
  // 특정 유저와 DM 시작(프로필 '메시지' 버튼 등) → DM 탭으로 이동 후 대화 열기.
  dmTarget: { id: string; name: string; handle: string; avatar: string } | null;
  openDmWith: (u: { id: string; name: string; handle: string; avatar: string }) => void;
  clearDmTarget: () => void;
  hydrated: boolean;
  // Full-screen views (e.g. a DM conversation) hide the bottom tab bar.
  hideTabBar: boolean;
  setHideTabBar: (v: boolean) => void;
  // Any overlay (modal / full-screen sheet) registers a close fn on open so the
  // browser back button can dismiss it.
  openOverlay: (close: () => void) => void;
  dropOverlay: (close: () => void) => void;
};

const ShellContext = createContext<ShellValue | undefined>(undefined);

function pushHistory(marker: Record<string, unknown>) {
  if (!isWeb) return;
  try {
    window.history.pushState({ ...(window.history.state || {}), ...marker }, '');
  } catch {
    // ignore
  }
}

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthedState] = useState(false);
  const [tab, setTabState] = useState<ShellTab>('home');
  const [showReview, setShowReviewState] = useState(false);
  const [detailStore, setDetailStore] = useState<ReservableStore | null>(null);
  const [biteComposer, setBiteComposer] = useState(false);
  const [biteEditId, setBiteEditId] = useState<string | null>(null);
  const [biteViewerId, setBiteViewerId] = useState<string | null>(null);
  const [infoSheet, setInfoSheet] = useState<InfoKey | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const [followList, setFollowList] = useState<{ uid: string; mode: 'followers' | 'following' } | null>(
    null
  );
  const [dmTarget, setDmTarget] = useState<
    { id: string; name: string; handle: string; avatar: string } | null
  >(null);
  const [hideTabBar, setHideTabBar] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const overlaysRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(AUTH_KEY);
        if (v === 'true') setAuthedState(true);
      } catch (e) {
        console.log('로그인 상태 불러오기 실패', e);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // 새로고침해도 보던 탭에 남는다 — 현재 탭을 세션에 저장해 두고, 다시 뜰 때 복원.
  // (앱은 URL이 아니라 탭 상태로 화면을 바꾸므로, 저장 안 하면 새로고침마다 홈으로 튄다.)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const saved = window.sessionStorage.getItem('peed_tab') as ShellTab | null;
      const valid: ShellTab[] = ['home', 'burning', 'peed', 'my', 'settings', 'dm', 'game'];
      if (saved && valid.includes(saved)) setTabState(saved);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      window.sessionStorage.setItem('peed_tab', tab);
    } catch {
      // ignore
    }
  }, [tab]);

  const setAuthed = useCallback((v: boolean) => {
    setAuthedState(v);
    AsyncStorage.setItem(AUTH_KEY, v ? 'true' : 'false').catch(() => {});
  }, []);

  const openOverlay = useCallback((close: () => void) => {
    overlaysRef.current.push(close);
    pushHistory({ peedOverlay: overlaysRef.current.length });
  }, []);

  const dropOverlay = useCallback((close: () => void) => {
    overlaysRef.current = overlaysRef.current.filter((f) => f !== close);
  }, []);

  const closeReview = useCallback(() => setShowReviewState(false), []);

  const setShowReview = useCallback(
    (v: boolean) => {
      if (v) {
        setShowReviewState(true);
        openOverlay(closeReview);
      } else {
        setShowReviewState(false);
        dropOverlay(closeReview);
      }
    },
    [openOverlay, dropOverlay, closeReview]
  );

  const setTab = useCallback((t: ShellTab) => {
    setTabState(t);
    pushHistory({ peedTab: t });
  }, []);

  const closeStoreDetailFn = useCallback(() => setDetailStore(null), []);
  const openStoreDetail = useCallback(
    (store: ReservableStore) => {
      setDetailStore(store);
      openOverlay(closeStoreDetailFn);
    },
    [openOverlay, closeStoreDetailFn]
  );
  const closeStoreDetail = useCallback(() => {
    setDetailStore(null);
    dropOverlay(closeStoreDetailFn);
  }, [dropOverlay, closeStoreDetailFn]);

  const closeBiteComposerFn = useCallback(() => {
    setBiteComposer(false);
    setBiteEditId(null);
  }, []);
  const openBiteComposer = useCallback(
    (biteId?: string) => {
      setBiteEditId(biteId ?? null);
      setBiteComposer(true);
      openOverlay(closeBiteComposerFn);
    },
    [openOverlay, closeBiteComposerFn]
  );
  const closeBiteComposer = useCallback(() => {
    setBiteComposer(false);
    setBiteEditId(null);
    dropOverlay(closeBiteComposerFn);
  }, [dropOverlay, closeBiteComposerFn]);

  const closeBiteViewerFn = useCallback(() => setBiteViewerId(null), []);
  const openBiteViewer = useCallback(
    (id: string) => {
      setBiteViewerId(id);
      openOverlay(closeBiteViewerFn);
    },
    [openOverlay, closeBiteViewerFn]
  );
  const closeBiteViewer = useCallback(() => {
    setBiteViewerId(null);
    dropOverlay(closeBiteViewerFn);
  }, [dropOverlay, closeBiteViewerFn]);

  const closeInfoSheetFn = useCallback(() => setInfoSheet(null), []);
  const openInfoSheet = useCallback(
    (key: InfoKey) => {
      setInfoSheet(key);
      openOverlay(closeInfoSheetFn);
    },
    [openOverlay, closeInfoSheetFn]
  );
  const closeInfoSheet = useCallback(() => {
    setInfoSheet(null);
    dropOverlay(closeInfoSheetFn);
  }, [dropOverlay, closeInfoSheetFn]);

  const closeSearchFn = useCallback(() => setSearchOpen(false), []);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    openOverlay(closeSearchFn);
  }, [openOverlay, closeSearchFn]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    dropOverlay(closeSearchFn);
  }, [dropOverlay, closeSearchFn]);

  const closeUserFn = useCallback(() => setViewUserId(null), []);
  const viewUser = useCallback(
    (uid: string) => {
      if (!uid) return;
      setViewUserId(uid);
      openOverlay(closeUserFn);
    },
    [openOverlay, closeUserFn]
  );
  const closeUser = useCallback(() => {
    setViewUserId(null);
    dropOverlay(closeUserFn);
  }, [dropOverlay, closeUserFn]);

  const closeFollowListFn = useCallback(() => setFollowList(null), []);
  const openFollowList = useCallback(
    (uid: string, mode: 'followers' | 'following') => {
      if (!uid) return;
      setFollowList({ uid, mode });
      openOverlay(closeFollowListFn);
    },
    [openOverlay, closeFollowListFn]
  );
  const closeFollowList = useCallback(() => {
    setFollowList(null);
    dropOverlay(closeFollowListFn);
  }, [dropOverlay, closeFollowListFn]);

  const openDmWith = useCallback(
    (u: { id: string; name: string; handle: string; avatar: string }) => {
      if (!u?.id) return;
      setDmTarget(u);
      setTabState('dm');
      pushHistory({ peedTab: 'dm' });
    },
    []
  );
  const clearDmTarget = useCallback(() => setDmTarget(null), []);

  // Browser back: close the topmost overlay if any, otherwise restore the tab.
  useEffect(() => {
    if (!isWeb) return;
    const onPop = (e: PopStateEvent) => {
      if (overlaysRef.current.length) {
        const close = overlaysRef.current.pop();
        close?.();
        return;
      }
      const state = e.state as { peedTab?: ShellTab } | null;
      setTabState(state?.peedTab ?? 'home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo(
    () => ({
      authed,
      setAuthed,
      tab,
      setTab,
      showReview,
      setShowReview,
      detailStore,
      openStoreDetail,
      closeStoreDetail,
      biteComposer,
      biteEditId,
      openBiteComposer,
      closeBiteComposer,
      biteViewerId,
      openBiteViewer,
      closeBiteViewer,
      infoSheet,
      openInfoSheet,
      closeInfoSheet,
      searchOpen,
      openSearch,
      closeSearch,
      viewUserId,
      viewUser,
      closeUser,
      followList,
      openFollowList,
      closeFollowList,
      dmTarget,
      openDmWith,
      clearDmTarget,
      hydrated,
      hideTabBar,
      setHideTabBar,
      openOverlay,
      dropOverlay,
    }),
    [
      authed,
      setAuthed,
      tab,
      setTab,
      showReview,
      setShowReview,
      detailStore,
      openStoreDetail,
      closeStoreDetail,
      biteComposer,
      biteEditId,
      openBiteComposer,
      closeBiteComposer,
      biteViewerId,
      openBiteViewer,
      closeBiteViewer,
      infoSheet,
      openInfoSheet,
      closeInfoSheet,
      searchOpen,
      openSearch,
      closeSearch,
      viewUserId,
      viewUser,
      closeUser,
      followList,
      openFollowList,
      closeFollowList,
      dmTarget,
      openDmWith,
      clearDmTarget,
      hydrated,
      hideTabBar,
      openOverlay,
      dropOverlay,
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error('useShell은 ShellProvider 안에서만 사용할 수 있어요.');
  }
  return ctx;
}
