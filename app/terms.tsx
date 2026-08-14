import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '제1조 (목적)',
    body: '본 약관은 PEED 서비스의 이용 조건 및 운영 기준을 정하는 것을 목적으로 합니다.',
  },
  {
    title: '제2조 (서비스 내용)',
    body: '사용자는 리뷰 작성, PB 적립, 경품 응모, 당첨 확인, 미니게임 참여 등의 기능을 이용할 수 있습니다.',
  },
  {
    title: '제3조 (PB 적립·사용)',
    body: 'PB는 리뷰 인증·초대·방문 등으로 적립되며, 경품 응모와 미니게임에 사용됩니다. 부정 적립이 확인되면 회수될 수 있습니다.',
  },
  {
    title: '제4조 (리뷰 인증)',
    body: '외부 리뷰에 인증 키워드(PEED) 또는 피드))를 포함해 작성하고, 해당 화면을 인증해야 보상이 지급됩니다.',
  },
  {
    title: '제5조 (유의사항)',
    body: '허위 리뷰, 중복·부정 응모, 비정상 활동이 확인될 경우 보상이 취소되거나 서비스 이용이 제한될 수 있습니다.',
  },
  {
    title: '제6조 (예약·노쇼)',
    body: '예약 시 일부 PB가 보증금으로 잠기며, 방문 완료 시 반환됩니다. 노쇼가 반복되면 예약이 제한될 수 있습니다.',
  },
  // 수령 기한을 약관에 두지 않으면 미수령 건을 정리할 근거가 없어, 장부가
  // 영원히 닫히지 않는다. 기한·소멸·재발행 불가를 함께 밝힌다.
  {
    title: '제7조 (경품 당첨·수령)',
    body:
      '당첨자는 발표일에 자동 추첨으로 선정되며, 앱 알림과 마이 > 당첨 탭으로 안내됩니다. ' +
      '경품은 수령이 가능해진 날부터 30일 이내에 받아야 하며, 기한이 지나면 당첨이 소멸되어 재발행되지 않습니다. ' +
      '기한 만료 전 알림으로 두 차례 안내드립니다.',
  },
  {
    title: '제8조 (상품권 경품)',
    body:
      '상품권 경품의 번호는 본인 계정에서만 확인할 수 있으며, 확인 시점이 기록됩니다. ' +
      '확인 후 번호의 관리 책임은 당첨자에게 있고, 타인에게 노출되어 사용된 경우 재발행되지 않습니다. ' +
      '부정 응모가 확인되면 수령 후에도 당첨이 취소될 수 있습니다.',
  },
];

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>이용약관</Text>
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
