import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from './AppHeader';
import BurningScreen from './bruning';
import MyScreen from './my';
import PeedScreen from './peed';
import ReviewScreen from './review';

const BRAND_BLUE = '#4F6BFF';

/**
 * 개발 환경에 따라 바꿔야 할 수 있음
 * - 웹: http://127.0.0.1:4000
 * - 안드로이드 에뮬레이터: http://10.0.2.2:4000
 * - 실기기: http://내PC로컬IP:4000
 */
const API_BASE_URL = 'http://127.0.0.1:4000';

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

type StoreDetailProps = {
  onClose: () => void;
  onPressLogo: () => void;
  store?: StoreData | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function StoreDetail({ onClose, onPressLogo, store }: StoreDetailProps) {
  const imageUrls = useMemo(() => {
    if (Array.isArray(store?.imageUrls) && store.imageUrls.length > 0) {
      return store.imageUrls.filter(Boolean).slice(0, 10);
    }

    if (store?.representativeImageUrl) {
      return [store.representativeImageUrl];
    }

    return [];
  }, [store?.imageUrls, store?.representativeImageUrl]);

  const displayAddress = store?.roadAddress || store?.address || '-';
  const displayPb = store?.pbReward ?? 0;

  const burningPeriod =
    store?.burningStartAt || store?.burningEndAt
      ? `${formatDateTime(store?.burningStartAt)} ~ ${formatDateTime(
          store?.burningEndAt
        )}`
      : '-';

  const openNaverPlace = async () => {
    if (!store?.naverPlaceUrl) {
      Alert.alert('안내', '네이버 플레이스 URL이 없습니다.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(store.naverPlaceUrl);

      if (!supported) {
        Alert.alert('오류', '네이버 플레이스를 열 수 없습니다.');
        return;
      }

      await Linking.openURL(store.naverPlaceUrl);
    } catch {
      Alert.alert('오류', '네이버 플레이스를 여는 중 문제가 발생했습니다.');
    }
  };

  return (
    <SafeAreaView style={detailStyles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <AppHeader onPressLogo={onPressLogo} />

      <View style={detailStyles.headerRow}>
        <Text style={detailStyles.headerTitle}>매장 정보</Text>
        <TouchableOpacity style={detailStyles.closeButton} onPress={onClose}>
          <Text style={detailStyles.closeText}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={detailStyles.scroll}
        contentContainerStyle={detailStyles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={detailStyles.imageRow}
          >
            {imageUrls.map((url, index) => (
              <Image
                key={`${url}-${index}`}
                source={{ uri: url }}
                style={index === 0 ? detailStyles.mainImage : detailStyles.sideImage}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={detailStyles.emptyImageBox}>
            <Text style={detailStyles.emptyImageText}>매장 사진 없음</Text>
          </View>
        )}

        <View style={detailStyles.summaryCard}>
          <View style={detailStyles.summaryTopRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={detailStyles.storeName}>{store?.name || '-'}</Text>
              <Text style={detailStyles.storeCategory}>{store?.category || '-'}</Text>
            </View>

            <View style={detailStyles.summaryBadges}>
              {store?.isBurning ? (
                <View style={detailStyles.burningBadge}>
                  <Text style={detailStyles.burningBadgeText}>버닝</Text>
                </View>
              ) : null}

              <View style={detailStyles.pbBadge}>
                <Text style={detailStyles.pbBadgeText}>+{displayPb} PB</Text>
              </View>
            </View>
          </View>

          <Text style={detailStyles.addressText}>📍 {displayAddress}</Text>
        </View>

        <View style={detailStyles.infoCard}>
          <View style={detailStyles.sectionBadge}>
            <Text style={detailStyles.sectionBadgeText}>매장 정보</Text>
          </View>

          <InfoRow label="주소" value={displayAddress} />
          <InfoRow label="영업시간" value={store?.businessHours || '-'} />
          <InfoRow label="전화번호" value={store?.phone || '-'} />
          <InfoRow label="버닝 기간" value={burningPeriod} />
          <InfoRow label="설명" value={store?.description || '-'} />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={detailStyles.bottomBar}>
        <TouchableOpacity
          style={[
            detailStyles.bottomButton,
            !store?.naverPlaceUrl && { backgroundColor: '#CBD5E1' },
          ]}
          onPress={openNaverPlace}
        >
          <Text style={detailStyles.bottomButtonText}>
            네이버 플레이스에서 확인하기
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.infoRow}>
      <Text style={detailStyles.infoLabel}>{label}</Text>
      <Text style={detailStyles.infoValue}>{value}</Text>
    </View>
  );
}

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
          <View>
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
  const [showReview, setShowReview] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null);

  const [homeData, setHomeData] = useState<HomeData>({
    notices: [],
    burningStores: [],
    featuredPrizes: [],
    latestPrizes: [],
  });

  const [loadingHome, setLoadingHome] = useState(true);
  const [openingStore, setOpeningStore] = useState(false);
  const [homeError, setHomeError] = useState('');

  const featuredPrize = useMemo(() => {
    if (homeData.featuredPrizes.length > 0) return homeData.featuredPrizes[0];
    if (homeData.latestPrizes.length > 0) return homeData.latestPrizes[0];
    return null;
  }, [homeData]);

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
    setShowReview(false);
    setSelectedStore(null);
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
      return <MyScreen />;
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
        onPressLogo={goHome}
        store={selectedStore}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <AppHeader onPressLogo={goHome} />

      {renderContent()}

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
          onPress={() => setActiveTab('home')}
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
          <View
            style={activeTab === 'burning' ? styles.tabPillActive : styles.tabPill}
          >
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
          onPress={() => setActiveTab('my')}
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

const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  headerRow: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  closeText: {
    fontSize: 24,
    color: '#6B7280',
    marginTop: -2,
  },

  scroll: {
    flex: 1,
  },

  contentContainer: {
    paddingBottom: 110,
  },

  imageRow: {
    paddingHorizontal: 18,
  },

  mainImage: {
    width: 250,
    height: 190,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },

  sideImage: {
    width: 150,
    height: 190,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },

  emptyImageBox: {
    height: 190,
    marginHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyImageText: {
    color: '#6B7280',
    fontWeight: '700',
  },

  summaryCard: {
    marginHorizontal: 18,
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
  },

  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },

  summaryBadges: {
    alignItems: 'flex-end',
    gap: 8,
  },

  burningBadge: {
    backgroundColor: '#F3E8FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },

  burningBadgeText: {
    color: '#7C3AED',
    fontSize: 13,
    fontWeight: '800',
  },

  storeName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },

  storeCategory: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },

  pbBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },

  pbBadgeText: {
    color: BRAND_BLUE,
    fontSize: 13,
    fontWeight: '800',
  },

  addressText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },

  infoCard: {
    marginHorizontal: 18,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
  },

  sectionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 16,
  },

  sectionBadgeText: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
  },

  infoRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  infoLabel: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },

  infoValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },

  bottomButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});