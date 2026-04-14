import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const notices = [
  {
    id: '1',
    title: 'PEED 오픈 안내',
    date: '2026.04.14',
    summary: '피드 서비스가 정식 오픈되었습니다.',
    content:
      '피드 서비스가 정식 오픈되었습니다. 버닝 매장 방문 후 리뷰를 남기고 PB를 받아보세요.',
    isPinned: true,
  },
];

export default function NoticeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>공지사항</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {notices.map((notice) => (
          <View key={notice.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.badgeWrap}>
                {notice.isPinned ? <Text style={styles.pinned}>고정</Text> : null}
                <Text style={styles.date}>{notice.date}</Text>
              </View>
            </View>

            <Text style={styles.title}>{notice.title}</Text>
            <Text style={styles.summary}>{notice.summary}</Text>
            <Text style={styles.content}>{notice.content}</Text>
          </View>
        ))}
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
  topRow: { marginBottom: 10 },
  badgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinned: {
    backgroundColor: '#EEF2FF',
    color: '#4F6BFF',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  date: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
  summary: { fontSize: 14, color: '#4B5563', marginBottom: 10, fontWeight: '700' },
  content: { fontSize: 14, lineHeight: 21, color: '#6B7280' },
});