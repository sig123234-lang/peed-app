import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePush } from '@/hooks/use-push';
import { colors, radius, shadow, spacing, type } from '@/theme';

type NotifItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  ts: number;
  unread: boolean;
  postId?: string;
};

// 종류별 아이콘·색. 글자 배지만 있으면 목록이 밋밋해 한눈에 안 들어온다.
const TYPE_META: Record<string, { label: string; icon: string; color: string; soft: string }> = {
  raffle: { label: '당첨', icon: 'trophy', color: '#F59E0B', soft: '#FEF3C7' },
  product: { label: '경품', icon: 'gift', color: colors.coral, soft: colors.coralSoft },
  dm: { label: '메시지', icon: 'chatbubble', color: colors.primary, soft: colors.primarySoft },
  call: { label: '통화', icon: 'call', color: colors.primary, soft: colors.primarySoft },
  follow: { label: '팔로우', icon: 'person-add', color: '#8B5CF6', soft: '#EDE9FE' },
  comment: {
    label: '댓글',
    icon: 'chatbox-ellipses',
    color: colors.primary,
    soft: colors.primarySoft,
  },
  like: { label: '좋아요', icon: 'heart', color: colors.coral, soft: colors.coralSoft },
  reserve: { label: '예약', icon: 'calendar', color: '#10B981', soft: '#D1FAE5' },
  pb: { label: 'PB', icon: 'diamond', color: colors.primary, soft: colors.primarySoft },
  notice: { label: '공지', icon: 'megaphone', color: '#0EA5E9', soft: '#E0F2FE' },
  system: {
    label: '알림',
    icon: 'notifications',
    color: colors.textSecondary,
    soft: colors.surfaceAlt,
  },
};
const metaOf = (t: string) => TYPE_META[t] || TYPE_META.system;

function relDate(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return '방금 전';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d === 1 ? '어제' : `${d}일 전`;
}

const SWIPE_KILL = 96; // 이 거리를 넘겨 놓으면 삭제 확정

/** 좌우 어느 쪽으로 밀어도 삭제되는 알림 행. */
function SwipeRow({
  item,
  onOpen,
  onDelete,
}: {
  item: NotifItem;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const h = useRef(new Animated.Value(1)).current;
  const [dir, setDir] = useState<0 | 1 | -1>(0);
  const meta = metaOf(item.type);

  const remove = useCallback(
    (toRight: boolean) => {
      Animated.sequence([
        Animated.timing(x, {
          toValue: toRight ? 500 : -500,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(h, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]).start(() => onDelete());
    },
    [x, h, onDelete]
  );

  const pan = useRef(
    PanResponder.create({
      // 가로로 확실히 움직일 때만 잡는다 — 세로 스크롤을 방해하지 않게.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => {
        x.setValue(g.dx);
        setDir(g.dx > 0 ? 1 : g.dx < 0 ? -1 : 0);
      },
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) > SWIPE_KILL) {
          remove(g.dx > 0);
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start(() =>
            setDir(0)
          );
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(() => setDir(0));
      },
    })
  ).current;

  return (
    <Animated.View style={{ transform: [{ scaleY: h }], opacity: h }}>
      <View style={styles.rowWrap}>
        {/* 뒤에 깔리는 삭제 배경 — 미는 방향 쪽에만 아이콘이 보인다. */}
        <View style={styles.deleteLayer}>
          <View style={[styles.deleteSide, { opacity: dir === 1 ? 1 : 0 }]}>
            <Ionicons name="trash" size={18} color={colors.white} />
            <Text style={styles.deleteText}>삭제</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={[styles.deleteSide, { opacity: dir === -1 ? 1 : 0 }]}>
            <Text style={styles.deleteText}>삭제</Text>
            <Ionicons name="trash" size={18} color={colors.white} />
          </View>
        </View>

        <Animated.View
          style={[styles.card, { transform: [{ translateX: x }] }]}
          {...pan.panHandlers}
        >
          <TouchableOpacity style={styles.cardTap} activeOpacity={0.7} onPress={onOpen}>
            <View style={[styles.icon, { backgroundColor: meta.soft }]}>
              <Ionicons name={meta.icon as any} size={18} color={meta.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 as any }}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.unread ? <View style={styles.unreadDot} /> : null}
              </View>
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.date}>{relDate(item.ts)}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [loading, setLoading] = useState(true);
  const push = usePush();

  const load = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    fetch('/api/public?action=notifs', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d?.notifs)) return;
        setItems(
          d.notifs.map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            ts: Number(n.ts) || Date.now(),
            unread: !n.read,
            postId: n.postId,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // 화면에 들어온 순간 읽음 처리(뱃지를 남겨두지 않는다).
    fetch('/api/public?action=notifsRead', { method: 'POST', credentials: 'include' }).catch(
      () => {}
    );
  }, [load]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    fetch('/api/public?action=notifDelete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    fetch('/api/public?action=notifClear', { method: 'POST', credentials: 'include' }).catch(
      () => {}
    );
  }, []);

  // 알림 상세 페이지로 이동 — 공지·약관과 같은 결의 정식 화면.
  // 새 탭(팝업)으로 띄우면 뒤로가기가 끊기고 브라우저가 차단하기도 한다.
  const open = useCallback(
    (n: NotifItem) => {
      router.push({ pathname: '/notification', params: { id: n.id } } as any);
    },
    [router]
  );

  const showPushBanner = push.supported && push.configured && !push.subscribed;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림</Text>
        {items.length > 0 ? (
          <TouchableOpacity onPress={clearAll} hitSlop={10} style={styles.headerBtn}>
            <Text style={styles.clearText}>전체삭제</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {showPushBanner ? (
          <TouchableOpacity
            style={styles.pushBanner}
            activeOpacity={0.85}
            disabled={push.busy}
            onPress={async () => {
              const r = await push.enable();
              if (!r.ok && r.reason === 'denied') {
                alert(
                  '브라우저에서 알림이 차단돼 있어요.\n주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿔주세요.'
                );
              }
            }}
          >
            <View style={styles.pushIcon}>
              <Ionicons name="notifications" size={18} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pushTitle}>푸시 알림 켜기</Text>
              <Text style={styles.pushBody}>
                앱을 닫아도 당첨·새 경품·메시지를 바로 알려드려요.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        ) : null}

        {loading ? null : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={28} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>새로운 알림이 없어요</Text>
            <Text style={styles.emptyBody}>
              적립·당첨·공지 등 새로운 소식이 오면{'\n'}여기에서 알려드릴게요.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>좌우 어느 쪽으로든 밀면 삭제돼요</Text>
            {items.map((n) => (
              <SwipeRow key={n.id} item={n} onOpen={() => open(n)} onDelete={() => remove(n.id)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    height: 56,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerBtn: { minWidth: 64, height: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  headerTitle: { ...type.title, color: colors.textPrimary },
  clearText: { fontSize: 13, fontWeight: '700', color: colors.textTertiary, textAlign: 'right' },

  scroll: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing['4xl'], gap: spacing.sm },
  hint: {
    ...type.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingBottom: spacing.xs,
  },

  /* 푸시 유도 배너 */
  pushBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xs,
    ...shadow.soft,
  },
  pushIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pushTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  pushBody: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  /* 스와이프 행 */
  rowWrap: { position: 'relative' },
  deleteLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.coral,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
  },
  deleteSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteText: { color: colors.white, fontSize: 13, fontWeight: '800' },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coral },
  body: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  typeText: { fontSize: 11, fontWeight: '800' },
  dot: { fontSize: 11, color: colors.textTertiary },
  date: { fontSize: 11, fontWeight: '700', color: colors.textTertiary },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: spacing.sm },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
