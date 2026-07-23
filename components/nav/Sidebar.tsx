import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useDm } from '@/context/dm';
import { useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import { ShellTab, useShell } from '@/context/shell';
import { colors, radius, spacing } from '@/theme';

const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type Item = {
  tab: ShellTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
};

const ITEMS: Item[] = [
  { tab: 'home', label: '홈', icon: 'home-outline', iconActive: 'home' },
  { tab: 'burning', label: '버닝맵', icon: 'flame-outline', iconActive: 'flame' },
  { tab: 'dm', label: '메시지', icon: 'chatbubble-outline', iconActive: 'chatbubble' },
  { tab: 'peed', label: '경품', icon: 'gift-outline', iconActive: 'gift' },
  { tab: 'game', label: '게임', icon: 'game-controller-outline', iconActive: 'game-controller' },
  { tab: 'my', label: '마이', icon: 'person-outline', iconActive: 'person' },
];

// Desktop-web left rail. Instagram-style vertical nav that drives the shared
// shell state (same tabs the mobile bottom bar uses).
export function Sidebar() {
  const { tab, setTab, showReview, setShowReview } = useShell();
  const { me } = useFeed();
  const { pb } = usePb();
  const { totalUnread } = useDm();

  return (
    <View style={styles.sidebar}>
      <Text style={styles.logo}>PEED</Text>

      <View style={styles.nav}>
        {ITEMS.map((item) => {
          const active = !showReview && tab === item.tab;
          return (
            <TouchableOpacity
              key={item.tab}
              style={[styles.item, active && styles.itemActive]}
              activeOpacity={0.7}
              onPress={() => {
                setShowReview(false);
                setTab(item.tab);
              }}
            >
              <Ionicons
                name={active ? item.iconActive : item.icon}
                size={24}
                color={active ? colors.textPrimary : colors.textSecondary}
              />
              <Text style={[styles.label, active && styles.labelActive]}>
                {item.label}
              </Text>
              {item.tab === 'dm' && totalUnread > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.item, !showReview && tab === 'settings' && styles.itemActive]}
          activeOpacity={0.7}
          onPress={() => {
            setShowReview(false);
            setTab('settings');
          }}
        >
          <Ionicons
            name={!showReview && tab === 'settings' ? 'settings' : 'settings-outline'}
            size={24}
            color={
              !showReview && tab === 'settings'
                ? colors.textPrimary
                : colors.textSecondary
            }
          />
          <Text style={[styles.label, !showReview && tab === 'settings' && styles.labelActive]}>
            설정
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.postBtn}
        activeOpacity={0.9}
        onPress={() => setShowReview(true)}
      >
        <Ionicons name="add" size={20} color={colors.white} />
        <Text style={styles.postText}>리뷰 남기기</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.profile}
        activeOpacity={0.8}
        onPress={() => {
          setShowReview(false);
          setTab('my');
        }}
      >
        <Image source={me.avatar} style={styles.profileAvatar} contentFit="cover" />
        <View style={styles.profileText}>
          <Text style={styles.profileName} numberOfLines={1}>
            {me.name}
          </Text>
          <Text style={styles.profilePb}>💎 {comma(pb)} PB</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 236,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    backgroundColor: colors.bg,
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    marginBottom: spacing['2xl'],
  },
  logoDot: {
    color: colors.coral,
  },
  nav: {
    gap: 4,
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  itemActive: {
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  navBadge: {
    marginLeft: 'auto',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  navBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.coral,
    marginTop: spacing.lg,
  },
  postText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profilePb: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 1,
  },
});

