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

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>이용약관</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>제1조 목적</Text>
          <Text style={styles.body}>
            본 약관은 PEED 서비스의 이용 조건 및 운영 기준을 정하는 것을 목적으로 합니다.
          </Text>

          <Text style={styles.sectionTitle}>제2조 서비스 내용</Text>
          <Text style={styles.body}>
            사용자는 리뷰 작성, PB 적립, 경품 응모, 당첨 확인 등의 기능을 이용할 수 있습니다.
          </Text>

          <Text style={styles.sectionTitle}>제3조 유의사항</Text>
          <Text style={styles.body}>
            허위 리뷰, 부정 응모, 비정상 활동이 확인될 경우 서비스 이용이 제한될 수 있습니다.
          </Text>
        </View>
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
  contentContainer: { padding: 18, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    marginTop: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6B7280',
  },
});