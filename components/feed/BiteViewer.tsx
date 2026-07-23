import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { contrastText, filterFor, fontFor } from '@/components/feed/biteStyles';
import { useBiteStories } from '@/components/feed/useBiteStories';
import { useShell } from '@/context/shell';
import { APP_WIDTH, colors, radius, spacing } from '@/theme';

const STORY_MS = 6000;

// Fullscreen story viewer. Tap right → next, left → previous; auto-advances
// every few seconds and closes after the last story. Plays the same ordered
// list the tray shows (my bites first, then friends' latest).
export function BiteViewer() {
  const { biteViewerId, closeBiteViewer } = useShell();
  const stories = useBiteStories();
  const [index, setIndex] = useState(0);

  // Jump to the tapped story when the viewer opens.
  useEffect(() => {
    if (biteViewerId) {
      const i = stories.findIndex((s) => s.id === biteViewerId);
      setIndex(i >= 0 ? i : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biteViewerId]);

  // Auto-advance.
  useEffect(() => {
    if (!biteViewerId || stories.length === 0) return;
    const t = setTimeout(() => {
      if (index < stories.length - 1) setIndex(index + 1);
      else closeBiteViewer();
    }, STORY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, biteViewerId, stories.length]);

  if (!biteViewerId || stories.length === 0) return null;
  const cur = stories[Math.min(index, stories.length - 1)];
  if (!cur) return null;

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));
  const goNext = () => {
    if (index < stories.length - 1) setIndex(index + 1);
    else closeBiteViewer();
  };

  const W = Math.min(APP_WIDTH, 460);

  return (
    <View style={styles.root}>
      <View style={[styles.frame, { width: W }]}>
        {/* base: photo, or a gradient for text-only stories */}
        {cur.image ? (
          <Image source={cur.image} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={
              (cur.bg && cur.bg.length >= 2 ? cur.bg : ['#6C5CE7', '#4F6BFF']) as [
                string,
                string,
              ]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* filter tint */}
        {filterFor(cur.filter).opacity > 0 && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: filterFor(cur.filter).color,
                opacity: filterFor(cur.filter).opacity,
              },
            ]}
          />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.65)']}
          locations={[0, 0.22, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* tap zones (below header/close so those stay clickable) */}
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />

        {/* decorations (text + emoji stickers) */}
        {cur.overlays?.map((o) => (
          <View
            key={o.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${o.x * 100}%`,
              top: `${o.y * 100}%`,
              maxWidth: '84%',
            }}
          >
            {o.kind === 'emoji' ? (
              <Text style={{ fontSize: o.size ?? 56 }}>{o.value}</Text>
            ) : (
              <View
                style={
                  o.highlight
                    ? {
                        backgroundColor: o.color ?? '#FFFFFF',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }
                    : undefined
                }
              >
                <Text
                  style={{
                    fontSize: o.size ?? 26,
                    fontWeight: fontFor(o.font).weight as any,
                    fontFamily: fontFor(o.font).family,
                    textAlign: o.align ?? 'center',
                    color: o.highlight ? contrastText(o.color) : o.color ?? '#FFFFFF',
                    ...(o.highlight
                      ? {}
                      : {
                          textShadowColor: 'rgba(0,0,0,0.35)',
                          textShadowOffset: { width: 0, height: 1 },
                          textShadowRadius: 5,
                        }),
                  }}
                >
                  {o.value}
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* progress segments */}
        <View style={styles.segments}>
          {stories.map((s, i) => (
            <View key={s.id} style={styles.segTrack}>
              <View
                style={[styles.segFill, { width: i <= index ? '100%' : '0%' }]}
              />
            </View>
          ))}
        </View>

        {/* header */}
        <View style={styles.header} pointerEvents="box-none">
          <Image source={cur.avatar} style={styles.avatar} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{cur.name}</Text>
            <Text style={styles.time}>{cur.timeLabel}</Text>
          </View>
          <Pressable onPress={closeBiteViewer} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
        </View>

        {/* caption */}
        {cur.caption ? (
          <View style={styles.captionWrap} pointerEvents="none">
            <Text style={styles.caption} numberOfLines={3}>
              {cur.caption}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  frame: {
    height: '100%',
    maxHeight: 900,
    backgroundColor: '#111',
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },

  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '35%',
    zIndex: 2,
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '65%',
    zIndex: 2,
  },

  segments: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    zIndex: 4,
  },
  segTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  segFill: {
    height: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    zIndex: 5,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: colors.surfaceAlt,
  },
  name: {
    color: colors.white,
    fontSize: 14.5,
    fontWeight: '800',
  },
  time: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
    zIndex: 4,
  },
  caption: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
});
