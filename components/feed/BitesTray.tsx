import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useBiteStories } from '@/components/feed/useBiteStories';
import { useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { colors, gradients, radius, spacing } from '@/theme';

// Bites — a bite-size peek at where people just went. Reels-style tall-tile
// tray that bleeds to the screen edges. First tile is "My Bite" (＋ → upload a
// photo story); the rest are live stories (my bites, then friends' latest) —
// tap any to play them fullscreen in the viewer.
export function BitesTray() {
  const { me, profileAvatar } = useFeed();
  const { openBiteComposer, openBiteViewer } = useShell();
  const stories = useBiteStories();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        Bites <Text style={styles.labelEmoji}>🍽</Text>
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tray}
        contentContainerStyle={styles.trayContent}
      >
        {/* my bite → open the story composer */}
        <TouchableOpacity
          style={styles.tile}
          activeOpacity={0.85}
          onPress={openBiteComposer}
        >
          <Image
            source={profileAvatar ? { uri: profileAvatar } : me.avatar}
            style={styles.cover}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.scrim}
          />
          <View style={styles.plusWrap}>
            <View style={styles.plusCircle}>
              <Text style={styles.plus}>＋</Text>
            </View>
          </View>
          <View style={styles.tileBottom}>
            <Text style={styles.name}>My Bite</Text>
          </View>
        </TouchableOpacity>

        {stories.map((story) => (
          <TouchableOpacity
            key={story.id}
            style={styles.tile}
            activeOpacity={0.9}
            onPress={() => openBiteViewer(story.id)}
          >
            <Image source={story.image} style={styles.cover} contentFit="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.scrim}
            />
            <LinearGradient
              colors={story.isMine ? gradients.lime : gradients.brandDiagonal}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ring}
            >
              <View style={styles.ringInner}>
                <Image
                  source={story.avatar}
                  style={styles.avatar}
                  contentFit="cover"
                />
              </View>
            </LinearGradient>
            <View style={styles.tileBottom}>
              <Text style={styles.name} numberOfLines={1}>
                {story.isMine ? '내 스토리' : story.name}
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
  label: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.3,
    marginBottom: spacing.sm,
  },
  labelEmoji: {
    fontSize: 14,
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
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
});
