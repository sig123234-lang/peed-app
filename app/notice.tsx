import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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

const NOTICES: Notice[] = [
  {
    id: '3',
    title: 'PB 대결 미니게임 오픈',
    date: '2026.07.20',
    tag: '업데이트',
    content:
      'PB를 걸고 겨루는 미니게임(가위바위보·스피드 퀴즈·라스트맨)이 열렸어요. 플레이 탭에서 랜덤 매칭으로 바로 즐겨보세요.',
    pinned: true,
  },
  {
    id: '2',
    title: '버닝맵 개편 안내',
    date: '2026.07.15',
    tag: '업데이트',
    content:
      '지도에 매장 이름·리워드가 표시되고, 카테고리 필터와 "이 지역 검색"이 추가됐어요. 카카오맵·길찾기 연동도 지원해요.',
  },
  {
    id: '1',
    title: 'PEED 정식 오픈',
    date: '2026.04.14',
    tag: '공지',
    content:
      '버닝 매장 방문 후 리뷰를 남기고 PB를 받아보세요. 모은 PB로 경품에 응모하거나 미니게임에 참여할 수 있어요.',
  },
];

export default function NoticeScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(NOTICES.find((n) => n.pinned)?.id ?? null);

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
          {NOTICES.map((n) => {
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
