import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import { useShell } from '@/context/shell';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

const SETTINGS_KEY = 'PEED_SETTINGS';
const DEFAULT_SETTINGS = {
  social: true,
  follow: true,
  reserve: true,
  prize: true,
  burning: true,
  marketing: false,
  privateAcc: false,
  activeStatus: true,
  tagPolicy: '모든 사람' as '모든 사람' | '팔로워' | '아무도',
};

type SheetKey = 'linked' | 'security' | 'blocked' | 'tag' | 'pb' | 'lang';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function NavRow({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={icon}
        size={19}
        color={danger ? colors.danger : colors.textSecondary}
      />
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>
        {label}
      </Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {!danger && (
        <Ionicons name="chevron-forward" size={17} color={colors.textTertiary} />
      )}
    </TouchableOpacity>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onValueChange,
  disabled,
  hint,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <Ionicons name={icon} size={19} color={colors.textSecondary} />
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.lineStrong, true: colors.primary }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { setAuthed, setTab } = useShell();
  const { pb } = usePb();
  const { setProfileAvatar } = useFeed();

  // All toggles persisted to AsyncStorage so they stick across refresh.
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  // 연결된 소셜 계정 표시 — 서버 세션의 provider 기준.
  const [providerLabel, setProviderLabel] = useState('소셜 로그인');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    fetch('/api/auth?action=me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const p = d?.user?.provider;
        if (p) {
          setProviderLabel(p === 'kakao' ? '카카오' : p === 'naver' ? '네이버' : p === 'google' ? 'Google' : p);
        }
      })
      .catch(() => {});
  }, []);

  const checkVersion = () => {
    if (typeof window !== 'undefined' && window.alert) window.alert('최신 버전을 사용 중이에요 (1.0.0)');
    else Alert.alert('버전', '최신 버전을 사용 중이에요 (1.0.0)');
  };

  const setTagPolicy = (v: (typeof DEFAULT_SETTINGS)['tagPolicy']) => {
    setS((prev) => ({ ...prev, tagPolicy: v }));
    setSheet(null);
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) setS((prev) => ({ ...prev, ...JSON.parse(raw) }));
      } catch (e) {
        console.log('설정 불러오기 실패', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s)).catch(() => {});
    }
  }, [s, loaded]);

  const upd = (k: keyof typeof DEFAULT_SETTINGS) => (v: boolean) =>
    setS((prev) => ({ ...prev, [k]: v }));

  // 실제 로그아웃 처리 — 서버 세션 쿠키 삭제 + 로컬 프로필 정리 후 온보딩으로.
  const doLogout = async () => {
    // 1) 서버 소셜 세션 쿠키 만료 (웹).
    if (Platform.OS === 'web') {
      try {
        await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' });
      } catch {
        // 네트워크 실패해도 로컬 로그아웃은 진행한다.
      }
    }
    // 2) 로컬에 브릿지해 둔 프로필 흔적 제거 (다음 로그인 계정과 안 섞이도록).
    try {
      await AsyncStorage.multiRemove(['PROFILE_NAME', 'PROFILE_HANDLE', 'PROFILE_AVATAR']);
    } catch {
      // ignore
    }
    setProfileAvatar(null);
    // 3) 앱 상태 초기화 → 온보딩/로그인 화면.
    setTab('home');
    setAuthed(false);
  };

  const logout = () => {
    // RN Web 은 다중 버튼 Alert 의 onPress 가 동작하지 않으므로 confirm 으로 분기.
    if (Platform.OS === 'web') {
      const ok = typeof window !== 'undefined' && window.confirm
        ? window.confirm('정말 로그아웃할까요?')
        : true;
      if (ok) doLogout();
      return;
    }
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => { doLogout(); } },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.centerWrap}>
          <View style={styles.pageHeader}>
            <TouchableOpacity onPress={() => setTab('my')} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>설정</Text>
            <View style={{ width: 24 }} />
          </View>

          <Section title="계정">
            <NavRow icon="person-outline" label="프로필 편집" onPress={() => setTab('my')} />
            <NavRow icon="chatbubble-ellipses-outline" label="연결된 계정" value={providerLabel} onPress={() => setSheet('linked')} />
            <NavRow icon="lock-closed-outline" label="비밀번호 · 보안" onPress={() => setSheet('security')} last />
          </Section>

          <Section title="알림">
            <ToggleRow icon="heart-outline" label="좋아요 · 댓글" value={s.social} onValueChange={upd('social')} />
            <ToggleRow icon="person-add-outline" label="팔로우" value={s.follow} onValueChange={upd('follow')} />
            <ToggleRow icon="calendar-outline" label="예약 알림" hint="예약 확정 · 리마인드 · 방문" value={s.reserve} onValueChange={upd('reserve')} />
            <ToggleRow icon="trophy-outline" label="경품 · 당첨" value={s.prize} onValueChange={upd('prize')} />
            <ToggleRow icon="flame-outline" label="버닝 매장 소식" value={s.burning} onValueChange={upd('burning')} />
            <ToggleRow icon="megaphone-outline" label="마케팅 정보 수신" hint="이벤트 · 혜택 (야간 포함)" value={s.marketing} onValueChange={upd('marketing')} last />
          </Section>

          <Section title="공개 범위 · 개인정보">
            <ToggleRow icon="lock-closed-outline" label="비공개 계정" hint="승인한 사람만 내 피드를 봐요" value={s.privateAcc} onValueChange={upd('privateAcc')} />
            <ToggleRow icon="ellipse-outline" label="활동 상태 표시" value={s.activeStatus} onValueChange={upd('activeStatus')} />
            <NavRow icon="ban-outline" label="차단한 계정" onPress={() => setSheet('blocked')} />
            <NavRow icon="pricetag-outline" label="태그 · 멘션 허용" value={s.tagPolicy} onPress={() => setSheet('tag')} last />
          </Section>

          <Section title="리워드">
            <NavRow icon="diamond-outline" label="PB 내역" onPress={() => setSheet('pb')} last />
          </Section>

          <Section title="앱">
            <NavRow icon="language-outline" label="언어" value="한국어" onPress={() => setSheet('lang')} last />
          </Section>

          <Section title="지원 · 정보">
            <NavRow icon="notifications-outline" label="공지사항" onPress={() => router.push('/notice')} />
            <NavRow icon="document-text-outline" label="이용약관" onPress={() => router.push('/terms')} />
            <NavRow icon="shield-checkmark-outline" label="개인정보처리방침" onPress={() => router.push('/privacy')} />
            <NavRow icon="headset-outline" label="고객센터" onPress={() => router.push('/support')} />
            <NavRow icon="information-circle-outline" label="버전" value="1.0.0" onPress={checkVersion} last />
          </Section>

          <Section title="">
            <NavRow icon="log-out-outline" label="로그아웃" onPress={logout} danger last />
          </Section>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>

      <SettingsSheet
        sheet={sheet}
        onClose={() => setSheet(null)}
        pb={pb}
        tagPolicy={s.tagPolicy}
        onTagPolicy={setTagPolicy}
      />
    </View>
  );
}

const SHEET_TITLE: Record<SheetKey, string> = {
  linked: '연결된 계정',
  security: '비밀번호 · 보안',
  blocked: '차단한 계정',
  tag: '태그 · 멘션 허용',
  pb: 'PB 내역',
  lang: '언어',
};

function SettingsSheet({
  sheet,
  onClose,
  pb,
  tagPolicy,
  onTagPolicy,
}: {
  sheet: SheetKey | null;
  onClose: () => void;
  pb: number;
  tagPolicy: string;
  onTagPolicy: (v: (typeof DEFAULT_SETTINGS)['tagPolicy']) => void;
}) {
  // PB 원장 — 'pb' 시트 열 때 서버에서 최근 내역 로드.
  const [pbEvents, setPbEvents] = useState<
    { id: string; delta: number; reason: string; balanceAfter: number; ts: number }[]
  >([]);
  const [pbBalance, setPbBalance] = useState<number | null>(null);
  useEffect(() => {
    if (sheet !== 'pb' || Platform.OS !== 'web') return;
    fetch('/api/public?action=pbLedger', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setPbEvents(Array.isArray(d.events) ? d.events : []);
          if (typeof d.balance === 'number') setPbBalance(d.balance);
        }
      })
      .catch(() => {});
  }, [sheet]);

  return (
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{sheet ? SHEET_TITLE[sheet] : ''}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {sheet === 'linked' && (
            <View style={styles.sheetBody}>
              <LinkedRow name="카카오" connected />
              <LinkedRow name="네이버" />
              <LinkedRow name="구글" last />
            </View>
          )}

          {sheet === 'security' && (
            <View style={styles.sheetBody}>
              <Text style={styles.sheetText}>
                지금은 카카오 소셜 로그인을 사용 중이라 별도 비밀번호가 없어요.
                {'\n\n'}로그인 보안은 연결된 카카오 계정에서 관리돼요.
              </Text>
            </View>
          )}

          {sheet === 'blocked' && (
            <View style={[styles.sheetBody, styles.sheetEmpty]}>
              <Text style={styles.sheetEmptyEmoji}>🚫</Text>
              <Text style={styles.sheetText}>차단한 계정이 없어요.</Text>
            </View>
          )}

          {sheet === 'tag' && (
            <View style={styles.sheetBody}>
              {(['모든 사람', '팔로워', '아무도'] as const).map((opt, i, arr) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.optRow, i < arr.length - 1 && styles.rowBorder]}
                  onPress={() => onTagPolicy(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optLabel}>{opt}</Text>
                  {tagPolicy === opt && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {sheet === 'pb' && (
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.pbBalance}>
                <Text style={styles.pbBalanceLabel}>보유 PB</Text>
                <Text style={styles.pbBalanceValue}>
                  {(pbBalance ?? pb).toLocaleString()} PB
                </Text>
              </View>
              {pbEvents.length === 0 ? (
                <Text style={styles.sheetHint}>
                  아직 PB 내역이 없어요.{'\n'}리뷰를 남기면 적립 내역이 여기에 쌓여요.
                </Text>
              ) : (
                pbEvents.map((e) => (
                  <View key={e.id} style={styles.pbEventRow}>
                    <Ionicons
                      name={e.delta >= 0 ? 'add-circle' : 'remove-circle'}
                      size={18}
                      color={e.delta >= 0 ? colors.success : colors.coral}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pbEventReason}>{e.reason}</Text>
                      <Text style={styles.pbEventDate}>
                        {new Date(e.ts).toISOString().slice(0, 10).replace(/-/g, '.')}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.pbEventDelta,
                        { color: e.delta >= 0 ? colors.success : colors.coral },
                      ]}
                    >
                      {e.delta >= 0 ? `+${e.delta}` : e.delta} PB
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {sheet === 'lang' && (
            <View style={styles.sheetBody}>
              <View style={[styles.optRow, styles.rowBorder]}>
                <Text style={styles.optLabel}>한국어</Text>
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              </View>
              <View style={styles.optRow}>
                <Text style={[styles.optLabel, { color: colors.textTertiary }]}>English</Text>
                <Text style={styles.sheetHint}>준비 중</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function LinkedRow({ name, connected, last }: { name: string; connected?: boolean; last?: boolean }) {
  return (
    <View style={[styles.optRow, !last && styles.rowBorder]}>
      <Text style={styles.optLabel}>{name}</Text>
      {connected ? (
        <View style={styles.connectedBadge}>
          <Text style={styles.connectedText}>연결됨</Text>
        </View>
      ) : (
        <Text style={styles.sheetHint}>연결 안 됨</Text>
      )}
    </View>
  );
}

function PbLine({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  return (
    <View style={styles.pbLine}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.pbLineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  centerWrap: {
    width: APP_WIDTH,
    paddingHorizontal: spacing.lg,
  },

  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.textTertiary,
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadow.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabelWrap: {
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowHint: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  /* bottom sheet */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,18,34,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingTop: spacing.sm,
    maxHeight: '80%',
    width: '100%',
    maxWidth: APP_WIDTH,
    alignSelf: 'center',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  sheetScroll: {
    maxHeight: 360,
  },
  sheetBody: {
    paddingVertical: spacing.sm,
  },
  sheetText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sheetHint: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  sheetEmpty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  sheetEmptyEmoji: {
    fontSize: 36,
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  optLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  connectedBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  pbBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  pbBalanceLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  pbBalanceValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  pbEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  pbEventReason: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pbEventDate: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    marginTop: 2,
  },
  pbEventDelta: {
    fontSize: 15,
    fontWeight: '900',
  },
  pbLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
  },
  pbLineText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
