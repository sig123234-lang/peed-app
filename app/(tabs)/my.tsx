import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#4F6BFF';
const { width } = Dimensions.get('window');
const GRID_GAP = 4;
const GRID_ITEM_SIZE = (width - 36 - GRID_GAP * 2) / 3;

type TabType = 'reviews' | 'entries' | 'wins';

type MyScreenProps = {
  initialTab?: TabType;
};

type ReviewPost = {
  id: string;
  author: string;
  date: string;
  earnedPb: number;
  views: number;
  savedCount: number;
  storeName: string;
  storeCategory: string;
  storeAddress: string;
  isBurning: boolean;
  summary: string;
  content: string;
  peopleCount: string;
  totalPrice: string;
  menu: string;
  platform: string;
  images: any[];
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

const reviewPosts: ReviewPost[] = [
  {
    id: 'review-1',
    author: '김승현',
    date: '2026.04.08',
    earnedPb: 10,
    views: 128,
    savedCount: 14,
    storeName: '샤월의주방',
    storeCategory: '요리주점',
    storeAddress: '서울 마포구 와우산로21길 19 2층',
    isBurning: true,
    summary: '분위기 좋고 음식도 깔끔해서 만족스러웠어요.',
    content:
      '매장 분위기가 정말 좋았고 하이볼이랑 파스타 조합이 잘 어울렸어요. 사진도 예쁘게 나와서 재방문하고 싶은 곳이었어요.',
    peopleCount: '2명',
    totalPrice: '42,000원',
    menu: '파스타, 하이볼 2잔',
    platform: '네이버',
    images: [
      require('../../assets/images/review1.jpg'),
      require('../../assets/images/review2.jpg'),
      require('../../assets/images/review3.jpg'),
      require('../../assets/images/review4.jpg'),
    ],
  },
  {
    id: 'review-2',
    author: '김승현',
    date: '2026.04.04',
    earnedPb: 10,
    views: 96,
    savedCount: 8,
    storeName: '담벗',
    storeCategory: '한식주점',
    storeAddress: '서울 마포구 어울마당로 54 1층',
    isBurning: true,
    summary: '조용하게 술 한잔하기 좋은 곳이었어요.',
    content:
      '테이블 간격도 괜찮고 음식도 무난하게 맛있었어요. 친구랑 가볍게 얘기하면서 시간 보내기 좋았어요.',
    peopleCount: '2명',
    totalPrice: '38,000원',
    menu: '전, 막걸리, 사이드',
    platform: '카카오맵',
    images: [require('../../assets/images/review2.jpg')],
  },
  {
    id: 'review-3',
    author: '김승현',
    date: '2026.03.28',
    earnedPb: 5,
    views: 77,
    savedCount: 5,
    storeName: '연남 파스타 바',
    storeCategory: '양식',
    storeAddress: '서울 마포구 동교로38길 12',
    isBurning: false,
    summary: '파스타 맛이 진하고 분위기가 좋았어요.',
    content:
      '연남동 분위기랑 잘 어울리는 매장이었고 사진 찍기도 좋았어요. 데이트 코스로도 괜찮을 것 같아요.',
    peopleCount: '2명',
    totalPrice: '48,000원',
    menu: '파스타 2종, 에이드',
    platform: '구글',
    images: [require('../../assets/images/review3.jpg')],
  },
  {
    id: 'review-4',
    author: '김승현',
    date: '2026.03.21',
    earnedPb: 5,
    views: 51,
    savedCount: 2,
    storeName: '상수 하이볼클럽',
    storeCategory: '바 · 펍',
    storeAddress: '서울 마포구 독막로18길 7',
    isBurning: false,
    summary: '하이볼 종류가 다양하고 분위기가 좋았어요.',
    content:
      '저녁에 가볍게 한 잔 하기 좋은 느낌이었고 조명도 예뻐서 전체적으로 만족했어요.',
    peopleCount: '2명',
    totalPrice: '36,000원',
    menu: '하이볼 2잔, 안주',
    platform: '네이버',
    images: [require('../../assets/images/review4.jpg')],
  },
  {
    id: 'review-5',
    author: '김승현',
    date: '2026.03.17',
    earnedPb: 5,
    views: 34,
    savedCount: 1,
    storeName: '브런치하우스',
    storeCategory: '브런치 카페',
    storeAddress: '서울 마포구 연남동 101-22',
    isBurning: false,
    summary: '낮에 가볍게 방문하기 좋았어요.',
    content: '브런치 메뉴 구성이 무난하고 매장이 밝아서 사진 찍기 좋았어요.',
    peopleCount: '2명',
    totalPrice: '29,000원',
    menu: '브런치 플레이트, 커피',
    platform: '네이버',
    images: [require('../../assets/images/review1.jpg')],
  },
  {
    id: 'review-6',
    author: '김승현',
    date: '2026.03.11',
    earnedPb: 5,
    views: 44,
    savedCount: 3,
    storeName: '연희 디저트룸',
    storeCategory: '디저트 카페',
    storeAddress: '서울 서대문구 연희동 45-8',
    isBurning: false,
    summary: '디저트 비주얼이 예쁘고 조용했어요.',
    content:
      '전체적으로 깔끔하고 조용한 분위기라 이야기 나누기 좋았어요.',
    peopleCount: '2명',
    totalPrice: '21,000원',
    menu: '케이크, 커피',
    platform: '구글',
    images: [require('../../assets/images/review2.jpg')],
  },
];

const entryItems: EntryItem[] = [
  {
    id: 'entry-1',
    title: '아이폰 17 PRO',
    image: require('../../assets/images/iphone17pro.jpg'),
    myCount: 29,
    announcementDate: '2026.04.20',
    status: '응모중',
  },
  {
    id: 'entry-2',
    title: '프리미엄 호텔 상품권 10만원',
    image: require('../../assets/images/hotel-voucher.png'),
    myCount: 6,
    announcementDate: '2026.04.14',
    status: '응모중',
  },
];

const winItems: WinItem[] = [
  {
    id: 'win-1',
    title: '스타벅스 기프티콘',
    image: require('../../assets/images/hotel-voucher.png'),
    wonDate: '2026.03.02',
    status: '수령전',
  },
  {
    id: 'win-2',
    title: '아이폰 17 PRO',
    image: require('../../assets/images/iphone17pro.jpg'),
    wonDate: '2026.03.05',
    status: '배송중',
  },
  {
    id: 'win-3',
    title: '프리미엄 호텔 상품권',
    image: require('../../assets/images/hotel-voucher.png'),
    wonDate: '2026.03.10',
    status: '수령완료',
  },
];

export default function MyScreen({ initialTab = 'reviews' }: MyScreenProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedPost, setSelectedPost] = useState<ReviewPost | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const burningPosts = useMemo(
    () => reviewPosts.filter((post) => post.isBurning),
    []
  );

  const todayCount = 12;
  const feedCode = 'ABD12345';

  const openPost = (post: ReviewPost) => {
    setSelectedPost(post);
    setCurrentImageIndex(0);
    setDetailVisible(true);
  };

  const openNotice = () => {
    router.push('/notice');
  };

  const openTerms = () => {
    router.push('/terms');
  };

  const openSupport = () => {
    router.push('/support');
  };

  const getWinBadgeStyle = (status: WinItem['status']) => {
    if (status === '수령전') {
      return {
        wrap: styles.badgePending,
        text: styles.badgePendingText,
      };
    }

    if (status === '배송중') {
      return {
        wrap: styles.badgeShipping,
        text: styles.badgeShippingText,
      };
    }

    return {
      wrap: styles.badgeDone,
      text: styles.badgeDoneText,
    };
  };

  const renderReviewGrid = () => {
    if (burningPosts.length === 0) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>아직 버닝기록이 없어요</Text>
          <Text style={styles.emptyDesc}>
            버닝매장 방문 인증을 완료하면 여기에 게시글이 쌓여요.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.gridWrap}>
        {burningPosts.map((post) => (
          <TouchableOpacity
            key={post.id}
            style={styles.gridItem}
            onPress={() => openPost(post)}
            activeOpacity={0.9}
          >
            <Image source={post.images[0]} style={styles.gridImage} />
            {post.images.length > 1 && (
              <View style={styles.multiBadge}>
                <Text style={styles.multiBadgeText}>{post.images.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderEntries = () => {
    return (
      <View style={styles.listWrap}>
        {entryItems.map((item) => (
          <View key={item.id} style={styles.listCard}>
            <Image
              source={item.image}
              style={styles.listCardImage}
              resizeMode="cover"
            />
            <View style={styles.listCardInfo}>
              <Text style={styles.listCardTitle}>{item.title}</Text>
              <Text style={styles.listCardSub}>내 응모 {item.myCount}회</Text>
              <Text style={styles.listCardSub}>발표일 {item.announcementDate}</Text>
            </View>
            <View style={styles.smallBadge}>
              <Text style={styles.smallBadgeText}>{item.status}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderWins = () => {
    return (
      <View style={styles.listWrap}>
        {winItems.map((item) => {
          const badgeStyle = getWinBadgeStyle(item.status);

          return (
            <View key={item.id} style={styles.listCard}>
              <Image
                source={item.image}
                style={styles.listCardImage}
                resizeMode="cover"
              />
              <View style={styles.listCardInfo}>
                <Text style={styles.listCardTitle}>{item.title}</Text>
                <Text style={styles.listCardSub}>당첨일 {item.wonDate}</Text>
              </View>
              <View style={[styles.smallBadge, badgeStyle.wrap]}>
                <Text style={[styles.smallBadgeText, badgeStyle.text]}>
                  {item.status}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar style="dark" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <Image
              source={require('../../assets/images/profile.jpg')}
              style={styles.profileImage}
            />

            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>김승현</Text>
              <View style={styles.codeRow}>
                <Text style={styles.profileCode}>{feedCode}</Text>
                <TouchableOpacity style={styles.copyButton}>
                  <Text style={styles.copyButtonText}>복사</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TODAY</Text>
              <Text style={styles.statValue}>{todayCount}</Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TOTAL</Text>
              <Text style={styles.statValue}>{1286}</Text>
            </View>
          </View>

          <Text style={styles.profileDesc}>
            버닝매장 인증 게시글과 응모 내역, 당첨 내역을 한 번에 관리해 보세요.
          </Text>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={styles.topTabItem}
            onPress={() => setActiveTab('reviews')}
          >
            <Text
              style={
                activeTab === 'reviews'
                  ? styles.topTabTextActive
                  : styles.topTabText
              }
            >
              버닝기록
            </Text>
            {activeTab === 'reviews' && <View style={styles.topTabLine} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topTabItem}
            onPress={() => setActiveTab('entries')}
          >
            <Text
              style={
                activeTab === 'entries'
                  ? styles.topTabTextActive
                  : styles.topTabText
              }
            >
              응모중
            </Text>
            {activeTab === 'entries' && <View style={styles.topTabLine} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topTabItem}
            onPress={() => setActiveTab('wins')}
          >
            <Text
              style={
                activeTab === 'wins'
                  ? styles.topTabTextActive
                  : styles.topTabText
              }
            >
              당첨내역
            </Text>
            {activeTab === 'wins' && <View style={styles.topTabLine} />}
          </TouchableOpacity>
        </View>

        {activeTab === 'reviews' && renderReviewGrid()}
        {activeTab === 'entries' && renderEntries()}
        {activeTab === 'wins' && renderWins()}

        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem} onPress={openNotice}>
            <Text style={styles.menuItemText}>공지사항</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={openTerms}>
            <Text style={styles.menuItemText}>이용약관</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.lastMenuItem]}
            onPress={openSupport}
          >
            <Text style={styles.menuItemText}>고객센터</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal
        visible={detailVisible}
        animationType="slide"
        onRequestClose={() => setDetailVisible(false)}
      >
        <SafeAreaView style={styles.detailContainer} edges={['top', 'bottom']}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Text style={styles.detailBack}>←</Text>
            </TouchableOpacity>
            <Text style={styles.detailHeaderTitle}>게시물</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedPost && (
            <ScrollView
              style={styles.detailScroll}
              contentContainerStyle={styles.detailContent}
              showsVerticalScrollIndicator={false}
            >
              <FlatList
                data={selectedPost.images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, index) => `${selectedPost.id}-${index}`}
                renderItem={({ item }) => (
                  <Image source={item} style={styles.detailImage} resizeMode="cover" />
                )}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(
                    e.nativeEvent.contentOffset.x / width
                  );
                  setCurrentImageIndex(idx);
                }}
              />

              <View style={styles.imageCountBadge}>
                <Text style={styles.imageCountText}>
                  {currentImageIndex + 1}/{selectedPost.images.length}
                </Text>
              </View>

              <View style={styles.postMetaCard}>
                <View style={styles.postMetaTop}>
                  <View style={styles.authorRow}>
                    <Image
                      source={require('../../assets/images/profile.jpg')}
                      style={styles.authorImage}
                    />
                    <View>
                      <Text style={styles.authorName}>{selectedPost.author}</Text>
                      <Text style={styles.authorDate}>{selectedPost.date}</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.detailInfoSection}>
                <View style={styles.detailInfoCard}>
                  <View style={styles.detailInfoTop}>
                    <View>
                      <Text style={styles.detailStoreName}>
                        {selectedPost.storeName}
                      </Text>
                      <Text style={styles.detailStoreCategory}>
                        {selectedPost.storeCategory}
                      </Text>
                    </View>

                    {selectedPost.isBurning && (
                      <View style={styles.detailBurningBadge}>
                        <Text style={styles.detailBurningBadgeText}>
                          버닝 매장
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.detailStoreAddress}>
                    {selectedPost.storeAddress}
                  </Text>

                  <TouchableOpacity style={styles.detailStoreButton}>
                    <Text style={styles.detailStoreButtonText}>매장 보기</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailCardLabel}>한줄 평</Text>
                  <Text style={styles.detailSummaryText}>
                    {selectedPost.summary}
                  </Text>
                  <Text style={styles.detailSummarySub}>
                    방문 후 남긴 짧은 기록이에요.
                  </Text>
                </View>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    paddingBottom: 80,
  },

  profileCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    marginBottom: 18,
  },

  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  profileImage: {
    width: 82,
    height: 82,
    borderRadius: 41,
    marginRight: 16,
  },

  profileInfo: {
    flex: 1,
  },

  profileName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  profileCode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  copyButton: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DCE6FF',
  },

  copyButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE,
  },

  statRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 10,
  },

  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  statLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    marginBottom: 4,
  },

  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },

  profileDesc: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 21,
    color: '#4B5563',
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  topTabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },

  topTabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#9CA3AF',
  },

  topTabTextActive: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  topTabLine: {
    marginTop: 8,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: BRAND_BLUE,
  },

  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    justifyContent: 'flex-start',
  },

  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    borderRadius: 10,
  },

  gridImage: {
    width: '100%',
    height: '100%',
  },

  multiBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(17,24,39,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  multiBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  listWrap: {
    gap: 12,
  },

  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  listCardImage: {
    width: 84,
    height: 84,
    borderRadius: 16,
    marginRight: 14,
  },

  listCardInfo: {
    flex: 1,
  },

  listCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },

  listCardSub: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '600',
  },

  smallBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },

  smallBadgeText: {
    color: BRAND_BLUE,
    fontSize: 12,
    fontWeight: '800',
  },

  badgePending: {
    backgroundColor: '#F3F4F6',
  },

  badgePendingText: {
    color: '#6B7280',
  },

  badgeShipping: {
    backgroundColor: '#EEF2FF',
  },

  badgeShippingText: {
    color: '#4F6EF7',
  },

  badgeDone: {
    backgroundColor: '#EAFBF1',
  },

  badgeDoneText: {
    color: '#16A34A',
  },

  emptyWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  emptyDesc: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
  },

  menuSection: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },

  menuItem: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },

  lastMenuItem: {
    borderBottomWidth: 0,
  },

  menuItemText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  menuArrow: {
    fontSize: 22,
    lineHeight: 22,
    color: '#9CA3AF',
    fontWeight: '700',
  },

  detailContainer: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  detailHeader: {
    height: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  detailBack: {
    fontSize: 28,
    color: '#111827',
    fontWeight: '700',
  },

  detailHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },

  detailScroll: {
    flex: 1,
  },

  detailContent: {
    paddingBottom: 28,
  },

  detailImage: {
    width,
    height: width,
    backgroundColor: '#E5E7EB',
  },

  imageCountBadge: {
    position: 'absolute',
    right: 16,
    top: 18,
    backgroundColor: 'rgba(17,24,39,0.72)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  imageCountText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  postMetaCard: {
    marginHorizontal: 18,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  postMetaTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  authorImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },

  authorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },

  authorDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },

  detailInfoSection: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 12,
  },

  detailInfoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  detailInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },

  detailStoreName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },

  detailStoreCategory: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  detailBurningBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  detailBurningBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND_BLUE,
  },

  detailStoreAddress: {
    fontSize: 14,
    lineHeight: 21,
    color: '#4B5563',
    marginBottom: 12,
  },

  detailStoreButton: {
    height: 42,
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  detailStoreButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  detailCardLabel: {
    fontSize: 12,
    color: BRAND_BLUE,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },

  detailSummaryText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  detailSummarySub: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
  },
});