import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initialAvatar, useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { APP_MAX_WIDTH, colors, radius, spacing } from '@/theme';

type Row = { id: string; name: string; handle: string; avatar: string; isFollowing: boolean; isMe: boolean };

export function FollowListScreen() {
  const { followList, closeFollowList, viewUser } = useShell();
  const { toggleFollow } = useFeed();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!followList || typeof window === 'undefined') {
      setRows(null);
      setOverride({});
      return;
    }
    setRows(null);
    setOverride({});
    fetch(`/api/public?action=${followList.mode}&uid=${encodeURIComponent(followList.uid)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d?.users) ? d.users : []))
      .catch(() => setRows([]));
  }, [followList]);

  if (!followList) return null;

  const title = followList.mode === 'followers' ? '팔로워' : '팔로잉';
  const isFollowing = (u: Row) => (u.id in override ? override[u.id] : u.isFollowing);
  const onFollow = (u: Row) => {
    setOverride((p) => ({ ...p, [u.id]: !isFollowing(u) }));
    toggleFollow(u.id);
  };
  const openProfile = (id: string) => {
    closeFollowList();
    viewUser(id);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeFollowList}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.stage}>
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={closeFollowList} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{title}</Text>
            <View style={{ width: 26 }} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {rows === null ? (
              <Text style={styles.status}>불러오는 중…</Text>
            ) : rows.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>{followList.mode === 'followers' ? '👋' : '🔎'}</Text>
                <Text style={styles.emptyText}>
                  {followList.mode === 'followers'
                    ? '아직 팔로워가 없어요.'
                    : '아직 팔로우한 사람이 없어요.'}
                </Text>
              </View>
            ) : (
              rows.map((u) => {
                const following = isFollowing(u);
                return (
                  <View key={u.id} style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowTap}
                      activeOpacity={0.7}
                      onPress={() => openProfile(u.id)}
                    >
                      <Image
                        source={u.avatar ? { uri: u.avatar } : initialAvatar(u.name)}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {u.name}
                        </Text>
                        <Text style={styles.handle} numberOfLines={1}>
                          {u.handle}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {!u.isMe && (
                      <TouchableOpacity
                        style={[styles.followBtn, following && styles.followingBtn]}
                        onPress={() => onFollow(u)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.followTxt, following && styles.followingTxt]}>
                          {following ? '팔로잉' : '팔로우'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stage: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  status: { textAlign: 'center', paddingTop: 60, color: colors.textTertiary, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, fontWeight: '600', color: colors.textTertiary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt },
  name: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  handle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  followBtn: {
    paddingHorizontal: spacing.lg,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  followingBtn: { backgroundColor: colors.surfaceAlt },
  followTxt: { fontSize: 13, fontWeight: '800', color: colors.white },
  followingTxt: { color: colors.textSecondary },
});
