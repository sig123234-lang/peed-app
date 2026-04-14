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

const notifications = [
  {
    id: '1',
    type: '공지',
    title: '새 공지가 등록되었어요',
    body: 'PEED 오픈 안내 공지를 확인해 보세요.',
    date: '방금 전',
    unread: true,
  },
  {
    id: '2',
    type: '경품',
    title: '새 경품이 추가되었어요',
    body: '닌텐도 스위치 OLED 응모가 시작되었어요.',
    date: '10분 전',
    unread: true,
  },
  {
    id: '3',
    type: 'PB',
    title: 'PB가 적립되었어요',
    body: '리뷰 인증 완료로 10PB가 적립되었어요.',
    date: '1시간 전',
    unread: false,
  },
  {
    id: '4',
    type: '당첨',
    title: '경품 추첨이 완료되었어요',
    body: '응모한 경품의 결과를 확인해 보세요.',
    date: '어제',
    unread: false,
  },
];

export default function NotificationsScreen() {
  const router = useRouter();

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
        {notifications.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{item.type}</Text>
              </View>
              <Text style={styles.date}>{item.date}</Text>
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.title}>{item.title}</Text>
              {item.unread ? <View style={styles.unreadDot} /> : null}
            </View>

            <Text style={styles.body}>{item.body}</Text>
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
});