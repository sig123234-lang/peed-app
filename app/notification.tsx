import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

/* 알림 상세 — 공지·약관과 같은 결의 정식 페이지.
   목록에서 누르면 여기로 들어오고, 본문을 다 읽은 뒤 관련 화면으로 이어간다. */

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  ts: number;
  postId?: string;
};

const TYPE_META: Record<
  string,
  { label: string; icon: string; color: string; soft: string; cta: string }
> = {
  raffle: { label: '당첨', icon: 'trophy', color: '#F59E0B', soft: '#FEF3C7', cta: '당첨 내역 보기' },
  product: { label: '경품', icon: 'gift', color: colors.coral, soft: colors.coralSoft, cta: '경품 보러 가기' },
  dm: { label: '메시지', icon: 'chatbubble', color: colors.primary, soft: colors.primarySoft, cta: '대화 열기' },
  call: { label: '통화', icon: 'call', color: colors.primary, soft: colors.primarySoft, cta: '대화 열기' },
  follow: { label: '팔로우', icon: 'person-add', color: '#8B5CF6', soft: '#EDE9FE', cta: '내 프로필 보기' },
  comment: { label: '댓글', icon: 'chatbox-ellipses', color: colors.primary, soft: colors.primarySoft, cta: '게시물 보기' },
  like: { label: '좋아요', icon: 'heart', color: colors.coral, soft: colors.coralSoft, cta: '게시물 보기' },
  reserve: { label: '예약', icon: 'calendar', color: '#10B981', soft: '#D1FAE5', cta: '예약 확인' },
  pb: { label: 'PB', icon: 'diamond', color: colors.primary, soft: colors.primarySoft, cta: 'PB 내역 보기' },
  notice: { label: '공지', icon: 'megaphone', color: '#0EA5E9', soft: '#E0F2FE', cta: '공지사항 보기' },
  system: { label: '알림', icon: 'notifications', color: colors.textSecondary, soft: colors.surfaceAlt, cta: '홈으로' },
};
const metaOf = (t: string) => TYPE_META[t] || TYPE_META.system;

function fullDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

function targetOf(n: Notif): string {
  switch (n.type) {
    case 'raffle':
      return '/?tab=my&sub=wins';
    case 'product':
      return '/?tab=peed';
    case 'dm':
    case 'call':
      return '/?tab=dm';
    case 'notice':
      return '/notice';
    case 'comment':
    case 'like':
      return n.postId ? `/?post=${n.postId}` : '/';
    case 'follow':
      return '/?tab=my';
    case 'pb':
      return '/settings';
    default:
      return '/';
  }
}

export default function NotificationDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [item, setItem] = useState<Notif | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      setLoading(false);
      return;
    }
    let alive = true;
    fetch('/api/public?action=notifs', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const found = (d?.notifs || []).find((n: any) => n.id === id);
        if (found) {
          setItem({
            id: found.id,
            type: found.type,
            title: found.title,
            body: found.body,
            ts: Number(found.ts) || Date.now(),
            postId: found.postId,
          });
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const remove = () => {
    if (!item) return;
    fetch('/api/public?action=notifDelete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    }).catch(() => {});
    router.back();
  };

  const meta = item ? metaOf(item.type) : metaOf('system');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림</Text>
        {item ? (
          <TouchableOpacity onPress={remove} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          {loading ? null : !item ? (
            <View style={styles.missing}>
              <View style={styles.missingIcon}>
                <Ionicons name="alert-circle-outline" size={26} color={colors.textTertiary} />
              </View>
              <Text style={styles.missingTitle}>알림을 찾을 수 없어요</Text>
              <Text style={styles.missingBody}>이미 삭제되었거나 만료된 알림이에요.</Text>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => router.back()}>
                <Text style={styles.ghostBtnText}>알림 목록으로</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                {/* 종류를 큼직하게 — 무슨 알림인지 먼저 들어와야 한다. */}
                <View style={[styles.hero, { backgroundColor: meta.soft }]}>
                  <Ionicons name={meta.icon as any} size={30} color={meta.color} />
                </View>
                <View style={[styles.chip, { backgroundColor: meta.soft }]}>
                  <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
                </View>

                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.date}>{fullDate(item.ts)}</Text>

                <View style={styles.divider} />

                <Text style={styles.body}>{item.body || '내용이 없는 알림이에요.'}</Text>
              </View>

              <TouchableOpacity
                style={[styles.cta, { backgroundColor: meta.color }]}
                activeOpacity={0.9}
                onPress={() => router.push(targetOf(item) as any)}
              >
                <Text style={styles.ctaText}>{meta.cta}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.white} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.ghostBtn} onPress={() => router.back()}>
                <Text style={styles.ghostBtnText}>알림 목록으로</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },

  content: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing['4xl'] },
  center: { width: APP_WIDTH, paddingHorizontal: spacing.lg, gap: spacing.md },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.soft,
  },
  hero: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  title: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  date: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, marginTop: 6 },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.line,
    marginVertical: spacing.lg,
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.md,
  },
  ctaText: { fontSize: 15, fontWeight: '800', color: colors.white },
  ghostBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 14, fontWeight: '700', color: colors.textTertiary },

  missing: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.soft,
  },
  missingIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  missingTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  missingBody: { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
});
