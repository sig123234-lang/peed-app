import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

type Notice = {
  id: string;
  title: string;
  date: string;
  content: string;
  tag: string;
  pinned?: boolean;
};

export default function NoticeScreen() {
  const router = useRouter();
  // 공지는 어드민(공지·알림)에서 작성한 것을 서버에서 받아온다.
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/public?action=notices')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const items: Notice[] = Array.isArray(d?.items) ? d.items : [];
        setNotices(items);
        setOpen(items.find((n) => n.pinned)?.id ?? items[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>공지사항</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          {loading ? (
            <Text style={styles.emptyText}>불러오는 중…</Text>
          ) : notices.length === 0 ? (
            <Text style={styles.emptyText}>등록된 공지가 없어요.</Text>
          ) : null}
          {notices.map((n) => {
            const isOpen = open === n.id;
            return (
              <TouchableOpacity
                key={n.id}
                activeOpacity={0.9}
                onPress={() => setOpen(isOpen ? null : n.id)}
                style={styles.card}
              >
                <View style={styles.metaRow}>
                  <View style={[styles.tag, n.pinned && styles.tagPinned]}>
                    <Text style={[styles.tagText, n.pinned && styles.tagTextPinned]}>
                      {n.pinned ? '📌 고정' : n.tag}
                    </Text>
                  </View>
                  <Text style={styles.date}>{n.date}</Text>
                </View>

                <View style={styles.titleRow}>
                  <Text style={styles.title}>{n.title}</Text>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </View>

                {isOpen && <Text style={styles.body}>{n.content}</Text>}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 24 }} />
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
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing['3xl'],
  },
  content: { alignItems: 'center', paddingTop: spacing.lg },
  center: { width: APP_WIDTH, paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  tagPinned: { backgroundColor: colors.primarySoft },
  tagText: { fontSize: 11.5, fontWeight: '800', color: colors.textSecondary },
  tagTextPinned: { color: colors.primary },
  date: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: spacing.md,
  },
});
