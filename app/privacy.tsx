import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. 수집하는 항목',
    body: '계정 정보(소셜 로그인 식별자·닉네임·프로필 사진), 작성한 리뷰·사진·댓글, 예약·응모·PB 적립 내역, 서비스 이용 기록 및 기기 정보를 수집합니다.',
  },
  {
    title: '2. 이용 목적',
    body: '서비스 제공, PB 적립·경품 운영, 예약·리뷰 인증 처리, 부정 이용 방지, 고객 문의 응대, 서비스 개선을 위해 이용합니다.',
  },
  {
    title: '3. 제3자 제공',
    body: '이용자의 동의 없이는 개인정보를 외부에 제공하지 않습니다. 다만 관련 법령에 근거하거나 수사기관의 적법한 요청이 있는 경우에 한해 제공될 수 있습니다.',
  },
  {
    title: '4. 보관 및 파기',
    body: '수집한 개인정보는 관련 법령이 정한 기간 동안 보관 후 지체 없이 파기합니다. 회원 탈퇴 시 별도 보관이 필요한 정보를 제외하고 즉시 파기됩니다.',
  },
  {
    title: '5. 이용자의 권리',
    body: '이용자는 언제든지 본인의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있으며, 앱 설정 또는 고객센터를 통해 요청할 수 있습니다.',
  },
  {
    title: '6. 안전성 확보 조치',
    body: '개인정보는 암호화된 통신 구간을 통해 전송·보관되며, 접근 권한을 최소화하여 관리합니다.',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>개인정보처리방침</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          <Text style={styles.updated}>최종 개정일 2026.07.20</Text>
          <View style={styles.card}>
            {SECTIONS.map((s, i) => (
              <View key={s.title} style={[styles.section, i > 0 && styles.sectionBorder]}>
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.footer}>문의: help@peed.co.kr</Text>
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
  center: { width: APP_WIDTH, paddingHorizontal: spacing.lg },
  updated: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary, marginBottom: spacing.md, paddingLeft: spacing.xs },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  section: { paddingVertical: spacing.lg },
  sectionBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 22, color: colors.textSecondary, fontWeight: '500' },
  footer: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
