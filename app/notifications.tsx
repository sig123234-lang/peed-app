import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type NotifItem = { id: string; type: string; title: string; body: string; date: string; unread: boolean };

const TYPE_LABEL: Record<string, string> = {
  dm: '메시지',
  call: '통화',
  follow: '팔로우',
  comment: '댓글',
  like: '좋아요',
  reserve: '예약',
  issue: '발급',
  system: '알림',
};

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

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotifItem[]>([]);

  // 서버 알림 로드 + 진입 시 읽음 처리.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    fetch('/api/public?action=notifs', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.notifs)) {
          setNotifications(
            d.notifs.map((n: any) => ({
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              date: relDate(Number(n.ts) || Date.now()),
              unread: !n.read,
            }))
          );
        }
      })
      .catch(() => {});
    fetch('/api/public?action=notifsRead', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>알림</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyTitle}>새로운 알림이 없어요</Text>
            <Text style={styles.emptyBody}>
              적립·당첨·공지 등 새로운 소식이 오면{'\n'}여기에서 알려드릴게요.
            </Text>
          </View>
        ) : (
          notifications.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.topRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{TYPE_LABEL[item.type] || '알림'}</Text>
                </View>
                <Text style={styles.date}>{item.date}</Text>
              </View>

              <View style={styles.titleRow}>
                <Text style={styles.title}>{item.title}</Text>
                {item.unread ? <View style={styles.unreadDot} /> : null}
              </View>

              <Text style={styles.body}>{item.body}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    height: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  back: { fontSize: 28, color: '#111827', fontWeight: '700' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  scroll: { flex: 1 },
  contentContainer: { padding: 18, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  typeBadgeText: {
    color: '#4F6BFF',
    fontSize: 11,
    fontWeight: '800',
  },
  date: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },
  titleRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4D4F',
  },
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 96,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyEmoji: { fontSize: 44, marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});