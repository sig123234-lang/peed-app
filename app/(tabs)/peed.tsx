import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppButton, GradientHeader, ProgressBar } from '@/components/ui/kit';
import { usePb } from '@/context/pb';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { APP_MAX_WIDTH, APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

const width = APP_WIDTH;

// 가운데 정렬 캐러셀: 카드 양옆 여백(SIDE)만큼 이전/다음 카드가 살짝 보이고,
// 스냅하면 항상 카드가 화면 중앙에 온다.
const SIDE = 30; // 양옆 여백 (peek)
const GAP = 12; // 카드 사이 간격
const CARD_WIDTH = width - SIDE * 2;
const SNAP = CARD_WIDTH + GAP;

const DEFAULT_PRIZE_IMG = {
  uri: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=800&q=80&auto=format&fit=crop',
};
const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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

// 실 사용 전환 — 데모 경품 제거. 실제 경품은 서버(/api/products)에서만 온다.
const initialPrizes: PrizeItem[] = [];

// Approximate win chance against the *actual* entry pool (total entries),
// scaled by the number of winners, capped at 100%.
const getWinRate = (my: number, total: number, winners: number) => {
  if (!my || !total) return '0%';
  const rate = Math.min(100, (my / total) * winners * 100);
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

export default function PeedScreen({ embedded = false }: { embedded?: boolean }) {
  const { pb, setBalance } = usePb();
  const isDesktop = useIsDesktop();
  const { height: winH } = useWindowDimensions();
  // 경품 이미지 높이를 화면 높이에 맞춰 유연하게 (작은 폰에선 작게, 큰 폰/태블릿엔 크게).
  const cardImageHeight = Math.round(Math.min(220, Math.max(120, winH * 0.2)));

  const [prizes, setPrizes] = useState<PrizeItem[]>(initialPrizes);

  const [applyModalVisible, setApplyModalVisible] = useState(false);

  const [selectedPrizeId, setSelectedPrizeId] = useState<string | null>(null);
  const [applyCount, setApplyCount] = useState(1);

  const flatListRef = useRef<FlatList>(null);

  // 관리자 경품 + 서버의 실제 응모 수(전체/내 응모)를 합쳐서 로드.
  const loadPrizes = useCallback(async () => {
    try {
      const [pr, rs] = await Promise.all([
        fetch('/api/products').then((r) => r.json()),
        fetch('/api/public?action=raffleState', { credentials: 'include' })
          .then((r) => r.json())
          .catch(() => ({})),
      ]);
      const my = (rs && rs.myEntries) || {};
      const tot = (rs && rs.totals) || {};
      const items: PrizeItem[] = (pr.products || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        priceLabel: `₩${comma(Number(p.price) || 0)}`,
        pbCost: Number(p.pbCost) || 0,
        image: p.image ? { uri: p.image } : DEFAULT_PRIZE_IMG,
        totalEntries: (tot[p.id] != null ? tot[p.id] : Number(p.totalEntries)) || 0,
        myEntries: my[p.id] || 0,
        winnerCount: Number(p.winners) || 1,
        maxEntries: Number(p.stock) || 100,
        announcementDate: p.announcementDate || '-',
      }));
      if (items.length) setPrizes(items);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    loadPrizes();
  }, [loadPrizes]);

  const selectedPrize =
    prizes.find((item) => item.id === selectedPrizeId) ?? null;

  const openApplyModal = (prizeId: string) => {
    const target = prizes.find((item) => item.id === prizeId);
    if (!target) return;

    if (target.totalEntries >= target.maxEntries) {
      Alert.alert('응모 마감', '이 경품은 가능한 응모 수량이 모두 찼어요.');
      return;
    }

    if (pb < target.pbCost) {
      Alert.alert(
        'PB 부족',
        `1회 응모에 ${target.pbCost}PB가 필요해요.\n현재 보유: ${pb}PB\n리뷰를 남기고 PB를 모아보세요.`
      );
      return;
    }

    setSelectedPrizeId(prizeId);
    setApplyCount(1);
    setApplyModalVisible(true);
  };

  const handleApplyConfirm = async () => {
    if (!selectedPrize) return;

    if (selectedPrize.totalEntries + applyCount > selectedPrize.maxEntries) {
      const remainingEntries = selectedPrize.maxEntries - selectedPrize.totalEntries;
      Alert.alert(
        '응모 불가',
        remainingEntries > 0
          ? `남은 응모 가능 횟수는 ${remainingEntries}회예요.`
          : '이 경품은 가능한 응모 수량이 모두 찼어요.'
      );
      return;
    }

    const prize = selectedPrize;

    // 응모 확정 전 확인 — 응모는 취소 불가라 명확히 고지하고 예/아니오를 받는다.
    const msg = `${prize.name}에 ${applyCount}회 응모합니다. (${prize.pbCost * applyCount}PB 사용)\n\n응모 후 취소는 불가능합니다. 응모하시겠습니까?`;
    const proceed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(msg)
        : await new Promise<boolean>((resolve) =>
            Alert.alert('응모 확인', msg, [
              { text: '아니오', style: 'cancel', onPress: () => resolve(false) },
              { text: '예', onPress: () => resolve(true) },
            ])
          );
    if (!proceed) return;

    setApplyModalVisible(false);

    // 서버에서 실제 PB 차감 + 응모 기록(진짜 응모). 응모는 확정되면 취소 불가.
    try {
      const r = await fetch('/api/public?action=enterRaffle', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: prize.id, count: applyCount }),
      });
      const d = await r.json();
      if (!d.ok) {
        if (d.error === 'insufficient_pb') {
          if (typeof d.balance === 'number') setBalance(d.balance);
          Alert.alert('PB 부족', `이 응모에는 ${prize.pbCost * applyCount}PB가 필요해요.`);
        } else {
          Alert.alert('응모 실패', '잠시 후 다시 시도해 주세요.');
        }
        return;
      }
      setBalance(d.balance);
      setPrizes((prev) =>
        prev.map((item) =>
          item.id === prize.id
            ? { ...item, myEntries: d.myEntries, totalEntries: d.totalEntries }
            : item
        )
      );
      Alert.alert('응모 완료', `${prize.name}에 ${applyCount}회 응모했어요.\n남은 PB ${d.balance}PB`);
    } catch {
      Alert.alert('응모 실패', '네트워크 오류로 응모하지 못했어요.');
    }
  };


  const renderCardBody = (item: PrizeItem) => {
    const isSoldOut = item.totalEntries >= item.maxEntries;
    const fillRate = item.maxEntries ? item.totalEntries / item.maxEntries : 0;

    return (
      <View style={styles.prizeCard}>
          <GradientHeader
            variant="brandDiagonal"
            rounded={false}
            style={styles.hotStrip}
          >
            <Text style={styles.hotStripLabel}>✦ HOT DROP</Text>
            <View style={styles.pbCostPill}>
              <Text style={styles.pbCostPillText}>{item.pbCost} PB</Text>
            </View>
          </GradientHeader>

          <View style={[styles.prizeImageWrap, { height: cardImageHeight }]}>
            <Image
              source={item.image}
              style={styles.prizeImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.infoPad}>
            <Text style={styles.prizeName}>{item.name}</Text>
            <Text style={styles.priceText}>시가 {item.priceLabel}</Text>

            <View style={styles.progressRow}>
              <ProgressBar value={fillRate} style={styles.progressBar} />
              <Text style={styles.progressLabel}>
                {item.totalEntries}/{item.maxEntries}
              </Text>
            </View>

            <View style={styles.metaGrid}>
              <MetaItem label="내 응모" value={`${item.myEntries}회`} />
              <MetaItem label="당첨 인원" value={`${item.winnerCount}명`} />
              <MetaItem label="발표일" value={item.announcementDate} />
              <MetaItem
                label="당첨 확률"
                value={getWinRate(
                  item.myEntries,
                  item.totalEntries,
                  item.winnerCount
                )}
              />
            </View>

            <View style={styles.buttonRow}>
              <AppButton
                label={isSoldOut ? '응모 마감' : '응모하기'}
                variant="coral"
                size="md"
                disabled={isSoldOut}
                onPress={() => openApplyModal(item.id)}
                style={styles.applyBtn}
              />
            </View>
          </View>
        </View>
    );
  };

  const headerEl = (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerKicker}>PEED DROP</Text>
        <Text style={styles.headerTitle}>응모 가능한 경품</Text>
      </View>
      <View style={styles.pbBalancePill}>
        <Text style={styles.pbBalanceEmoji}>💎</Text>
        <Text style={styles.pbBalanceText}>{pb} PB</Text>
      </View>
    </View>
  );

  const emptyEl = (
    <View style={styles.emptyPrize}>
      <Text style={styles.emptyPrizeEmoji}>🎁</Text>
      <Text style={styles.emptyPrizeTitle}>준비 중인 경품이 없어요</Text>
      <Text style={styles.emptyPrizeSub}>
        곧 새로운 경품이 올라와요.{'\n'}리뷰를 남기고 PB를 모아 두세요!
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {isDesktop ? (
        // Desktop — use the width: a responsive grid instead of a phone slider.
        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={styles.desktopScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.desktopWrap}>
            {!embedded && headerEl}
            {prizes.length === 0 ? (
              emptyEl
            ) : (
              <View style={styles.grid}>
                {prizes.map((item) => (
                  <View key={item.id} style={styles.gridCell}>
                    {renderCardBody(item)}
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.stage}>
          {!embedded && headerEl}

          {prizes.length === 0 ? (
            emptyEl
          ) : (
            <FlatList
              ref={flatListRef}
              style={{ flex: 1 }}
              data={prizes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.slideCard}>{renderCardBody(item)}</View>
              )}
              horizontal
              snapToInterval={SNAP}
              snapToAlignment="start"
              disableIntervalMomentum
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sliderContent}
            />
          )}
        </View>
      )}

      {/* ---- apply modal ---- */}
      <Modal
        transparent
        animationType="fade"
        visible={applyModalVisible}
        onRequestClose={() => setApplyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>응모하시겠어요?</Text>

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
                <Text style={styles.modalDesc}>보유 PB: {pb}PB</Text>

                <View style={styles.counterBox}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setApplyCount((prev) => Math.max(1, prev - 1))}
                  >
                    <Text style={styles.counterButtonText}>−</Text>
                  </TouchableOpacity>

                  <Text style={styles.counterValue}>{applyCount}</Text>

                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => {
                      if (!selectedPrize) return;

                      const remainingEntries =
                        selectedPrize.maxEntries - selectedPrize.totalEntries;
                      const maxAffordable = Math.floor(pb / selectedPrize.pbCost);
                      const cap = Math.min(remainingEntries, maxAffordable);

                      setApplyCount((prev) => Math.min(cap, prev + 1));
                    }}
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.totalPbBox}>
                  <Text style={styles.totalPbLabel}>총 사용 PB</Text>
                  <Text style={styles.totalPbValue}>
                    {selectedPrize.pbCost * applyCount}PB
                  </Text>
                </View>
              </>
            )}

            <View style={styles.modalButtonRow}>
              <AppButton
                label="취소"
                variant="ghost"
                size="md"
                onPress={() => setApplyModalVisible(false)}
                style={{ flex: 1 }}
              />
              <AppButton
                label="응모하기"
                variant="coral"
                size="md"
                onPress={handleApplyConfirm}
                style={{ flex: 1 }}
              />
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
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  stage: {
    width: APP_WIDTH,
    flex: 1,
  },

  /* empty state */
  emptyPrize: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyPrizeEmoji: {
    fontSize: 44,
    marginBottom: spacing.xs,
  },
  emptyPrizeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptyPrizeSub: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  /* desktop grid */
  desktopScroll: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  // 홈 피드·버닝맵과 같은 폭으로 맞춘다 — 화면마다 본문 폭이 달라지면
  // 탭을 옮길 때마다 콘텐츠 기준선이 흔들려 보인다.
  desktopWrap: {
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
  },
  grid: {
    marginTop: spacing.md,
    gap: spacing.xl,
  },
  gridCell: {
    width: '100%',
  },

  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerKicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },

  headerTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },

  pbBalancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },

  pbBalanceEmoji: {
    fontSize: 13,
  },

  pbBalanceText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },

  sliderContent: {
    paddingHorizontal: SIDE,
    paddingTop: spacing.sm,
  },

  slideCard: {
    width: CARD_WIDTH,
    marginRight: GAP,
  },

  prizeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    ...shadow.card,
  },

  hotStrip: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  hotStripLabel: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  pbCostPill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },

  pbCostPillText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },

  prizeImageWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.card,
  },

  prizeImage: {
    width: '100%',
    height: '100%',
  },

  infoPad: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  prizeName: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '800',
    marginBottom: 4,
  },

  priceText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.md,
  },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },

  progressBar: {
    flex: 1,
  },

  progressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '800',
  },

  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
    marginBottom: spacing.lg,
  },

  metaItem: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },

  metaLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: 4,
  },

  metaValue: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '800',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  cancelBtn: {
    flex: 1,
  },

  applyBtn: {
    flex: 1.4,
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lineStrong,
  },

  dotActive: {
    width: 22,
    backgroundColor: colors.coral,
  },

  /* ---- modals ---- */

  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },

  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
  },

  modalTitle: {
    fontSize: 22,
    color: colors.textPrimary,
    fontWeight: '800',
    marginBottom: spacing.md,
  },

  modalPrizeName: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },

  modalDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
    fontWeight: '500',
  },

  counterBox: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },

  counterButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },

  counterButtonText: {
    fontSize: 24,
    color: colors.primary,
    fontWeight: '800',
  },

  counterValue: {
    minWidth: 40,
    textAlign: 'center',
    fontSize: 24,
    color: colors.textPrimary,
    fontWeight: '800',
  },

  totalPbBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },

  totalPbLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
  },

  totalPbValue: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '800',
  },

  modalButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
