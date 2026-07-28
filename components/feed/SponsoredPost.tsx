import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { WebVideo } from '@/components/feed/WebVideo';
import { colors, radius, shadow, spacing } from '@/theme';

// 스폰서 게시글 — 인스타 피드 광고처럼 일반 게시물 사이에 끼어 노출된다.
// 어드민 '광고 관리'에서 노출 위치를 '피드'로 등록한 광고가 여기로 들어온다.
// 영상(video)이 있으면 영상을, 없으면 이미지를 보여준다.
export function SponsoredPost({ ad }: { ad: any }) {
  const open = () => {
    if (ad?.link && typeof window !== 'undefined') window.open(ad.link, '_blank');
  };
  const cta = String(ad?.ctaText || '자세히 보기').trim();

  return (
    <View style={styles.card}>
      {/* 헤더 — 광고주 이름 + 스폰서 표시 */}
      <View style={styles.head}>
        {ad?.image ? (
          <Image source={{ uri: ad.image }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{ad?.title || '광고'}</Text>
          <Text style={styles.sponsored}>Sponsored · 광고</Text>
        </View>
      </View>

      {/* 미디어 — 영상 우선, 없으면 이미지 */}
      <TouchableOpacity activeOpacity={0.95} onPress={open} style={styles.media}>
        {ad?.video ? (
          <WebVideo uri={ad.video} poster={ad.image} />
        ) : ad?.image ? (
          <Image source={{ uri: ad.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceAlt }]} />
        )}
      </TouchableOpacity>

      {/* 문구 */}
      {ad?.body ? (
        <Text style={styles.body} numberOfLines={3}>{ad.body}</Text>
      ) : null}

      {/* CTA — 등록된 링크를 새 창으로 */}
      {ad?.link ? (
        <TouchableOpacity style={styles.cta} activeOpacity={0.9} onPress={open}>
          <Text style={styles.ctaText}>{cta}</Text>
          <Ionicons name="open-outline" size={16} color={colors.white} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.soft,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt },
  name: { fontSize: 14.5, fontWeight: '800', color: colors.textPrimary },
  sponsored: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textTertiary,
    marginTop: 1,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  ctaText: { color: colors.white, fontSize: 14.5, fontWeight: '800' },
});
