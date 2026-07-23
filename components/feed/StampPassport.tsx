import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { STAMP_BOARD, STAMP_DISTRICT, useFeed } from '@/context/feed';
import { colors, radius, spacing } from '@/theme';

// 미식 도장깨기 — Reels-style horizontal tray of tall neighborhood tiles that
// bleeds to the screen edges (not a boxed section card). Visited = cover photo
// with a red 도장(seal); unvisited = "＋ 도장 찍기" that opens the review flow.
const DISTRICT = STAMP_DISTRICT;
const BOARD = STAMP_BOARD;

const SEAL_RED = '#E23B3B';

const COVERS = [
  require('../../assets/images/review1.jpg'),
  require('../../assets/images/review2.jpg'),
  require('../../assets/images/review3.jpg'),
  require('../../assets/images/review4.jpg'),
];

export function StampPassport({ onOpenReview }: { onOpenReview: () => void }) {
  const { stamps } = useFeed();
  const count = BOARD.filter((n) => stamps.includes(n)).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🗺️ {DISTRICT} 도장깨기</Text>
        <Text style={styles.count}>
          {count}/{BOARD.length} 도장
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tray}
        contentContainerStyle={styles.trayContent}
      >
        {BOARD.map((n, i) => {
          const done = stamps.includes(n);
          return (
            <TouchableOpacity
              key={n}
              activeOpacity={done ? 1 : 0.85}
              disabled={done}
              onPress={onOpenReview}
              style={[styles.tile, !done && styles.tileTodo]}
            >
              {done ? (
                <Image
                  source={COVERS[i % COVERS.length]}
                  style={styles.cover}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.coverTodo} />
              )}

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.72)']}
                style={styles.scrim}
              />

              {done ? (
                <View style={styles.seal}>
                  <Text style={styles.sealMark}>認</Text>
                </View>
              ) : (
                <View style={styles.plusWrap}>
                  <View style={styles.plusCircle}>
                    <Text style={styles.plus}>＋</Text>
                  </View>
                  <Text style={styles.plusHint}>도장 찍기</Text>
                </View>
              )}

              <View style={styles.tileBottom}>
                <Text style={[styles.tileName, !done && styles.tileNameTodo]}>
                  {n}
                </Text>
                <Text style={[styles.tileState, !done && styles.tileStateTodo]}>
                  {done ? '방문완료' : '미방문'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const TILE_W = 116;
const TILE_H = 168;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  count: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.coralDeep,
  },

  // bleed the tray to the screen edges (offsets the feed's horizontal padding)
  tray: {
    marginHorizontal: -spacing.lg,
  },
  trayContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },

  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.ink,
  },
  tileTodo: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
  },
  coverTodo: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfaceAlt,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },

  seal: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: SEAL_RED,
    backgroundColor: 'rgba(253,236,236,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
  },
  sealMark: {
    color: SEAL_RED,
    fontSize: 15,
    fontWeight: '800',
  },

  plusWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 34,
    gap: 6,
  },
  plusCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.coral,
    marginTop: -2,
  },
  plusHint: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },

  tileBottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  tileName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  tileNameTodo: {
    color: colors.textPrimary,
  },
  tileState: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  tileStateTodo: {
    color: colors.textTertiary,
  },
});
