import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BlurBackdrop } from '@/components/ui/BlurBackdrop';
import { AppButton } from '@/components/ui/kit';
import { InfoKey, useShell } from '@/context/shell';
import { APP_WIDTH, colors, radius, shadow, spacing, type } from '@/theme';

const CARD_W = Math.min(APP_WIDTH - spacing.lg * 2, 520);
const MAX_H = Math.round(Dimensions.get('window').height * 0.9);

const TITLES: Record<InfoKey, string> = {
  notice: '공지사항',
  terms: '이용약관',
  privacy: '개인정보처리방침',
  support: '고객센터',
};

type Section = { heading?: string; body: string };

const TERMS: Section[] = [
  { heading: '제1조 목적', body: '본 약관은 PEED 서비스의 이용 조건 및 운영 기준을 정하는 것을 목적으로 합니다.' },
  { heading: '제2조 서비스 내용', body: '사용자는 리뷰 작성, PB 적립, 경품 응모, 당첨 확인 등의 기능을 이용할 수 있습니다.' },
  { heading: '제3조 유의사항', body: '허위 리뷰, 부정 응모, 비정상 활동이 확인될 경우 서비스 이용이 제한될 수 있습니다.' },
];

const PRIVACY: Section[] = [
  { heading: '수집 항목', body: '계정 정보(소셜 로그인), 리뷰·사진, 예약·응모 내역, 기기 정보를 수집합니다.' },
  { heading: '이용 목적', body: '서비스 제공, PB 적립·경품 운영, 부정 이용 방지, 고객 문의 응대에 이용합니다.' },
  { heading: '보관 및 파기', body: '관련 법령이 정한 기간 동안 보관 후 지체 없이 파기합니다. 탈퇴 시 즉시 파기됩니다.' },
];

function BodyContent({ which }: { which: InfoKey }) {
  if (which === 'notice') {
    return (
      <View style={styles.block}>
        <View style={styles.noticeTop}>
          <Text style={styles.pinned}>고정</Text>
          <Text style={styles.date}>2026.04.14</Text>
        </View>
        <Text style={styles.noticeTitle}>PEED 오픈 안내</Text>
        <Text style={styles.noticeSummary}>피드 서비스가 정식 오픈되었습니다.</Text>
        <Text style={styles.body}>
          피드 서비스가 정식 오픈되었습니다. 버닝 매장 방문 후 리뷰를 남기고 PB를
          받아보세요.
        </Text>
      </View>
    );
  }

  if (which === 'support') {
    return (
      <View style={styles.block}>
        <Text style={styles.noticeTitle}>문의가 필요하신가요?</Text>
        <Text style={styles.body}>
          서비스 이용 문의, 버닝매장 관련 문의, PB 적립·경품 문의를 남길 수 있어요.
        </Text>
        <View style={{ height: spacing.lg }} />
        <AppButton
          label="문의하기"
          variant="gradient"
          onPress={() =>
            Linking.openURL('mailto:help@peed.co.kr?subject=' + encodeURIComponent('[PEED 문의]'))
          }
        />
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxTitle}>운영시간</Text>
          <Text style={styles.body}>평일 10:00 – 18:00</Text>
        </View>
      </View>
    );
  }

  const sections = which === 'terms' ? TERMS : PRIVACY;
  return (
    <View style={styles.block}>
      {sections.map((s, i) => (
        <View key={i} style={{ marginBottom: spacing.md }}>
          {s.heading ? <Text style={styles.sectionHeading}>{s.heading}</Text> : null}
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
    </View>
  );
}

// Settings info pages rendered as a blurred popup (공지/약관/개인정보/고객센터).
export function InfoSheet() {
  const { infoSheet, closeInfoSheet } = useShell();
  if (!infoSheet) return null;

  return (
    <BlurBackdrop onPress={closeInfoSheet}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{TITLES[infoSheet]}</Text>
          <TouchableOpacity onPress={closeInfoSheet} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <BodyContent which={infoSheet} />
        </ScrollView>
      </View>
    </BlurBackdrop>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    maxHeight: MAX_H,
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    ...({ boxShadow: '0 24px 70px rgba(0,0,0,0.35)' } as object),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: MAX_H,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  block: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  noticeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pinned: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  date: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '700',
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  noticeSummary: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  infoBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
});
