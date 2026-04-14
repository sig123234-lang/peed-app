import { useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    FlatList,
    Image,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width } = Dimensions.get('window');

const BRAND_BLUE = '#4F6BFF';
const CARD_WIDTH = width - 56;

type PrizeItem = {
  id: string;
  name: string;
  priceLabel: string;
  pbCost: number;
  image: any;
  totalEntries: number;
  myEntries: number;
  winnerCount: number;
  maxEntries: number;
  announcementDate: string;
};

const initialPrizes: PrizeItem[] = [
  {
    id: 'iphone17pro',
    name: '아이폰 17 PRO',
    priceLabel: '₩1,790,000',
    pbCost: 40,
    image: require('../../assets/images/iphone17pro.jpg'),
    totalEntries: 128,
    myEntries: 0,
    winnerCount: 1,
    maxEntries: 200,
    announcementDate: '4월 20일',
  },
  {
    id: 'hotelvoucher',
    name: '프리미엄 호텔 상품권 10만원',
    priceLabel: '₩100,000',
    pbCost: 10,
    image: require('../../assets/images/hotel-voucher.png'),
    totalEntries: 274,
    myEntries: 0,
    winnerCount: 3,
    maxEntries: 350,
    announcementDate: '4월 14일',
  },
];

const getWinRate = (my: number, max: number, winners: number) => {
  if (!my || !max) return '0%';
  const rate = (my / max) * winners * 100;
  return `${rate.toFixed(1)}%`;
};

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export default function PeedScreen() {
  const [prizes, setPrizes] = useState<PrizeItem[]>(initialPrizes);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);

  const [selectedPrizeId, setSelectedPrizeId] = useState<string | null>(null);
  const [applyCount, setApplyCount] = useState(1);
  const [cancelCount, setCancelCount] = useState(1);

  const flatListRef = useRef<FlatList>(null);

  const selectedPrize =
    prizes.find((item) => item.id === selectedPrizeId) ?? null;

  const openApplyModal = (prizeId: string) => {
    const target = prizes.find((item) => item.id === prizeId);
    if (!target) return;

    if (target.totalEntries >= target.maxEntries) {
      Alert.alert('응모 마감', '이 경품은 가능한 응모 수량이 모두 찼어요.');
      return;
    }

    setSelectedPrizeId(prizeId);
    setApplyCount(1);
    setApplyModalVisible(true);
  };

  const openCancelModal = (prizeId: string) => {
    const target = prizes.find((item) => item.id === prizeId);

    if (!target || target.myEntries <= 0) {
      Alert.alert('알림', '취소할 응모 내역이 없어요.');
      return;
    }

    setSelectedPrizeId(prizeId);
    setCancelCount(1);
    setCancelModalVisible(true);
  };

  const handleApplyConfirm = () => {
    if (!selectedPrize) return;

    if (selectedPrize.totalEntries + applyCount > selectedPrize.maxEntries) {
      const remainingEntries =
        selectedPrize.maxEntries - selectedPrize.totalEntries;

      Alert.alert(
        '응모 불가',
        remainingEntries > 0
          ? `남은 응모 가능 횟수는 ${remainingEntries}회예요.`
          : '이 경품은 가능한 응모 수량이 모두 찼어요.'
      );
      return;
    }

    setPrizes((prev) =>
      prev.map((item) =>
        item.id === selectedPrize.id
          ? {
              ...item,
              myEntries: item.myEntries + applyCount,
              totalEntries: item.totalEntries + applyCount,
            }
          : item
      )
    );

    setApplyModalVisible(false);

    Alert.alert(
      '응모 완료',
      `${selectedPrize.name}에 ${applyCount}회 응모했어요.`
    );
  };

  const handleCancelConfirm = () => {
    if (!selectedPrize) return;

    if (selectedPrize.myEntries < cancelCount) {
      Alert.alert('취소 불가', '내 응모 횟수보다 많이 취소할 수 없어요.');
      return;
    }

    setPrizes((prev) =>
      prev.map((item) =>
        item.id === selectedPrize.id
          ? {
              ...item,
              myEntries: item.myEntries - cancelCount,
              totalEntries: Math.max(0, item.totalEntries - cancelCount),
            }
          : item
      )
    );

    setCancelModalVisible(false);

    Alert.alert(
      '응모 취소 완료',
      `${selectedPrize.name} 응모 ${cancelCount}회를 취소했어요.`
    );
  };

  const onMomentumScrollEnd = (event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    const nextIndex = Math.round(x / CARD_WIDTH);
    setCurrentIndex(nextIndex);
  };

  const renderPrizeCard = ({ item }: { item: PrizeItem }) => {
    const isSoldOut = item.totalEntries >= item.maxEntries;

    return (
      <View style={styles.slideCard}>
        <View style={styles.prizeImageWrap}>
          <Image
            source={item.image}
            style={styles.prizeImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.infoCard}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.prizeName}>{item.name}</Text>
              <Text style={styles.priceText}>시가 {item.priceLabel}</Text>
            </View>

            <View style={styles.pbBadge}>
              <Text style={styles.pbBadgeText}>{item.pbCost}PB</Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <MetaItem label="가능한 응모" value={`${item.maxEntries}회`} />
            <MetaItem label="내 응모" value={`${item.myEntries}회`} />
            <MetaItem label="총 응모" value={`${item.totalEntries}회`} />
            <MetaItem label="당첨 인원" value={`${item.winnerCount}명`} />
            <MetaItem label="발표일" value={item.announcementDate} />
            <MetaItem
              label="당첨 확률"
              value={getWinRate(
                item.myEntries,
                item.maxEntries,
                item.winnerCount
              )}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => openCancelModal(item.id)}
            >
              <Text style={styles.cancelButtonText}>응모 취소</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.applyButton, isSoldOut && styles.applyButtonDisabled]}
              onPress={() => {
                if (!isSoldOut) openApplyModal(item.id);
              }}
              disabled={item.totalEntries >= item.maxEntries}
            >
              <Text
                style={[
                  styles.applyButtonText,
                  isSoldOut && styles.applyButtonTextDisabled,
                ]}
              >
                {isSoldOut ? '응모 마감' : '응모하기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>응모 가능한 경품</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={prizes}
        keyExtractor={(item) => item.id}
        renderItem={renderPrizeCard}
        horizontal
        pagingEnabled
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sliderContent}
        onMomentumScrollEnd={onMomentumScrollEnd}
      />

      <View style={styles.pagination}>
        {prizes.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.dot,
              currentIndex === index && styles.dotActive,
            ]}
          />
        ))}
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={applyModalVisible}
        onRequestClose={() => setApplyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>응모하시겠습니까?</Text>

            {selectedPrize && (
              <>
                <Text style={styles.modalPrizeName}>{selectedPrize.name}</Text>
                <Text style={styles.modalDesc}>
                  1회 응모에 {selectedPrize.pbCost}PB가 사용됩니다.
                </Text>
                <Text style={styles.modalDesc}>
                  남은 응모 가능 횟수:{' '}
                  {selectedPrize.maxEntries - selectedPrize.totalEntries}회
                </Text>

                <View style={styles.counterBox}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setApplyCount((prev) => Math.max(1, prev - 1))}
                  >
                    <Text style={styles.counterButtonText}>-</Text>
                  </TouchableOpacity>

                  <Text style={styles.counterValue}>{applyCount}</Text>

                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => {
                      if (!selectedPrize) return;

                      const remainingEntries =
                        selectedPrize.maxEntries - selectedPrize.totalEntries;

                      setApplyCount((prev) => Math.min(remainingEntries, prev + 1));
                    }}
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.totalPbText}>
                  총 사용 PB: {selectedPrize.pbCost * applyCount}PB
                </Text>
              </>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setApplyModalVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>취소</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyButton}
                onPress={handleApplyConfirm}
              >
                <Text style={styles.modalApplyButtonText}>응모하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={cancelModalVisible}
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>응모를 취소하시겠습니까?</Text>

            {selectedPrize && (
              <>
                <Text style={styles.modalPrizeName}>{selectedPrize.name}</Text>
                <Text style={styles.modalDesc}>
                  현재 내 응모: {selectedPrize.myEntries}회
                </Text>

                <View style={styles.counterBox}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setCancelCount((prev) => Math.max(1, prev - 1))}
                  >
                    <Text style={styles.counterButtonText}>-</Text>
                  </TouchableOpacity>

                  <Text style={styles.counterValue}>{cancelCount}</Text>

                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() =>
                      setCancelCount((prev) =>
                        Math.min(selectedPrize.myEntries, prev + 1)
                      )
                    }
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.totalPbText}>
                  반환 PB: {selectedPrize.pbCost * cancelCount}PB
                </Text>
              </>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setCancelModalVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>닫기</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyButton}
                onPress={handleCancelConfirm}
              >
                <Text style={styles.modalApplyButtonText}>응모 취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },

  headerTitle: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '800',
  },

  sliderContent: {
    paddingLeft: 20,
    paddingRight: 36,
  },

  slideCard: {
    width: CARD_WIDTH,
    marginRight: 16,
  },

  prizeImageWrap: {
    width: '100%',
    height: 250,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },

  prizeImage: {
    width: '100%',
    height: '100%',
  },

  infoCard: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },

  prizeName: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
    marginBottom: 4,
  },

  priceText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },

  pbBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  pbBadgeText: {
    color: BRAND_BLUE,
    fontSize: 13,
    fontWeight: '800',
  },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 16,
  },

  metaItem: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  metaLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
    marginBottom: 4,
  },

  metaValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '800',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  cancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  cancelButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '800',
  },

  applyButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  applyButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },

  applyButtonTextDisabled: {
    color: '#FFFFFF',
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },

  dotActive: {
    width: 20,
    backgroundColor: BRAND_BLUE,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
  },

  modalTitle: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
    marginBottom: 12,
  },

  modalPrizeName: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '800',
    marginBottom: 10,
  },

  modalDesc: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 4,
  },

  counterBox: {
    marginTop: 16,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },

  counterButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  counterButtonText: {
    fontSize: 22,
    color: BRAND_BLUE,
    fontWeight: '800',
  },

  counterValue: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
  },

  totalPbText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    marginBottom: 18,
  },

  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },

  modalCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalCancelButtonText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '800',
  },

  modalApplyButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalApplyButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '800',
  },
});