import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BurningMap } from '@/components/burning/BurningMap';
import { AppButton } from '@/components/ui/kit';
import { useFeed } from '@/context/feed';
import { ReservableStore } from '@/data/stores';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

// 메뉴는 대표 몇 개만 먼저 보여준다.
const MENU_PREVIEW = 5;

function Stars({ rating }: { rating: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= Math.round(rating) ? 'star' : 'star-outline'}
          size={13}
          color={colors.coral}
        />
      ))}
    </View>
  );
}

// 카카오맵/길찾기(내비)/택시/전화 바로가기.
// map.kakao.com/link 는 모바일에서 카카오맵 앱으로, PC에선 웹 지도로 열린다.
// (카카오내비 길안내는 카카오맵 길찾기에서 이어짐. 카카오 T 도착지 프리필은
//  공개 API가 없어 앱/웹만 연다.)
function KakaoActions({ store }: { store: ReservableStore }) {
  const name = encodeURIComponent(store.name);
  const openMap = () =>
    Linking.openURL(`https://map.kakao.com/link/map/${name},${store.lat},${store.lng}`);
  const openRoute = () =>
    Linking.openURL(`https://map.kakao.com/link/to/${name},${store.lat},${store.lng}`);
  const openTaxi = () => {
    if (Platform.OS === 'web') {
      Linking.openURL('https://kakaot.com');
      return;
    }
    Linking.openURL('kakaot://launch').catch(() => Linking.openURL('https://kakaot.com'));
  };

  const btns: { icon: any; label: string; onPress: () => void }[] = [
    { icon: 'map', label: '카카오맵', onPress: openMap },
    { icon: 'navigate', label: '길찾기', onPress: openRoute },
    { icon: 'car-sport', label: '카카오 T', onPress: openTaxi },
  ];
  if (store.phone) {
    btns.push({ icon: 'call', label: '전화', onPress: () => Linking.openURL(`tel:${store.phone}`) });
  }

  return (
    <View style={styles.kakaoRow}>
      {btns.map((b) => (
        <TouchableOpacity key={b.label} style={styles.kakaoBtn} onPress={b.onPress} activeOpacity={0.8}>
          <View style={styles.kakaoIcon}>
            <Ionicons name={b.icon} size={18} color={colors.primary} />
          </View>
          <Text style={styles.kakaoLabel}>{b.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function StoreDetailScreen({
  store,
  onClose,
  onReserve,
  onReview,
}: {
  store: ReservableStore;
  onClose: () => void;
  onReserve: () => void;
  onReview: () => void;
}) {
  const { posts } = useFeed();
  // 메뉴가 수십 개인 매장이면 화면이 메뉴로만 채워져 아래 예약·리뷰까지
  // 내려가기 힘들다. 대표 5개만 펼쳐두고 나머지는 접는다.
  const [menusOpen, setMenusOpen] = useState(false);
  // 이 매장의 전체 리뷰를 서버에서 조회(현재 피드 샘플이 아니라 매장별 전량).
  const [serverReviews, setServerReviews] = useState<any[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    fetch(`/api/public?action=storePosts&store=${encodeURIComponent(store.name)}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.posts)) setServerReviews(d.posts);
      })
      .catch(() => {});
  }, [store.name]);
  // 서버 결과 우선, 없으면(로딩 전) 현재 피드에서 필터한 것으로 폴백.
  const reviews = serverReviews.length
    ? serverReviews.map((sp: any) => ({
        id: sp.id,
        image: sp.image ? { uri: sp.image } : undefined,
        rating: sp.rating,
        caption: sp.caption,
        timeLabel: sp.timeLabel || '',
        author: {
          id: sp.author?.id || '',
          name: sp.author?.name || 'PEED 유저',
          handle: sp.author?.handle || '@peed',
          avatar: sp.author?.avatar ? { uri: sp.author.avatar } : undefined,
        },
      }))
    : posts.filter((p) => p.store === store.name);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {store.name}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.centerWrap}>
          {/* hero */}
          <View style={styles.hero}>
            <Image source={store.image} style={styles.heroImg} contentFit="cover" />
            <View style={styles.burnBadge}>
              <Text style={styles.burnBadgeText}>🔥 버닝 · +{store.reward} PB</Text>
            </View>
          </View>

          {/* title */}
          <Text style={styles.name}>{store.name}</Text>
          <View style={styles.metaRow}>
            <Stars rating={store.rating} />
            <Text style={styles.metaText}>
              {store.rating} · {store.category}
            </Text>
          </View>
          <Text style={styles.sub}>
            📍 {store.location} · {store.priceRange}
          </Text>

          {/* actions */}
          <View style={styles.actions}>
            <AppButton
              label="예약하기"
              variant="coral"
              onPress={onReserve}
              style={{ flex: 1.4 }}
            />
            <AppButton
              label="리뷰 쓰기"
              variant="outline"
              onPress={onReview}
              style={{ flex: 1 }}
            />
          </View>

          {/* 사진 갤러리 */}
          {store.photos && store.photos.length > 1 ? (
            <>
              <Text style={styles.sectionTitle}>사진</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm }}
              >
                {store.photos.map((ph, i) => (
                  <Image key={i} source={{ uri: ph }} style={styles.galleryImg} contentFit="cover" />
                ))}
              </ScrollView>
            </>
          ) : null}

          {/* info */}
          <View style={styles.card}>
            <InfoRow icon="time-outline" label="영업시간" value="매일 11:00 – 23:00" />
            <InfoRow icon="cash-outline" label="가격대" value={store.priceRange} />
            {store.phone ? <InfoRow icon="call-outline" label="전화" value={store.phone} /> : null}
            <InfoRow icon="location-outline" label="위치" value={store.location} last />
          </View>

          {/* 메뉴 — 대표 5개만 보이고 나머지는 '더보기' 로 편다 */}
          {store.menus && store.menus.length > 0
            ? (() => {
                const all = store.menus;
                const shown = menusOpen ? all : all.slice(0, MENU_PREVIEW);
                const rest = all.length - shown.length;
                return (
                  <>
                    <Text style={styles.sectionTitle}>메뉴</Text>
                    <View style={styles.card}>
                      {shown.map((m, i) => (
                        <View
                          key={i}
                          style={[
                            styles.menuRow,
                            (i < shown.length - 1 || rest > 0) && styles.infoRowBorder,
                          ]}
                        >
                          <Text style={styles.menuName} numberOfLines={1}>{m.name}</Text>
                          <Text style={styles.menuPrice}>
                            {Number(m.price).toLocaleString('ko-KR')}원
                          </Text>
                        </View>
                      ))}

                      {rest > 0 || menusOpen ? (
                        <TouchableOpacity
                          style={styles.menuMore}
                          onPress={() => setMenusOpen((v) => !v)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.menuMoreText}>
                            {menusOpen ? '접기' : `메뉴 ${rest}개 더보기`}
                          </Text>
                          <Ionicons
                            name={menusOpen ? 'chevron-up' : 'chevron-down'}
                            size={15}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </>
                );
              })()
            : null}

          <Text style={styles.sectionTitle}>예약 가능 시간</Text>
          <View style={styles.timeWrap}>
            {store.times.map((t) => (
              <View key={t} style={styles.timeChip}>
                <Text style={styles.timeText}>{t}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>위치</Text>
          <BurningMap
            markers={[
              { id: store.id, name: store.name, lat: store.lat, lng: store.lng },
            ]}
          />
          <KakaoActions store={store} />

          {/* reviews */}
          <Text style={styles.sectionTitle}>
            리뷰 {reviews.length > 0 ? `${reviews.length}` : ''}
          </Text>
          {reviews.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                아직 리뷰가 없어요{'\n'}첫 리뷰를 남기고 +{store.reward} PB 받아보세요
              </Text>
            </View>
          ) : (
            reviews.map((p) => (
              <View key={p.id} style={styles.reviewCard}>
                <View style={styles.reviewHead}>
                  <Image source={p.author.avatar} style={styles.reviewAvatar} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reviewName}>{p.author.name}</Text>
                    <Stars rating={p.rating} />
                  </View>
                  <Text style={styles.reviewTime}>{p.timeLabel}</Text>
                </View>
                <Text style={styles.reviewCaption}>{p.caption}</Text>
                <Image source={p.image} style={styles.reviewImg} contentFit="cover" />
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  scrollContent: { alignItems: 'center' },
  centerWrap: {
    width: APP_WIDTH,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },

  hero: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.soft,
  },
  heroImg: {
    width: '100%',
    aspectRatio: 16 / 10,
    backgroundColor: colors.surfaceAlt,
  },
  burnBadge: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.coral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  burnBadgeText: { color: colors.white, fontSize: 12, fontWeight: '800' },

  name: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 6,
  },
  stars: { flexDirection: 'row', gap: 1 },
  metaText: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 4,
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginTop: spacing.xl,
    ...shadow.soft,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  infoLabel: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  galleryImg: {
    width: 160,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  kakaoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  kakaoBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  kakaoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  menuPrice: { fontSize: 14, fontWeight: '800', color: colors.primary },
  menuMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.md,
  },
  menuMoreText: { fontSize: 13.5, fontWeight: '800', color: colors.primary },
  timeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    ...shadow.soft,
  },
  timeText: { fontSize: 14, fontWeight: '800', color: colors.primary },

  empty: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
    ...shadow.soft,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },

  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
  },
  reviewName: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  reviewTime: { fontSize: 11.5, fontWeight: '600', color: colors.textTertiary },
  reviewCaption: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  reviewImg: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
});
