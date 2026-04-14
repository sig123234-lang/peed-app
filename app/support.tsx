import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SupportScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>고객센터</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>문의가 필요하신가요?</Text>
          <Text style={styles.desc}>
            서비스 이용 문의, 버닝매장 관련 문의, PB 적립/경품 문의를 남길 수 있어요.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => Alert.alert('문의하기', '여기에 문의 작성 화면을 연결하면 돼.')}
          >
            <Text style={styles.primaryButtonText}>문의하기</Text>
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>운영시간</Text>
            <Text style={styles.infoText}>평일 10:00 - 18:00</Text>
          </View>
        </View>
      </View>
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
  content: { flex: 1, padding: 18 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  desc: { fontSize: 14, lineHeight: 21, color: '#6B7280', marginBottom: 18 },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#4F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  infoBox: {
    backgroundColor: '#F7F8FA',
    borderRadius: 16,
    padding: 14,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
  },
});