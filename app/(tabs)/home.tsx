import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from './AppHeader';
import BurningScreen from './burning';
import MyScreen from './my';
import PeedScreen from './peed';
import ReviewScreen from './review';
import StoreDetail from './storeDetail';

const BRAND_BLUE = '#4F6BFF';
const API_BASE_URL = 'http://172.30.1.65:4000';

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

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<'home' | 'burning' | 'peed' | 'my'>('home');
  const [myInitialTab, setMyInitialTab] = useState<MyTabType>('reviews');
  const [showReview, setShowReview] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const [noticeModalVisible, setNoticeModalVisible] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const [homeData, setHomeData] = useState<HomeData>({
    notices: [],
    burningStores: [],
    featuredPrizes: [],
    latestPrizes: [],
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'n1',
      type: '공지',
      title: 'PEED 오픈 안내',
      body: '피드 서비스가 정식 오픈되었습니다. 공지를 확인해 보세요.',
      time: '방금 전',
      unread: true,
      noticeData: {
        title: 'PEED 오픈 안내',
        content:
          '피드 서비스가 정식 오픈되었습니다. 버닝 매장 방문 후 리뷰를 남기고 PB를 받아보세요.',
      },
    },
    {
      id: 'n2',
      type: '경품',
      title: '새 경품이 추가되었어요',
      body: '닌텐도 스위치 OLED 응모가 시작되었어요.',
      time: '10분 전',
      unread: true,
    },
    {
      id: 'n3',
      type: '당첨',
      title: '당첨 결과가 도착했어요',
      body: '응모한 경품의 당첨 여부를 확인해 보세요.',
      time: '1시간 전',
      unread: true,
    },
    {
      id: 'n4',
      type: '버닝',
      title: '새 버닝 매장이 추가되었어요',
      body: '지금 추가 PB를 받을 수 있는 매장이 열렸어요.',
      time: '2시간 전',
      unread: false,
    },
    {
      id: 'n5',
      type: 'PB',
      title: 'PB가 적립되었어요',
      body: '리뷰 인증 완료로 10PB가 적립되었어요.',
      time: '어제',
      unread: false,
    },
  ]);

  const [loadingHome, setLoadingHome] = useState(true);
  const [openingStore, setOpeningStore] = useState(false);
  const [homeError, setHomeError] = useState('');

  const featuredPrize = useMemo(() => {
    if (homeData.featuredPrizes.length > 0) return homeData.featuredPrizes[0];
    if (homeData.latestPrizes.length > 0) return homeData.latestPrizes[0];
    return null;
  }, [homeData]);

  const headerPbAmount = useMemo(() => {
    if (activeTab === 'my') return '128';
    if (activeTab === 'peed') return '48';
    if (activeTab === 'burning') return '32';
    return '128';
  }, [activeTab]);

  const unreadAlarmCount = useMemo(
    () => notifications.filter((item) => item.unread).length,
    [notifications]
  );

  const fetchHomeData = useCallback(async () => {
    try {
      setLoadingHome(true);
      setHomeError('');

      const response = await fetch(`${API_BASE_URL}/app/home`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || '홈 데이터를 불러오지 못했습니다.');
      }

      setHomeData({
        notices: Array.isArray(data?.home?.notices) ? data.home.notices : [],
        burningStores: Array.isArray(data?.home?.burningStores) ? data.home.burningStores : [],
        featuredPrizes: Array.isArray(data?.home?.featuredPrizes) ? data.home.featuredPrizes : [],
        latestPrizes: Array.isArray(data?.home?.latestPrizes) ? data.home.latestPrizes : [],
      });
    } catch (error: any) {
      setHomeError(error?.message || '홈 데이터를 불러오지 못했습니다.');
    } finally {
      setLoadingHome(false);
    }
  }, []);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  const goHome = () => {
    setActiveTab('home');
    setMyInitialTab('reviews');
    setShowReview(false);
    setSelectedStore(null);
    setIsNotificationOpen(false);
  };

  const toggleNotifications = () => {
    setIsNotificationOpen((prev) => !prev);
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) =>
      prev.map((item) => ({
        ...item,
        unread: false,
      }))
    );
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  const handleNotificationPress = (item: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === item.id
          ? {
              ...n,
              unread: false,
            }
          : n
      )
    );

    if (item.type === '공지' && item.noticeData) {
      setSelectedNotice(item.noticeData);
      setNoticeModalVisible(true);
      setIsNotificationOpen(false);
      removeNotification(item.id);
      return;
    }

    if (item.type === '경품') {
      setActiveTab('peed');
      setIsNotificationOpen(false);
      removeNotification(item.id);
      return;
    }

    if (item.type === '당첨') {
      setMyInitialTab('wins');
      setActiveTab('my');
      setIsNotificationOpen(false);
      removeNotification(item.id);
      return;
    }

    if (item.type === '버닝') {
      setIsNotificationOpen(false);
      removeNotification(item.id);
      return;
    }

    if (item.type === 'PB') {
      setIsNotificationOpen(false);
      removeNotification(item.id);
      return;
    }
  };

  const openStore = async (store: StoreData) => {
    try {
      setOpeningStore(true);

      const response = await fetch(`${API_BASE_URL}/app/stores/${store.id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || '매장 정보를 불러오지 못했습니다.');
      }

      setSelectedStore(data.store);
      setIsNotificationOpen(false);
    } catch (error: any) {
      Alert.alert('오류', error?.message || '매장 정보를 불러오지 못했습니다.');
    } finally {
      setOpeningStore(false);
    }
  };

  const renderContent = () => {
    if (activeTab === 'burning') {
      return (
        <BurningScreen
          onOpenStore={() => {
            if (homeData.burningStores.length === 0) {
              Alert.alert('안내', '버닝 매장이 없습니다.');
              return;
            }
            openStore(homeData.burningStores[0]);
          }}
          onPressReview={() => setShowReview(true)}
        />
      );
    }

    if (activeTab === 'peed') {
      return <PeedScreen />;
    }

    if (activeTab === 'my') {
      return <MyScreen initialTab={myInitialTab} />;
    }

    if (loadingHome) {
      return (
        <View style={styles.placeholderWrap}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
          <Text style={[styles.placeholderDesc, { marginTop: 12 }]}>
            홈 데이터를 불러오는 중...
          </Text>
        </View>
      );
    }

    if (homeError) {
      return (
        <View style={styles.placeholderWrap}>
          <Text style={styles.placeholderTitle}>홈 로딩 실패</Text>
          <Text style={styles.placeholderDesc}>{homeError}</Text>

          <TouchableOpacity style={styles.heroButton} onPress={fetchHomeData}>
            <Text style={styles.heroButtonText}>다시 불러오기</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>TODAY&apos;S REWARD</Text>
          <Text style={styles.heroTitle}>
            지금 바로 응모 가능한{'\n'}
            오늘의 경품
          </Text>
          <Text style={styles.heroDesc}>
            리뷰 남기고 PB를 모아 바로 응모해 보세요.
          </Text>

          <View style={styles.heroRewardCard}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.heroRewardTitle}>
                {featuredPrize?.title || '현재 진행 중인 경품이 없습니다'}
              </Text>
              <Text style={styles.heroRewardSubtitle}>
                {featuredPrize
                  ? `${featuredPrize.requiredPb ?? 0}PB로 응모 가능`
                  : '어드민에서 경품을 등록하면 여기에 표시됩니다'}
              </Text>
            </View>

            <View style={styles.heroPbCircle}>
              <Text style={styles.heroPbCircleText}>
                {featuredPrize ? `${featuredPrize.requiredPb ?? 0}PB` : '-'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.heroButton}
            onPress={() => setActiveTab('peed')}
          >
            <Text style={styles.heroButtonText}>응모 가능한 경품 보기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionEyebrow}>BURNING STORE</Text>
          <Text style={styles.sectionTitleLarge}>버닝 매장</Text>
          <Text style={styles.sectionDesc}>
            추가 PB를 받을 수 있는 매장을 확인해 보세요.
          </Text>

          {homeData.burningStores.length > 0 ? (
            homeData.burningStores.map((store, index) => (
              <View
                key={store.id}
                style={{ marginBottom: index === homeData.burningStores.length - 1 ? 0 : 12 }}
              >
                <StoreCard store={store} onPress={() => openStore(store)} />
              </View>
            ))
          ) : (
            <View style={styles.emptyStoresCard}>
              <Text style={styles.emptyStoresTitle}>버닝 매장이 아직 없습니다</Text>
              <Text style={styles.emptyStoresDesc}>
                어드민에서 버닝 매장을 등록하면 이곳에 자동으로 표시됩니다.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.sectionBottomButton}
            onPress={() => setActiveTab('burning')}
          >
            <Text style={styles.sectionBottomButtonText}>버닝 매장 보러가기</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    );
  };

  if (showReview) {
    return <ReviewScreen onBack={() => setShowReview(false)} />;
  }

  if (selectedStore) {
    return (
      <StoreDetail
        onClose={() => setSelectedStore(null)}
        store={selectedStore}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <AppHeader
        pbAmount={headerPbAmount}
        onPressLogo={goHome}
        onPressBell={toggleNotifications}
        unreadCount={unreadAlarmCount}
      />

      {renderContent()}

      {isNotificationOpen ? (
        <>
          <Pressable
            style={styles.notificationBackdrop}
            onPress={() => setIsNotificationOpen(false)}
          />

          <View style={styles.notificationPopup}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>알림</Text>

              <TouchableOpacity onPress={markAllNotificationsRead}>
                <Text style={styles.notificationReadAll}>모두 확인</Text>
              </TouchableOpacity>
            </View>

            {notifications.length === 0 ? (
              <View style={styles.notificationEmptyWrap}>
                <Text style={styles.notificationEmptyText}>
                  새로운 알림이 없습니다.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.notificationList}
                contentContainerStyle={styles.notificationListContent}
                showsVerticalScrollIndicator={false}
              >
                {notifications.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.notificationItem,
                      item.unread && styles.notificationItemUnread,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => handleNotificationPress(item)}
                  >
                    <View style={styles.notificationItemTop}>
                      <View style={styles.notificationTypeBadge}>
                        <Text style={styles.notificationTypeBadgeText}>
                          {item.type}
                        </Text>
                      </View>

                      <Text style={styles.notificationTime}>{item.time}</Text>
                    </View>

                    <View style={styles.notificationTitleRow}>
                      <Text style={styles.notificationItemTitle}>{item.title}</Text>
                      {item.unread ? <View style={styles.notificationUnreadDot} /> : null}
                    </View>

                    <Text style={styles.notificationBody}>{item.body}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      ) : null}

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

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setActiveTab('home');
            setMyInitialTab('reviews');
          }}
        >
          <View style={activeTab === 'home' ? styles.tabPillActive : styles.tabPill}>
            <Text style={activeTab === 'home' ? styles.tabActive : styles.tab}>
              홈
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('burning')}
        >
          <View style={activeTab === 'burning' ? styles.tabPillActive : styles.tabPill}>
            <Text style={activeTab === 'burning' ? styles.tabActive : styles.tab}>
              버닝
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowReview(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('peed')}
        >
          <View style={activeTab === 'peed' ? styles.tabPillActive : styles.tabPill}>
            <Text style={activeTab === 'peed' ? styles.tabActive : styles.tab}>
              피드
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => {
            setMyInitialTab('reviews');
            setActiveTab('my');
          }}
        >
          <View style={activeTab === 'my' ? styles.tabPillActive : styles.tabPill}>
            <Text style={activeTab === 'my' ? styles.tabActive : styles.tab}>
              마이
            </Text>
          </View>
        </TouchableOpacity>
      </View>
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
    height: 85,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    borderTopWidth: 1,
    borderColor: '#EEF2F7',
    zIndex: 999,
    elevation: 999,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabPill: {
    minWidth: 72,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  tabPillActive: {
    minWidth: 72,
    height: 38,   
    paddingHorizontal: 16,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },

  tab: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '700',
  },

  tabActive: {
    fontSize: 15,
    color: BRAND_BLUE,
    fontWeight: '800',
  },

  fab: {
    position: 'absolute',
    top: -28,
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND_BLUE,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1000,
    zIndex: 1000,
    borderWidth: 4,
    borderColor: '#F7F8FA',
  },

  fabText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginTop: -2,
  },
});