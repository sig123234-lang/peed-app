import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useBiteStoryGroups } from '@/components/feed/useBiteStories';
import { useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { colors, gradients, radius, spacing } from '@/theme';

// Bites — a bite-size peek at where people just went. Reels-style tall-tile
// tray that bleeds to the screen edges.
//
// 칸은 사람당 하나다. 맨 앞은 항상 내 칸 — 올린 게 없으면 프로필 사진에 ＋만
// 크게 얹은 업로드 버튼이고, 올린 게 있으면 그 칸이 곧 내 스토리가 된다(누르면
// 재생, 우하단 작은 ＋ 로 새로 올리기). 그래서 '내 스토리' 칸이 따로 생기지
// 않는다. 나머지는 사람별로 한 칸씩, 최근에 올린 사람부터.
export function BitesTray() {
  const { me, profileAvatar } = useFeed();
  const { openBiteComposer, openBiteViewer } = useShell();
  const groups = useBiteStoryGroups();

  const mine = groups.find((g) => g.isMine);
  const others = groups.filter((g) => !g.isMine);
  const myAvatar = profileAvatar ? { uri: profileAvatar } : me.avatar;

  return (
    <View style={styles.wrap}>
      {/* 예전엔 위에 'Bites 🍽' 제목을 달았는데, 칸 자체가 무엇인지 이미
          말해주고 있어서 글자와 이모지를 걷어냈다. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tray}
        contentContainerStyle={styles.trayContent}
      >
        {/* 내 칸 — 올린 게 있으면 스토리 재생, 없으면 바로 컴포저 */}
        <TouchableOpacity
          style={styles.tile}
          activeOpacity={0.85}
          onPress={() => (mine ? openBiteViewer(mine.userId) : openBiteComposer())}
        >
          <Image
            source={mine?.cover ?? myAvatar}
            style={styles.cover}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.scrim}
          />

          {mine ? (
            <>
              {/* 올린 게 있으면 다른 칸과 같은 링 + 개수, 추가는 작은 ＋ 로 */}
              <LinearGradient
                colors={gradients.lime}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ring}
              >
                <View style={styles.ringInner}>
                  <Image source={myAvatar} style={styles.avatar} contentFit="cover" />
                </View>
              </LinearGradient>
              {mine.items.length > 1 && (
                <View style={styles.countPill}>
                  <Text style={styles.countText}>{mine.items.length}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.addBtn}
                activeOpacity={0.85}
                onPress={() => openBiteComposer()}
                hitSlop={8}
              >
                <Text style={styles.addPlus}>＋</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.plusWrap}>
              <View style={styles.plusCircle}>
                <Text style={styles.plus}>＋</Text>
              </View>
            </View>
          )}

          {/* ＋ 버튼이 있는 동안은 이름표가 그 밑으로 파고들지 않게 좁힌다 */}
          <View style={[styles.tileBottom, mine && styles.tileBottomWithAdd]}>
            <Text style={styles.name} numberOfLines={1}>
              My Bite
            </Text>
          </View>
        </TouchableOpacity>

        {others.map((group) => (
          <TouchableOpacity
            key={group.userId}
            style={styles.tile}
            activeOpacity={0.9}
            onPress={() => openBiteViewer(group.userId)}
          >
            {group.cover ? (
              <Image source={group.cover} style={styles.cover} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={
                  (group.coverBg && group.coverBg.length >= 2
                    ? group.coverBg
                    : ['#6C5CE7', '#4F6BFF']) as [string, string]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cover}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.scrim}
            />
            <LinearGradient
              colors={gradients.brandDiagonal}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.ringInner}>
                <Image
                  source={group.avatar}
                  style={styles.avatar}
                  contentFit="cover"
                />
              </View>
            </LinearGradient>
            {group.items.length > 1 && (
              <View style={styles.countPill}>
                <Text style={styles.countText}>{group.items.length}</Text>
              </View>
            )}
            <View style={styles.tileBottom}>
              <Text style={styles.name} numberOfLines={1}>
                {group.name}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
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
  tray: {
    marginHorizontal: -spacing.lg, // bleed to screen edges
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
  cover: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },

  ring: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },

  // 묶음 개수 — 링 반대편 위쪽에 앉혀 아바타와 겹치지 않게.
  countPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },

  // 내 칸에 스토리가 이미 있을 때의 '새로 올리기' — 이름표를 가리지 않게
  // 우하단 모서리에 작게.
  addBtn: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  addPlus: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.white,
    marginTop: -2,
  },

  plusWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 26,
  },
  plusCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  plus: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    marginTop: -2,
  },

  tileBottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  tileBottomWithAdd: {
    right: 40,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
});
