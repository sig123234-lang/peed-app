import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { initialAvatar, STAMP_BOARD, useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import { useReservations } from '@/context/reservations';
import { useShell } from '@/context/shell';
import { STORES } from '@/data/stores';
import { colors, radius, shadow, spacing } from '@/theme';

const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Desktop-only right rail — the widgets column (Twitter/Instagram desktop style).
export function RightRail() {
  const { me, toggleFollow, stamps } = useFeed();
  const { pb } = usePb();
  const { setTab, setShowReview, openStoreDetail, viewUser } = useShell();
  const { openReserve } = useReservations();

  const doneStamps = STAMP_BOARD.filter((n) => stamps.includes(n)).length;

  // 지금 뜨는 경품 = 서버의 실제 활성 경품 첫 항목(없으면 카드 숨김).
  const [hotPrize, setHotPrize] = useState<
    { name: string; pbCost?: number; image?: string } | null
  >(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/products')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const first = Array.isArray(d?.products) ? d.products[0] : null;
        if (first) setHotPrize({ name: first.name, pbCost: first.pbCost, image: first.image });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 추천 유저 — 서버 추천(친구의 친구/인기/신규).
  const [suggestions, setSuggestions] = useState<
    { id: string; name: string; handle: string; avatar: string; reason?: string }[]
  >([]);
  const [followedLocal, setFollowedLocal] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    fetch('/api/public?action=suggestedUsers', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.users)) setSuggestions(d.users);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const visibleSuggestions = suggestions.filter((u) => !followedLocal.has(u.id)).slice(0, 5);
  const followSuggestion = (id: string) => {
    setFollowedLocal((prev) => new Set(prev).add(id));
    toggleFollow(id);
  };

  const go = (tab: 'peed' | 'my') => {
    setShowReview(false);
    setTab(tab);
  };

  return (
    <View style={styles.rail}>
      {/* my activity */}
      <View style={styles.card}>
        <TouchableOpacity style={styles.meRow} onPress={() => go('my')} activeOpacity={0.8}>
          <Image source={me.avatar} style={styles.meAvatar} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={styles.meName}>{me.name}</Text>
            <Text style={styles.meHandle}>{me.handle}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.statRow}>
          <View style={[styles.statPill, styles.statPb]}>
            <Text style={styles.statPbText}>💎 {comma(pb)} PB</Text>
          </View>
          <View style={[styles.statPill, styles.statStamp]}>
            <Text style={styles.statStampText}>
              🔴 도장 {doneStamps}/{STAMP_BOARD.length}
            </Text>
          </View>
        </View>
      </View>

      {/* suggested follows */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>알 수도 있는 미식가</Text>
        {visibleSuggestions.map((u) => (
          <View key={u.id} style={styles.sugRow}>
            <TouchableOpacity
              style={styles.sugTap}
              activeOpacity={0.7}
              onPress={() => viewUser(u.id)}
            >
              <Image
                source={u.avatar ? { uri: u.avatar } : initialAvatar(u.name)}
                style={styles.sugAvatar}
                contentFit="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.sugName} numberOfLines={1}>
                  {u.name}
                </Text>
                <Text style={styles.sugHandle} numberOfLines={1}>
                  {u.reason || u.handle}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.followBtn}
              onPress={() => followSuggestion(u.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.followText}>팔로우</Text>
            </TouchableOpacity>
          </View>
        ))}
        {visibleSuggestions.length === 0 && (
          <Text style={styles.emptyText}>추천할 사람이 아직 없어요</Text>
        )}
      </View>

      {/* reservable stores — 실제 등록 매장이 있을 때만 노출 */}
      {STORES.length > 0 && (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🍽 예약 가능 매장</Text>
        {STORES.slice(0, 3).map((s) => (
          <View key={s.id} style={styles.sugRow}>
            <TouchableOpacity
              style={styles.sugTap}
              onPress={() => openStoreDetail(s)}
              activeOpacity={0.7}
            >
              <Image source={s.image} style={styles.sugAvatar} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sugName} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.sugHandle} numberOfLines={1}>
                  ★ {s.rating} · {s.category}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reserveBtn}
              onPress={() => openReserve(s)}
              activeOpacity={0.85}
            >
              <Text style={styles.reserveText}>예약</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      )}

      {/* hot prize — 실제 활성 경품이 있을 때만 노출 */}
      {hotPrize && (
        <TouchableOpacity style={styles.prizeCard} onPress={() => go('peed')} activeOpacity={0.9}>
          <Text style={styles.prizeKicker}>🔥 지금 뜨는 경품</Text>
          <View style={styles.prizeRow}>
            {!!hotPrize.image && (
              <Image
                source={{ uri: hotPrize.image }}
                style={styles.prizeImage}
                contentFit="contain"
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.prizeName}>{hotPrize.name}</Text>
              {typeof hotPrize.pbCost === 'number' && (
                <Text style={styles.prizeSub}>{hotPrize.pbCost} PB로 응모 가능</Text>
              )}
            </View>
          </View>
          <View style={styles.prizeBtn}>
            <Ionicons name="gift" size={15} color={colors.white} />
            <Text style={styles.prizeBtnText}>응모하러 가기</Text>
          </View>
        </TouchableOpacity>
      )}

      <Text style={styles.footer}>PEED · Play · Eat · Entertain · Drink</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 320,
    paddingVertical: spacing.xl,
    paddingRight: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.soft,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  /* me */
  meRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  meAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceAlt,
  },
  meName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  meHandle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  statPb: {
    backgroundColor: colors.primarySoft,
  },
  statPbText: {
    color: colors.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  statStamp: {
    backgroundColor: '#FDECEC',
  },
  statStampText: {
    color: '#E23B3B',
    fontSize: 12.5,
    fontWeight: '800',
  },

  /* suggestions */
  sugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  sugTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sugAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
  },
  sugName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  sugHandle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 1,
  },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  followText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  reserveBtn: {
    backgroundColor: colors.coral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
  },
  reserveText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  /* prize */
  prizeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.soft,
  },
  prizeKicker: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.coralDeep,
    marginBottom: spacing.md,
  },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  prizeImage: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  prizeName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  prizeSub: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  prizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
  },
  prizeBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },

  footer: {
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
  },
});
