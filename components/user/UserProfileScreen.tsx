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
import { APP_MAX_WIDTH, APP_WIDTH, colors, radius, spacing } from '@/theme';

const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type ProfileUser = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  isFollowing: boolean;
  isMe: boolean;
};

function Stat({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.stat} activeOpacity={onPress ? 0.6 : 1} onPress={onPress} disabled={!onPress}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function UserProfileScreen() {
  const { viewUserId, closeUser, openFollowList, openDmWith } = useShell();
  const { toggleFollow } = useFeed();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [override, setOverride] = useState<boolean | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!viewUserId || typeof window === 'undefined') {
      setUser(null);
      setPosts([]);
      setOverride(null);
      return;
    }
    setUser(null);
    setPosts([]);
    setOverride(null);
    fetch(`/api/public?action=userPosts&uid=${encodeURIComponent(viewUserId)}`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) setUser(d.user);
        if (Array.isArray(d?.posts)) setPosts(d.posts);
      })
      .catch(() => {});
  }, [viewUserId]);

  if (!viewUserId) return null;

  const following = override ?? user?.isFollowing ?? false;
  const onFollow = () => {
    if (!user) return;
    if (following) {
      setConfirmOpen(true); // 언팔로우는 확인 후 진행
      return;
    }
    setOverride(true);
    toggleFollow(user.id);
  };
  const confirmUnfollow = () => {
    if (!user) return;
    setOverride(false);
    toggleFollow(user.id);
    setConfirmOpen(false);
  };
  const onMessage = () => {
    if (!user) return;
    closeUser();
    openDmWith({ id: user.id, name: user.name, handle: user.handle, avatar: user.avatar });
  };

  const gridImgs = posts.filter((p) => p.image);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeUser}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.stage}>
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={closeUser} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {user?.handle || '프로필'}
            </Text>
            <View style={{ width: 26 }} />
          </View>

          {!user ? (
            <Text style={styles.status}>불러오는 중…</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.top}>
                <Image
                  source={user.avatar ? { uri: user.avatar } : initialAvatar(user.name)}
                  style={styles.avatar}
                  contentFit="cover"
                />
                <View style={styles.statsRow}>
                  <Stat value={comma(gridImgs.length)} label="게시물" />
                  <Stat
                    value={comma(user.followers)}
                    label="팔로워"
                    onPress={() => openFollowList(user.id, 'followers')}
                  />
                  <Stat
                    value={comma(user.following)}
                    label="팔로잉"
                    onPress={() => openFollowList(user.id, 'following')}
                  />
                </View>
              </View>

              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.handle}>{user.handle}</Text>
              {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

              {!user.isMe && (
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.followBtn, following && styles.followingBtn]}
                    onPress={onFollow}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={following ? 'checkmark' : 'person-add'}
                      size={15}
                      color={following ? colors.textPrimary : colors.white}
                    />
                    <Text style={[styles.followTxt, following && styles.followingTxt]}>
                      {following ? '팔로잉' : '팔로우'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.msgBtn} onPress={onMessage} activeOpacity={0.85}>
                    <Text style={styles.msgTxt}>메시지</Text>
                  </TouchableOpacity>
                </View>
              )}

              {gridImgs.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>🍽️</Text>
                  <Text style={styles.emptyText}>아직 게시물이 없어요.</Text>
                </View>
              ) : (
                <View style={styles.grid}>
                  {gridImgs.map((p) => (
                    <View key={p.id} style={styles.gridItem}>
                      <Image source={{ uri: p.image }} style={styles.gridImg} contentFit="cover" />
                      {p.isBurning && (
                        <View style={styles.burnDot}>
                          <Text style={styles.burnTxt}>🔥</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </View>

        {confirmOpen && user && (
          <View style={styles.confirmBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setConfirmOpen(false)}
            />
            <View style={styles.confirmCard}>
              <Image
                source={user.avatar ? { uri: user.avatar } : initialAvatar(user.name)}
                style={styles.confirmAvatar}
                contentFit="cover"
              />
              <Text style={styles.confirmTitle}>{user.name}님 팔로우 취소</Text>
              <Text style={styles.confirmBody}>
                팔로우를 취소하면 이 계정의 소식을 더 이상 받지 않아요.
              </Text>
              <TouchableOpacity style={styles.confirmUnfollowBtn} onPress={confirmUnfollow} activeOpacity={0.85}>
                <Text style={styles.confirmUnfollowTxt}>팔로우 취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setConfirmOpen(false)} activeOpacity={0.85}>
                <Text style={styles.confirmCancelTxt}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const GRID_W = Math.min(APP_WIDTH, APP_MAX_WIDTH);
const CELL = (GRID_W - 4) / 3;

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
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, flex: 1, textAlign: 'center' },
  status: { textAlign: 'center', paddingTop: 60, color: colors.textTertiary, fontWeight: '700' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surfaceAlt },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  statLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  name: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  handle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, paddingHorizontal: spacing.lg, marginTop: 2 },
  bio: { fontSize: 14, color: colors.textPrimary, paddingHorizontal: spacing.lg, marginTop: spacing.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  followBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followingBtn: { backgroundColor: colors.card, borderColor: colors.lineStrong },
  followTxt: { fontSize: 14, fontWeight: '800', color: colors.white },
  followingTxt: { color: colors.textPrimary },
  msgBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgTxt: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: spacing.lg },
  gridItem: { width: CELL, height: CELL },
  gridImg: { width: '100%', height: '100%', backgroundColor: colors.surfaceAlt },
  burnDot: { position: 'absolute', top: 6, right: 6 },
  burnTxt: { fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.sm },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, fontWeight: '600', color: colors.textTertiary },

  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  confirmAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surfaceAlt },
  confirmTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.md },
  confirmBody: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  confirmUnfollowBtn: {
    width: '100%',
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmUnfollowTxt: { fontSize: 15, fontWeight: '800', color: colors.white },
  confirmCancelBtn: {
    width: '100%',
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  confirmCancelTxt: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
});
