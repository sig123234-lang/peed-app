import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from './AppHeader';
import BurningScreen from './bruning';
import ReviewScreen from './review';

const BRAND_BLUE = '#4F6BFF';

type RewardItem = {
  id: number;
  title: string;
  subtitle: string;
  cost: string;
};

const rewardItems: RewardItem[] = [
  {
    id: 1,
    title: '프리미엄 호텔 숙박권',
    subtitle: '이번 주 응모 가능',
    cost: '3 PB',
  },
  {
    id: 2,
    title: '고급 다이닝 식사권',
    subtitle: '인기 경품',
    cost: '3 PB',
  },
  {
    id: 3,
    title: '럭셔리 라이프스타일 상품',
    subtitle: '스페셜 시즌 경품',
    cost: '5 PB',
  },
];

type StoreDetailProps = {
  onClose: () => void;
  onPressLogo: () => void;
};

function StoreDetail({ onClose, onPressLogo }: StoreDetailProps) {
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={detailStyles.imageRow}
        >
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop',
            }}
            style={detailStyles.mainImage}
          />
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1200&auto=format&fit=crop',
            }}
            style={detailStyles.sideImage}
          />
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=1200&auto=format&fit=crop',
            }}
            style={detailStyles.sideImage}
          />
        </ScrollView>

        <View style={detailStyles.summaryCard}>
          <View style={detailStyles.summaryTopRow}>
            <View>
              <Text style={detailStyles.storeName}>샤월의주방</Text>
              <Text style={detailStyles.storeCategory}>요리주점</Text>
            </View>

            <View style={detailStyles.pbBadge}>
              <Text style={detailStyles.pbBadgeText}>+10 PB</Text>
            </View>
          </View>

          <Text style={detailStyles.addressText}>
            📍 서울 마포구 와우산로21길 19 2층
          </Text>
        </View>

        <View style={detailStyles.infoCard}>
          <View style={detailStyles.sectionBadge}>
            <Text style={detailStyles.sectionBadgeText}>매장 정보</Text>
          </View>

          <InfoRow label="주소" value="서울 마포구 와우산로21길 19 2층" />
          <InfoRow label="영업시간" value="매일 17:00 - 02:00" />
          <InfoRow label="전화번호" value="02-000-0000" />
          <InfoRow label="대표메뉴" value="트러플 파스타, 하이볼, 감바스" />
          <InfoRow label="편의" value="예약, 포장, 단체 이용 가능" />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={detailStyles.bottomBar}>
        <TouchableOpacity style={detailStyles.bottomButton}>
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

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<'home' | 'burning' | 'feed' | 'my'>('home');
  const [showReview, setShowReview] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [showStore, setShowStore] = useState(false);

  const goHome = () => {
    setActiveTab('home');
    setShowReview(false);
    setShowRewards(false);
    setShowStore(false);
  };

  const renderContent = () => {
    if (activeTab === 'burning') {
      return (
        <BurningScreen
          onOpenStore={() => setShowStore(true)}
          onPressReview={() => setShowReview(true)}
        />
      );
    }

    if (activeTab === 'feed') {
      return (
        <View style={styles.placeholderWrap}>
          <Text style={styles.placeholderTitle}>피드</Text>
          <Text style={styles.placeholderDesc}>
            여기에 유저들이 올린 리뷰/인증 피드가 들어갈 예정이야
          </Text>
        </View>
      );
    }

    if (activeTab === 'my') {
      return (
        <View style={styles.placeholderWrap}>
          <Text style={styles.placeholderTitle}>마이</Text>
          <Text style={styles.placeholderDesc}>
            여기에 내 프로필, 적립 내역, 응모 내역이 들어갈 예정이야
          </Text>
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
            리뷰 남기고 PB를 모아 바로 응모해봐.
          </Text>

          <View style={styles.heroRewardCard}>
            <View>
              <Text style={styles.heroRewardTitle}>프리미엄 호텔 숙박권</Text>
              <Text style={styles.heroRewardSubtitle}>
                이번 주 가장 인기 있는 응모
              </Text>
            </View>
            <View style={styles.heroPbCircle}>
              <Text style={styles.heroPbCircleText}>3PB</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.heroButton}
            onPress={() => setShowRewards(true)}
          >
            <Text style={styles.heroButtonText}>응모 가능한 경품 보기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>버닝 매장</Text>
          <TouchableOpacity onPress={() => setActiveTab('burning')}>
            <Text style={styles.sectionMore}>전체보기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.storeCard}>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop',
            }}
            style={styles.storeImage}
          />

          <View style={styles.storeInfo}>
            <View style={styles.storeTopRow}>
              <View>
                <Text style={styles.storeName}>샤월의주방</Text>
                <Text style={styles.storeCategory}>요리주점</Text>
              </View>

              <View style={styles.storePbBadge}>
                <Text style={styles.storePbBadgeText}>+10</Text>
              </View>
            </View>

            <Text style={styles.storeAddress}>
              📍 서울 마포구 와우산로21길 19 2층
            </Text>

            <TouchableOpacity onPress={() => setShowStore(true)}>
              <Text style={styles.storeLink}>매장 보기 〉</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.storeCard}>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1200&auto=format&fit=crop',
            }}
            style={styles.storeImage}
          />

          <View style={styles.storeInfo}>
            <View style={styles.storeTopRow}>
              <View>
                <Text style={styles.storeName}>담벗</Text>
                <Text style={styles.storeCategory}>한식주점</Text>
              </View>

              <View style={styles.storePbBadge}>
                <Text style={styles.storePbBadgeText}>+10</Text>
              </View>
            </View>

            <Text style={styles.storeAddress}>
              📍 서울 마포구 어울마당로 54 1층
            </Text>

            <TouchableOpacity onPress={() => setShowStore(true)}>
              <Text style={styles.storeLink}>매장 보기 〉</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>오늘의 추천</Text>
          <TouchableOpacity>
            <Text style={styles.sectionMore}>전체보기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.storeCard}>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=1200&auto=format&fit=crop',
            }}
            style={styles.storeImage}
          />

          <View style={styles.storeInfo}>
            <View style={styles.storeTopRow}>
              <View>
                <Text style={styles.storeName}>연남 파스타 바</Text>
                <Text style={styles.storeCategory}>양식</Text>
              </View>

              <View style={styles.recommendBadge}>
                <Text style={styles.recommendBadgeText}>추천</Text>
              </View>
            </View>

            <Text style={styles.storeAddress}>
              📍 서울 마포구 동교로 38길 12
            </Text>

            <TouchableOpacity onPress={() => setShowStore(true)}>
              <Text style={styles.storeLink}>매장 보기 〉</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.storeCard}>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?q=80&w=1200&auto=format&fit=crop',
            }}
            style={styles.storeImage}
          />

          <View style={styles.storeInfo}>
            <View style={styles.storeTopRow}>
              <View>
                <Text style={styles.storeName}>상수 하이볼클럽</Text>
                <Text style={styles.storeCategory}>바 · 펍</Text>
              </View>

              <View style={styles.recommendBadge}>
                <Text style={styles.recommendBadgeText}>추천</Text>
              </View>
            </View>

            <Text style={styles.storeAddress}>
              📍 서울 마포구 독막로 18길 7
            </Text>

            <TouchableOpacity onPress={() => setShowStore(true)}>
              <Text style={styles.storeLink}>매장 보기 〉</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 110 }} />
      </ScrollView>
    );
  };

  if (showReview) {
    return <ReviewScreen onBack={() => setShowReview(false)} />;
  }

  if (showStore) {
    return (
      <StoreDetail
        onClose={() => setShowStore(false)}
        onPressLogo={goHome}
      />
    );
  }

  if (showRewards) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <AppHeader onPressLogo={goHome} />

        <View style={styles.rewardsHeader}>
          <TouchableOpacity onPress={() => setShowRewards(false)}>
            <Text style={styles.backButton}>←</Text>
          </TouchableOpacity>
          <Text style={styles.rewardsTitle}>응모 가능한 경품</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {rewardItems.map((item) => (
            <View key={item.id} style={styles.rewardCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rewardCardTitle}>{item.title}</Text>
                <Text style={styles.rewardCardSubtitle}>{item.subtitle}</Text>
              </View>

              <View style={styles.rewardRight}>
                <View style={styles.pbBadge}>
                  <Text style={styles.pbBadgeText}>{item.cost}</Text>
                </View>

                <TouchableOpacity style={styles.rewardApplyButton}>
                  <Text style={styles.rewardApplyButtonText}>응모하기</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={{ height: 110 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <AppHeader onPressLogo={goHome} />

      {renderContent()}

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
        >
          <Text style={activeTab === 'home' ? styles.tabActive : styles.tab}>
            홈
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('burning')}
        >
          <Text style={activeTab === 'burning' ? styles.tabActive : styles.tab}>
            버닝
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowReview(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('feed')}
        >
          <Text style={activeTab === 'feed' ? styles.tabActive : styles.tab}>
            피드
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => setActiveTab('my')}
        >
          <Text style={activeTab === 'my' ? styles.tabActive : styles.tab}>
            마이
          </Text>
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
    paddingTop: 4,
    paddingBottom: 0,
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
  },

  heroButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '800',
  },

  sectionMore: {
    fontSize: 14,
    color: BRAND_BLUE,
    fontWeight: '700',
  },

  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  storeImage: {
    width: 112,
    height: 112,
    borderRadius: 16,
    marginRight: 14,
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

  recommendBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },

  recommendBadgeText: {
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

  rewardsHeader: {
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  rewardsTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
  },

  backButton: {
    color: BRAND_BLUE,
    fontSize: 24,
    fontWeight: '800',
  },

  rewardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },

  rewardCardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },

  rewardCardSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },

  rewardRight: {
    alignItems: 'flex-end',
    gap: 10,
  },

  pbBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  pbBadgeText: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
  },

  rewardApplyButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  rewardApplyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 86,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingBottom: 10,
    zIndex: 999,
    elevation: 999,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
  },

  tab: {
    fontSize: 12,
    color: '#888888',
    fontWeight: '600',
  },

  tabActive: {
    fontSize: 12,
    color: BRAND_BLUE,
    fontWeight: '800',
  },

  fab: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BRAND_BLUE,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1000,
    zIndex: 1000,
  },

  fabText: {
    color: '#FFFFFF',
    fontSize: 30,
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
  },

  sideImage: {
    width: 150,
    height: 190,
    borderRadius: 20,
    marginRight: 10,
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
