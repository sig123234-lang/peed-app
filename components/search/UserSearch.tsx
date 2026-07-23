import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initialAvatar, useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { APP_MAX_WIDTH, colors, radius, spacing } from '@/theme';

type UserRow = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  bio: string;
  isFollowing: boolean;
  followers: number;
  reason?: string;
};
type StoreRow = {
  id: string;
  name: string;
  category: string;
  location: string;
  region?: string;
  lat?: number;
  lng?: number;
  image: string;
  photos?: string[];
  menus?: any[];
  phone?: string;
};

const comma = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function UserSearch() {
  const { searchOpen, closeSearch, viewUser, openStoreDetail } = useShell();
  const { toggleFollow } = useFeed();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [suggested, setSuggested] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [override, setOverride] = useState<Record<string, boolean>>({});

  // 열릴 때 추천 유저 로드.
  useEffect(() => {
    if (!searchOpen || typeof window === 'undefined') return;
    fetch('/api/public?action=suggestedUsers', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.users)) setSuggested(d.users);
      })
      .catch(() => {});
  }, [searchOpen]);

  // 검색어 디바운스 → 통합 검색(사람+매장).
  useEffect(() => {
    if (!searchOpen) return;
    const query = q.trim();
    if (!query) {
      setUsers([]);
      setStores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/public?action=searchUsers&q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      })
        .then((r) => r.json())
        .then((d) => {
          setUsers(Array.isArray(d?.users) ? d.users : []);
          setStores(Array.isArray(d?.stores) ? d.stores : []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      setQ('');
      setUsers([]);
      setStores([]);
      setOverride({});
    }
  }, [searchOpen]);

  if (!searchOpen) return null;

  const isFollowing = (u: UserRow) => (u.id in override ? override[u.id] : u.isFollowing);
  const onFollow = (u: UserRow) => {
    setOverride((p) => ({ ...p, [u.id]: !isFollowing(u) }));
    toggleFollow(u.id);
  };
  const openProfile = (id: string) => {
    closeSearch();
    viewUser(id);
  };
  const openStore = (s: StoreRow) => {
    closeSearch();
    openStoreDetail({
      id: s.id,
      name: s.name,
      category: s.category,
      location: s.location,
      lat: s.lat || 0,
      lng: s.lng || 0,
      reward: 10,
      rating: 0,
      priceRange: '-',
      image: { uri: s.image || '' },
      reservable: true,
      times: [],
      photos: s.photos,
      menus: s.menus as any,
      phone: s.phone,
    });
  };

  const renderUser = (u: UserRow) => {
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
            <Text style={styles.sub} numberOfLines={1}>
              {u.reason ? u.reason : `${u.handle} · 팔로워 ${comma(u.followers || 0)}`}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.followBtn, following && styles.followingBtn]}
          onPress={() => onFollow(u)}
          activeOpacity={0.85}
        >
          <Text style={[styles.followTxt, following && styles.followingTxt]}>
            {following ? '팔로잉' : '팔로우'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderStore = (s: StoreRow) => (
    <TouchableOpacity key={s.id} style={styles.row} activeOpacity={0.7} onPress={() => openStore(s)}>
      <View style={styles.rowTap}>
        <Image
          source={s.image ? { uri: s.image } : initialAvatar(s.name)}
          style={styles.storeThumb}
          contentFit="cover"
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            🔥 {s.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {s.category} · {s.location}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  const query = q.trim();
  const hasResults = users.length > 0 || stores.length > 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeSearch}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.stage}>
          <View style={styles.searchRow}>
            <TouchableOpacity onPress={closeSearch} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={colors.textTertiary} />
              <TextInput
                autoFocus
                value={q}
                onChangeText={setQ}
                placeholder="사람 · 매장 검색"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {q.length > 0 && (
                <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {query.length === 0 ? (
              // 검색 전 — 친구 추천.
              suggested.length === 0 ? (
                <View style={styles.hintBox}>
                  <Text style={styles.hintEmoji}>🔍</Text>
                  <Text style={styles.hintText}>사람이나 매장을 검색해보세요.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.section}>회원님을 위한 추천</Text>
                  {suggested.map(renderUser)}
                </>
              )
            ) : loading ? (
              <Text style={styles.status}>검색 중…</Text>
            ) : !hasResults ? (
              <View style={styles.hintBox}>
                <Text style={styles.hintEmoji}>🫥</Text>
                <Text style={styles.hintText}>&apos;{query}&apos; 검색 결과가 없어요.</Text>
              </View>
            ) : (
              <>
                {users.length > 0 && <Text style={styles.section}>사람</Text>}
                {users.map(renderUser)}
                {stores.length > 0 && <Text style={styles.section}>매장</Text>}
                {stores.map(renderStore)}
              </>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: { padding: 4 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  section: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  hintBox: { alignItems: 'center', paddingTop: 80, gap: spacing.sm },
  hintEmoji: { fontSize: 40 },
  hintText: { fontSize: 14, fontWeight: '600', color: colors.textTertiary, textAlign: 'center' },
  status: { textAlign: 'center', paddingTop: 40, color: colors.textTertiary, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt },
  storeThumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  name: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
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
