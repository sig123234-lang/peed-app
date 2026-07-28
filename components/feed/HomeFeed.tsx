import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BitesTray } from '@/components/feed/BitesTray';
import { PostCard } from '@/components/feed/PostCard';
import { SponsoredPost } from '@/components/feed/SponsoredPost';
import { useFeed } from '@/context/feed';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

// 활성 광고를 한 번만 불러와 위치별로 나눠 쓴다(상단 배너 / 피드 스폰서 글).
function useAds() {
  const [ads, setAds] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/ads')
      .then((r) => r.json())
      .then((d) => setAds(d.ads || []))
      .catch(() => {});
  }, []);
  return ads;
}

// 피드 4개마다 스폰서 글 1개를 끼운다(인스타 피드 광고처럼). 광고가 여러 개면
// 돌아가며 노출한다.
function interleaveAds(posts: any[], ads: any[]): any[] {
  if (!ads.length) return posts;
  const out: any[] = [];
  let k = 0;
  posts.forEach((p, i) => {
    out.push(p);
    if ((i + 1) % 4 === 0) {
      out.push({ __ad: ads[k % ads.length], __key: `ad_${i}_${k}` });
      k += 1;
    }
  });
  return out;
}

// Admin-managed sponsored banner (from /api/ads). Renders nothing until an
// active '피드 상단' ad exists.
function AdBanner({ ad }: { ad: any | null }) {
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
  const ads = useAds();
  // 비공개 게시물은 홈(공개) 피드에서 숨긴다. 내 프로필(마이)에서만 보임.
  const publicPosts = posts.filter((p) => !p.isPrivate);

  const topBanner = ads.find((a) => a.placement === '피드 상단') || null;
  const feedAds = ads.filter((a) => a.placement === '피드');
  const data = interleaveAds(publicPosts, feedAds);

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => (item.__ad ? item.__key : item.id)}
      renderItem={({ item }) => (
        <View style={styles.itemWrap}>
          {item.__ad ? <SponsoredPost ad={item.__ad} /> : <PostCard post={item} />}
        </View>
      )}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        <View style={styles.itemWrap}>
          <AdBanner ad={topBanner} />
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
