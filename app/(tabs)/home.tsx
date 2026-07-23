import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameHub } from '@/components/game/GameHub';
import { HomeFeed } from '@/components/feed/HomeFeed';
import { StoreDetailScreen } from '@/components/store/StoreDetailScreen';
import { useDm } from '@/context/dm';
import { usePb } from '@/context/pb';
import { useReservations } from '@/context/reservations';
import { useShell } from '@/context/shell';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import AppHeader from './AppHeader';
import BurningScreen from './burning';
import DmScreen from './dm';
import MyScreen from './my';
import PeedScreen from './peed';
import PlayScreen from './play';
import StoreDetail from './storeDetail';
import SettingsScreen from '../settings';

const BRAND_BLUE = '#4F6BFF';
// 하단 탭바가 차지하는 높이 — 콘텐츠가 그 위로 올라오게 예약.
const TAB_BAR_HEIGHT = 56;

type StoreData = {
  id: string;
  name: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  phone?: string;
  businessHours?: string;
  description?: string;
  pbReward?: number;
  representativeImageUrl?: string;
  naverPlaceUrl?: string;
  imageUrls?: string[];
  isBurning?: boolean;
  burningStartAt?: string | null;
  burningEndAt?: string | null;
};

type PrizeData = {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  marketPrice?: number;
  requiredPb?: number;
  maxEntries?: number;
  totalEntries?: number;
  winnerCount?: number;
  announcementDate?: string | null;
  drawDate?: string | null;
  status?: string;
  isFeatured?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type NoticeData = {
  id: string;
  title: string;
  summary?: string;
  category?: string;
  isPinned?: boolean;
  publishedAt?: string | null;
  createdAt?: string;
};

type HomeData = {
  notices: NoticeData[];
  burningStores: StoreData[];
  featuredPrizes: PrizeData[];
  latestPrizes: PrizeData[];
};

type MyTabType = 'reviews' | 'entries' | 'wins';

type NotificationItem = {
  id: string;
  type: '공지' | '경품' | '버닝' | 'PB' | '당첨';
  title: string;
  body: string;
  time: string;
  unread: boolean;
  noticeData?: {
    title: string;
    content: string;
  };
};

function StoreCard({
  store,
  onPress,
}: {
  store: StoreData;
  onPress: () => void;
}) {
  const thumbnail =
    store.representativeImageUrl ||
    (Array.isArray(store.imageUrls) && store.imageUrls.length > 0
      ? store.imageUrls[0]
      : undefined);

  return (
    <View style={styles.storeCard}>
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.storeImage} />
      ) : (
        <View style={[styles.storeImage, styles.storeImageEmpty]}>
          <Text style={styles.storeImageEmptyText}>사진 없음</Text>
        </View>
      )}

      <View style={styles.storeInfo}>
        <View style={styles.storeTopRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.storeName}>{store.name}</Text>
            <Text style={styles.storeCategory}>{store.category || '-'}</Text>
          </View>

          <View style={styles.storePbBadge}>
            <Text style={styles.storePbBadgeText}>+{store.pbReward ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.storeAddress}>
          📍 {store.roadAddress || store.address || '-'}
        </Text>

        <TouchableOpacity onPress={onPress}>
          <Text style={styles.storeLink}>매장 보기 〉</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 하단 탭 버튼 — 아이콘 + 작은 라벨.
function NavTab({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navTab} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.navIconWrap}>
        <Ionicons
          name={(active ? icon : `${icon}-outline`) as any}
          size={20}
          color={active ? BRAND_BLUE : '#9CA3AF'}
        />
      </View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    tab: activeTab,
    setTab: setActiveTab,
    showReview,
    setShowReview,
    detailStore,
    closeStoreDetail,
    hideTabBar,
  } = useShell();
  const { openReserve } = useReservations();
  const { totalUnread: dmUnread } = useDm();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  // 홈화면에 설치된 스탠드얼론 PWA는 화면이 끝까지 차서(edge-to-edge) 안드로이드
  // 제스처바에 하단바가 붙는다. 세이프에어리어가 0으로 잡혀도 최소 여백을 확보.
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any)?.standalone === true);
  // 제스처바를 피할 최소 여백은 확보하되 상한(28)을 둬서 너무 커지지 않게.
  const bottomInset = Math.min(Math.max(insets.bottom, isStandalone ? 14 : 0), 28);
  const [myInitialTab, setMyInitialTab] = useState<MyTabType>('reviews');

  const [noticeModalVisible, setNoticeModalVisible] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<{
    title: string;
    content: string;
  } | null>(null);

  // 실 사용 전환 — 데모 알림 제거. 실제 활동이 생기면 채워진다.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const [openingStore, setOpeningStore] = useState(false);

  // 헤더 PB = 실제 보유 잔액(공유 컨텍스트).
  const { pb } = usePb();
  const headerPbAmount = useMemo(
    () => pb.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    [pb]
  );

  const unreadAlarmCount = useMemo(
    () => notifications.filter((item) => item.unread).length,
    [notifications]
  );

  // 서버 알림 로드 + 15초 폴링(팔로우/댓글/예약 등 이벤트로 서버가 생성).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const rel = (ts: number) => {
      const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      if (s < 60) return '방금';
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}분 전`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}시간 전`;
      const d = Math.floor(h / 24);
      return d === 1 ? '어제' : `${d}일 전`;
    };
    const load = () =>
      fetch('/api/public?action=notifs', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d?.notifs)) {
            setNotifications(
              d.notifs.map((n: any) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                time: rel(Number(n.ts) || Date.now()),
                unread: !n.read,
              }))
            );
          }
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  const goHome = () => {
    setActiveTab('home');
    setMyInitialTab('reviews');
    setShowReview(false);
    closeStoreDetail();
  };



  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };


  const renderContent = () => {
    if (activeTab === 'burning') {
      return <BurningScreen onPressReview={() => setShowReview(true)} />;
    }

    if (activeTab === 'peed') {
      // 데스크탑은 사이드바로 상위 이동하므로 경품 화면을 그대로. 모바일만
      // 하단 탭 제약 때문에 [경품·게임] 세그먼트 허브로 묶는다.
      return isDesktop ? <PeedScreen /> : <PlayScreen />;
    }

    if (activeTab === 'game') {
      // 데스크탑 사이드바 전용 진입점(모바일은 PB 탭 안 게임 서브탭 사용).
      return <GameHub />;
    }

    if (activeTab === 'my') {
      return <MyScreen initialTab={myInitialTab} />;
    }

    if (activeTab === 'settings') {
      return <SettingsScreen />;
    }

    if (activeTab === 'dm') {
      return <DmScreen />;
    }

    // Home tab → the 먹스타그램 social feed. Independent of the backend homeData
    // fetch; the feed comes from the shared FeedProvider.
    return <HomeFeed />;
  };

  // Review now renders as a blurred popup at the root (see _layout), so the feed
  // behind it stays mounted and blurred instead of being replaced.

  if (detailStore) {
    return (
      <StoreDetailScreen
        store={detailStore}
        onClose={closeStoreDetail}
        onReserve={() => openReserve(detailStore)}
        onReview={() => setShowReview(true)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      <AppHeader
        pbAmount={headerPbAmount}
        onPressLogo={goHome}
        onPressBell={() => router.push('/notifications')}
        onPressDm={() => setActiveTab('dm')}
        unreadCount={unreadAlarmCount}
        dmUnread={dmUnread}
      />

      {/* 탭 콘텐츠 — 모바일에선 (탭바 높이 + 홈 인디케이터 여백)만큼 공간 예약해
          콘텐츠가 안 가려지게. 탭바가 숨겨질 땐(대화방 등) 인디케이터 여백만 확보. */}
      <View
        style={{
          flex: 1,
          paddingBottom: isDesktop
            ? 0
            : hideTabBar
              ? bottomInset
              : TAB_BAR_HEIGHT + bottomInset,
        }}
      >
        {renderContent()}
      </View>


      <Modal
        visible={noticeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setNoticeModalVisible(false);
          setSelectedNotice(null);
        }}
      >
        <Pressable
          style={styles.noticeModalBackdrop}
          onPress={() => {
            setNoticeModalVisible(false);
            setSelectedNotice(null);
          }}
        >
          <Pressable style={styles.noticeModalCard}>
            <Text style={styles.noticeModalTitle}>
              {selectedNotice?.title || '공지'}
            </Text>

            <ScrollView
              style={styles.noticeModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.noticeModalContent}>
                {selectedNotice?.content || ''}
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.noticeModalButton}
              onPress={() => {
                setNoticeModalVisible(false);
                setSelectedNotice(null);
              }}
            >
              <Text style={styles.noticeModalButtonText}>확인</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {openingStore ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={BRAND_BLUE} />
            <Text style={styles.loadingText}>매장 정보를 불러오는 중...</Text>
          </View>
        </View>
      ) : null}

      {!isDesktop && !hideTabBar && (
      <View style={[styles.tabBar, { paddingBottom: 4 + bottomInset }]}>
        <NavTab
          icon="home"
          label="홈"
          active={activeTab === 'home'}
          onPress={() => {
            setActiveTab('home');
            setMyInitialTab('reviews');
          }}
        />
        <NavTab icon="flame" label="버닝" active={activeTab === 'burning'} onPress={() => setActiveTab('burning')} />

        {/* 가운데 리뷰 작성 — 라이즈드 그라데이션 버튼 + 라벨. 라벨을 붙여
            나머지 탭과 baseline이 맞아 붕 뜬 느낌이 사라진다. */}
        {/* 가운데 리뷰 — 바 안에 앉는 꽉 찬 그라데이션 스퀘어클(띄우지 않음) */}
        <View style={styles.fabCol}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowReview(true)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#7C5CFF', '#4F6BFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fabGradient}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* PB 탭 — 아이콘은 'P' 코인(활성 시 브랜드색으로 채움), 라벨은 PB */}
        <TouchableOpacity
          style={styles.navTab}
          onPress={() => setActiveTab('peed')}
          activeOpacity={0.6}
        >
          <View style={styles.navIconWrap}>
            <View style={[styles.pbCoin, activeTab === 'peed' && styles.pbCoinActive]}>
              <Text style={[styles.pbCoinText, activeTab === 'peed' && styles.pbCoinTextActive]}>
                P
              </Text>
            </View>
          </View>
          <Text style={[styles.navLabel, activeTab === 'peed' && styles.navLabelActive]}>PB</Text>
        </TouchableOpacity>
        <NavTab
          icon="person"
          label="마이"
          active={activeTab === 'my'}
          onPress={() => {
            setMyInitialTab('reviews');
            setActiveTab('my');
          }}
        />
      </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  placeholderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },

  placeholderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },

  placeholderDesc: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
  },

  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  scroll: {
    flex: 1,
  },

  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 110,
  },

  heroCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    marginBottom: 24,
  },

  heroEyebrow: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },

  heroTitle: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 10,
  },

  heroDesc: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },

  heroRewardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  heroRewardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },

  heroRewardSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },

  heroPbCircle: {
    minWidth: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },

  heroPbCircleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  heroButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  heroButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  sectionCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    marginBottom: 24,
  },

  sectionEyebrow: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },

  sectionTitleLarge: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 8,
  },

  sectionDesc: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },

  emptyStoresCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  emptyStoresTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },

  emptyStoresDesc: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
  },

  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 14,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  storeImage: {
    width: 112,
    height: 112,
    borderRadius: 16,
    marginRight: 14,
    backgroundColor: '#E5E7EB',
  },

  storeImageEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  storeImageEmptyText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 12,
  },

  storeInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },

  storeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  storeName: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },

  storeCategory: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },

  storePbBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },

  storePbBadgeText: {
    color: '#4F6BFF',
    fontSize: 13,
    fontWeight: '800',
  },

  storeAddress: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 10,
  },

  storeLink: {
    color: '#4F6BFF',
    fontSize: 15,
    fontWeight: '800',
  },

  sectionBottomButton: {
    height: 50,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },

  sectionBottomButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  notificationBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'transparent',
    zIndex: 1400,
  },

  notificationPopup: {
    position: 'absolute',
    top: 62,
    right: 12,
    width: 320,
    maxHeight: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 30,
    zIndex: 1500,
    overflow: 'hidden',
  },

  notificationHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  notificationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  notificationReadAll: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE,
  },

  notificationList: {
    maxHeight: 300,
  },

  notificationListContent: {
    paddingBottom: 8,
  },

  notificationEmptyWrap: {
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationEmptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },

  notificationItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  notificationItemUnread: {
    backgroundColor: '#F8FAFF',
  },

  notificationItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },

  notificationTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  notificationTypeBadgeText: {
    color: BRAND_BLUE,
    fontSize: 11,
    fontWeight: '800',
  },

  notificationTime: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },

  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },

  notificationItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  notificationUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  notificationBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#6B7280',
  },

  noticeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },

  noticeModalCard: {
    width: '100%',
    maxHeight: '72%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
  },

  noticeModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },

  noticeModalScroll: {
    maxHeight: 320,
  },

  noticeModalContent: {
    fontSize: 15,
    lineHeight: 24,
    color: '#4B5563',
  },

  noticeModalButton: {
    height: 48,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },

  noticeModalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(17,24,39,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },

  loadingBox: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  loadingText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },

  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0B1020',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    borderTopWidth: 1,
    borderColor: '#EEF1F7',
    overflow: 'visible',
    zIndex: 999,
    elevation: 20,
  },

  navTab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    // 아이콘+라벨 묶음을 살짝 내려서 가운데 플러스 버튼 높이에 맞춤
    transform: [{ translateY: 6 }],
  },

  navIconWrap: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  navLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  navLabelActive: {
    color: BRAND_BLUE,
    fontWeight: '800',
  },

  // 'P' 코인 — 아이콘과 동일한 24px. 비활성: 회색 테두리, 활성: 브랜드색 채움.
  pbCoin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pbCoinActive: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  pbCoinText: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: '900',
    color: '#9CA3AF',
    includeFontPadding: false,
    textAlign: 'center',
  },
  pbCoinTextActive: {
    color: '#FFFFFF',
  },

  // 가운데 리뷰 버튼 열 — 라벨 없이 버튼만. 바 안에 앉는 꽉 찬 스퀘어클.
  fabCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  fab: {
    borderRadius: 13,
    shadowColor: BRAND_BLUE,
    shadowOpacity: 0.32,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },

  fabGradient: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});