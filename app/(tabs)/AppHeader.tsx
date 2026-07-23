import { Ionicons } from '@expo/vector-icons';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePb } from '@/context/pb';
import { useShell } from '@/context/shell';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { APP_WIDTH, colors, radius, spacing } from '@/theme';

const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type AppHeaderProps = {
  pbAmount?: string;
  onPressLogo?: () => void;
  onPressBell?: () => void;
  onPressDm?: () => void;
  unreadCount?: number;
  dmUnread?: number;
};

function Bell({
  onPress,
  unreadCount,
}: {
  onPress?: () => void;
  unreadCount: number;
}) {
  return (
    <TouchableOpacity style={styles.bellButton} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
      {unreadCount > 0 && (
        <View style={styles.redDot}>
          <Text style={styles.dotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function AppHeader({
  onPressLogo,
  onPressBell,
  onPressDm,
  unreadCount = 0,
  dmUnread = 0,
}: AppHeaderProps) {
  const { pb } = usePb();
  const { openSearch } = useShell();
  const isDesktop = useIsDesktop();

  // Desktop: a proper top bar with search — the wordmark lives in the
  // sidebar, so it's omitted here.
  if (isDesktop) {
    return (
      <View style={styles.webHeader}>
        <TouchableOpacity style={styles.searchBox} onPress={openSearch} activeOpacity={0.8}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <Text style={styles.searchPlaceholder}>사람 · 매장 검색</Text>
        </TouchableOpacity>

        <View style={styles.rightRow}>
          <View style={styles.pbChip}>
            <Text style={styles.pbChipText}>💎 {comma(pb)} PB</Text>
          </View>
          <Bell onPress={onPressBell} unreadCount={unreadCount} />
        </View>
      </View>
    );
  }

  // Mobile: wordmark + search + PB + DM + bell.
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onPressLogo}>
        <Text style={styles.logo}>PEED</Text>
      </TouchableOpacity>

      <View style={styles.rightRow}>
        <TouchableOpacity style={styles.bellButton} onPress={openSearch} activeOpacity={0.8}>
          <Ionicons name="search" size={19} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.pbChip}>
          <Text style={styles.pbChipText}>💎 {comma(pb)} PB</Text>
        </View>
        <TouchableOpacity style={styles.bellButton} onPress={onPressDm} activeOpacity={0.8}>
          <Ionicons name="chatbubble-outline" size={19} color={colors.textPrimary} />
          {dmUnread > 0 && (
            <View style={styles.redDot}>
              <Text style={styles.dotText}>{dmUnread > 9 ? '9+' : dmUnread}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Bell onPress={onPressBell} unreadCount={unreadCount} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* mobile */
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  logoDot: {
    color: colors.coral,
  },

  /* web */
  webHeader: {
    // Match the feed's width and center it so the header lines up with the
    // content and doesn't crowd the right-side widget rail.
    width: APP_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
  },

  /* shared right side */
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pbChip: {
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  pbChipText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  redDot: {
    position: 'absolute',
    top: 5,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  dotText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
});
