import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BitesTray } from '@/components/feed/BitesTray';
import { PostCard } from '@/components/feed/PostCard';
import { useFeed } from '@/context/feed';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

// Admin-managed sponsored banner (from /api/ads). Renders nothing until an
// active ad exists.
function AdBanner() {
  const [ad, setAd] = useState<any | null>(null);
  useEffect(() => {
    fetch('/api/ads')
      .then((r) => r.json())
      .then((d) => {
        const ads = d.ads || [];
        setAd(ads.find((a: any) => a.placement === '피드 상단') || ads[0] || null);
      })
      .catch(() => {});
  }, []);
  if (!ad) return null;
  return (
    <TouchableOpacity
      style={styles.adBanner}
      activeOpacity={0.92}
      onPress={() => {
        if (ad.link && typeof window !== 'undefined') window.open(ad.link, '_blank');
      }}
    >
      {ad.image ? (
        <Image source={{ uri: ad.image }} style={styles.adImg} contentFit="cover" />
      ) : (
        <View style={[styles.adImg, { backgroundColor: colors.surfaceAlt }]} />
      )}
      <View style={styles.adText}>
        <Text style={styles.adKicker}>AD · 광고</Text>
        <Text style={styles.adTitle} numberOfLines={1}>{ad.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// The FlatList fills the full width of the center region; its content is capped
// and centered. So the "empty" space on either side of the feed is still inside
// the scroll surface — dragging there scrolls the feed too.
export function HomeFeed() {
  const { posts } = useFeed();
  // 비공개 게시물은 홈(공개) 피드에서 숨긴다. 내 프로필(마이)에서만 보임.
  const publicPosts = posts.filter((p) => !p.isPrivate);

  return (
    <FlatList
      data={publicPosts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.itemWrap}>
          <PostCard post={item} />
        </View>
      )}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.itemWrap}>
          <AdBanner />
          <BitesTray />
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🍽️</Text>
          <Text style={styles.emptyTitle}>아직 게시물이 없어요</Text>
          <Text style={styles.emptyBody}>
            버닝 매장을 방문하고 첫 리뷰를 남겨보세요.{'\n'}맛집 기록이 여기에 쌓여요.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: 24,
    alignItems: 'center',
  },
  // Fixed width so every card is identical; centered inside the full-width
  // scroll surface. 좌우 거터를 줘서 카드가 화면 가장자리에 붙지 않게(숨 쉴 공간).
  itemWrap: {
    width: APP_WIDTH,
    paddingHorizontal: spacing.md,
  },
  adBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  adImg: { width: 64, height: 64, borderRadius: radius.md },
  adText: { flex: 1 },
  adKicker: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.5 },
  adTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  empty: {
    width: APP_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  emptyEmoji: { fontSize: 46, marginBottom: spacing.xs },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
