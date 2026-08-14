import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

const FAQ: { q: string; a: string }[] = [
  {
    q: '리뷰 인증은 어떻게 하나요?',
    a: '방문한 매장의 영수증을 찍어 올리고, 매장 이름을 쳐서 지점을 고르면 돼요. 고르면 주소·지역이 자동으로 채워져요. 별점과 리뷰는 PEED 안에서 직접 쓰면 끝이에요. 다른 앱에 리뷰를 쓰거나 코드를 붙일 필요는 없어요. 결제일로부터 2주 안의 영수증이면 인증돼요.',
  },
  {
    q: 'PB는 어디에 쓰나요?',
    a: '모은 PB로 경품에 응모하거나, 플레이 탭의 미니게임에 베팅해 겨룰 수 있어요.',
  },
  {
    q: '경품 당첨은 어떻게 확인하나요?',
    a: '마이 > 당첨 탭에서 확인할 수 있고, 당첨되면 알림으로도 안내드려요.',
  },
  {
    q: '당첨된 경품은 어떻게 받나요?',
    a: '마이 > 당첨 탭에서 "수령하기"를 누르면 돼요. 상품권은 번호가 바로 나오고, 준비 중이면 준비가 끝났을 때 알림으로 알려드려요. 번호는 나중에 같은 화면에서 다시 볼 수 있어요.',
  },
  {
    q: '경품 수령 기한이 있나요?',
    a: '수령이 가능해진 날부터 30일이에요. 7일 전과 1일 전에 알림을 보내드리고, 기한이 지나면 당첨이 소멸돼 재발행되지 않아요.',
  },
  {
    q: '버닝 매장은 무엇인가요?',
    a: '리뷰 시 보너스 PB를 주는 제휴 매장이에요. 버닝맵에서 위치와 리워드를 확인할 수 있어요.',
  },
];

export default function SupportScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);

  const mail = () =>
    Linking.openURL('mailto:help@peed.co.kr?subject=' + encodeURIComponent('[PEED 문의]'));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>고객센터</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          {/* hero */}
          <View style={styles.hero}>
            <Text style={styles.heroEmoji}>💬</Text>
            <Text style={styles.heroTitle}>무엇을 도와드릴까요?</Text>
            <Text style={styles.heroDesc}>
              이용 문의, 버닝매장 제휴, PB·경품 관련 무엇이든 물어보세요.
            </Text>
          </View>

          {/* quick actions */}
          <TouchableOpacity style={styles.action} onPress={mail} activeOpacity={0.85}>
            <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="mail" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>이메일 문의</Text>
              <Text style={styles.actionSub}>help@peed.co.kr</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <View style={styles.action}>
            <View style={[styles.actionIcon, { backgroundColor: colors.limeSoft }]}>
              <Ionicons name="time" size={20} color={colors.limeInk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>운영시간</Text>
              <Text style={styles.actionSub}>평일 10:00 - 18:00 (주말·공휴일 휴무)</Text>
            </View>
          </View>

          {/* FAQ */}
          <Text style={styles.faqLabel}>자주 묻는 질문</Text>
          <View style={styles.faqCard}>
            {FAQ.map((f, i) => {
              const isOpen = open === i;
              return (
                <TouchableOpacity
                  key={f.q}
                  activeOpacity={0.85}
                  onPress={() => setOpen(isOpen ? null : i)}
                  style={[styles.faqRow, i > 0 && styles.faqBorder]}
                >
                  <View style={styles.faqQRow}>
                    <Text style={styles.faqQ}>{f.q}</Text>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={17}
                      color={colors.textTertiary}
                    />
                  </View>
                  {isOpen && <Text style={styles.faqA}>{f.a}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
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

  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 6,
    ...shadow.soft,
  },
  heroEmoji: { fontSize: 40, marginBottom: 4 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  heroDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },

  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  actionSub: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },

  faqLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textTertiary,
    marginTop: spacing.sm,
    paddingLeft: spacing.xs,
    letterSpacing: 0.3,
  },
  faqCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    ...shadow.soft,
  },
  faqRow: { paddingVertical: spacing.lg },
  faqBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  faqQRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  faqQ: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.textPrimary },
  faqA: {
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: spacing.md,
  },
});
