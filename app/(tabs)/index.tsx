import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useShell } from '@/context/shell';
import { APP_WIDTH, colors, gradients, radius, shadow, spacing } from '@/theme';
import Home from './home';

// 온보딩 — 예전에는 슬라이드 3장을 끝까지 넘겨야 로그인 화면이 나왔다.
// 지금은 로그인 버튼이 처음부터 바닥에 있고, 위쪽 히어로만 알아서 흐른다.
// '이용 방법'은 눌러야 열리는 시트로 빼서, 급한 사람은 건너뛰고 바로 시작한다.

const { height } = Dimensions.get('window');
const width = APP_WIDTH;

const KAKAO_YELLOW = '#FEE500';
const KAKAO_TEXT = '#191919';

const SLIDES = [
  {
    tag: 'PLAY · EAT · ENTERTAIN · DRINK',
    title: '어차피\n쓸 거잖아',
    body: '놀고, 먹고, 즐기고, 마시고\n이미 쓴 돈이라면 남겨봐.',
  },
  {
    tag: '영수증 한 장이면 돼',
    title: '30초면\n충분해',
    body: '먹고 받은 영수증 찍고\n한 줄만 남기면 끝.',
  },
  {
    tag: 'REVIEW → REWARD',
    title: '이런 것까지\n경품으로?',
    body: '리뷰가 쌓이고 쌓이면\n상상 그 이상의 기회가 열려.',
  },
];

const HOW_STEPS = [
  {
    icon: 'receipt-outline' as const,
    tint: colors.primary,
    soft: colors.primarySoft,
    title: '영수증을 챙겨요',
    body: '방문한 매장의 영수증이면 돼요. 다른 앱에 리뷰를 쓰거나 코드를 붙일 필요 없어요.',
  },
  {
    icon: 'camera-outline' as const,
    tint: colors.tangerine,
    soft: colors.tangerineSoft,
    title: '영수증을 찍어 올려요',
    body: '상호·사업자번호·결제일시가 보이게 찍어주세요. 2주 안의 영수증이면 돼요.',
  },
  {
    icon: 'location-outline' as const,
    tint: colors.grape,
    soft: colors.grapeSoft,
    title: '매장을 골라요',
    body: '이름을 치면 지점까지 떠요. 고르면 주소·지역이 알아서 따라와요.',
  },
  {
    icon: 'create-outline' as const,
    tint: colors.teal,
    soft: colors.tealSoft,
    title: '리뷰는 PEED에 써요',
    body: '별점 고르고 한 줄이면 충분해요. 다른 앱에 옮겨 적을 필요 없어요.',
  },
  {
    icon: 'diamond-outline' as const,
    tint: colors.coralDeep,
    soft: colors.coralSoft,
    title: 'PB가 바로 쌓여요',
    body: '일반 매장 2PB, 🔥 버닝 매장은 10PB 이상. 버닝인 줄 몰랐어도 자동으로 챙겨드려요.',
  },
];

/* ------------------------------------------------------------- 이용 방법 시트 */

function HowToSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>PEED, 어떻게 쓰나요?</Text>
              <Text style={styles.sheetSub}>딱 다섯 단계, 30초면 끝나요</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.sheetClose}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            {HOW_STEPS.map((s, i) => (
              <View key={s.title} style={styles.stepRow}>
                <View style={styles.stepRail}>
                  <View style={[styles.stepDot, { backgroundColor: s.soft }]}>
                    <Ionicons name={s.icon} size={19} color={s.tint} />
                  </View>
                  {i < HOW_STEPS.length - 1 && <View style={styles.stepLine} />}
                </View>
                <View style={styles.stepBody}>
                  <Text style={styles.stepNo}>STEP {i + 1}</Text>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepText}>{s.body}</Text>
                </View>
              </View>
            ))}

            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>📸 이용 사진은 선택이에요</Text>
              <Text style={styles.noteText}>
                안 올려도 인증과 적립은 그대로예요. 올리면 홈 피드에도 게시돼요.
              </Text>
            </View>
            <View style={[styles.noteCard, styles.noteWarn]}>
              <Text style={styles.noteTitle}>⚠ 부정 인증은 걸러져요</Text>
              <Text style={styles.noteText}>
                같은 영수증은 한 번만 인증돼요. 승인번호가 영수증마다 달라서, 다시 찍거나
                잘라내도 자동으로 잡혀요.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ---------------------------------------------------------------- 온보딩 */

export default function IndexScreen() {
  const { authed, setAuthed } = useShell();
  const [page, setPage] = useState(0);
  const [howOpen, setHowOpen] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const fade = useRef(new Animated.Value(0)).current;

  // 첫 진입에서 바닥 시트가 부드럽게 올라오도록.
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [fade]);

  // 히어로 자동 전환 — 유저가 아무것도 안 해도 세 메시지를 다 보게 된다.
  useEffect(() => {
    if (authed) return;
    const t = setInterval(() => {
      setPage((prev) => {
        const next = (prev + 1) % SLIDES.length;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 3800);
    return () => clearInterval(t);
  }, [authed]);

  const socialLogin = (provider: 'kakao' | 'naver' | 'google') => {
    if (typeof window === 'undefined') {
      setAuthed(true);
      return;
    }
    window.location.href = `/api/auth?action=login&provider=${provider}`;
  };

  if (authed) return <Home />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" translucent={false} backgroundColor="#7B3FF2" />

      {/* 히어로 — 화면 전체를 덮는 그라디언트 위에 메시지가 흐른다 */}
      <LinearGradient
        colors={gradients.dusk}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 색을 더 얹는 장식 — 단색 그라디언트만 있으면 밋밋하다 */}
      <View style={styles.blobWarm} />
      <View style={styles.blobLime} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>PEED</Text>
          <View style={styles.brandDot} />
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          style={styles.pager}
        >
          {SLIDES.map((s) => (
            <View key={s.title} style={styles.slide}>
              <View style={styles.tagPill}>
                <Text style={styles.tagText}>{s.tag}</Text>
              </View>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <TouchableOpacity
              key={s.title}
              hitSlop={8}
              onPress={() => {
                setPage(i);
                scroller.current?.scrollTo({ x: i * width, animated: true });
              }}
            >
              <View style={[styles.dot, page === i && styles.dotOn]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* 바닥 시트 — 로그인은 처음부터 여기 있다 */}
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: fade,
              transform: [
                { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
              ],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.btn, styles.kakao]}
            onPress={() => socialLogin('kakao')}
          >
            <Text style={[styles.btnText, { color: KAKAO_TEXT }]}>카카오로 시작하기</Text>
          </TouchableOpacity>

          <View style={styles.btnRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.btn, styles.naver, styles.btnHalf]}
              onPress={() => socialLogin('naver')}
            >
              <Text style={[styles.btnText, { color: colors.white }]}>네이버</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.btn, styles.google, styles.btnHalf]}
              onPress={() => socialLogin('google')}
            >
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>Google</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.howBtn}
            onPress={() => setHowOpen(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={17} color={colors.primary} />
            <Text style={styles.howText}>PEED, 어떻게 쓰나요?</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.terms}>
            시작하면 서비스 이용약관 및 개인정보처리방침에 동의하게 됩니다.
          </Text>
        </Animated.View>
      </SafeAreaView>

      <HowToSheet visible={howOpen} onClose={() => setHowOpen(false)} />
    </View>
  );
}

/* ----------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#5B4DF5' },
  safe: { flex: 1, width, alignSelf: 'center' },

  // 그라디언트 위에 얹는 색 덩어리 — 화면에 깊이와 색감을 준다.
  blobWarm: {
    position: 'absolute',
    top: -height * 0.12,
    right: -width * 0.35,
    width: width * 0.95,
    height: width * 0.95,
    borderRadius: width,
    backgroundColor: 'rgba(255,138,61,0.30)',
  },
  blobLime: {
    position: 'absolute',
    bottom: height * 0.24,
    left: -width * 0.4,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width,
    backgroundColor: 'rgba(198,244,50,0.16)',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
  },
  brand: {
    color: colors.white,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.lime,
    marginBottom: 6,
  },

  pager: { flexGrow: 0 },
  slide: {
    width,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['3xl'],
    justifyContent: 'flex-start',
  },
  tagPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    marginBottom: spacing.xl,
  },
  tagText: {
    color: colors.white,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    color: colors.white,
    fontSize: 44,
    lineHeight: 53,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: spacing.lg,
  },
  body: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 16.5,
    lineHeight: 27,
    fontWeight: '500',
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: spacing.xl,
    marginTop: 'auto',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotOn: { width: 22, backgroundColor: colors.lime },

  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    ...shadow.lifted,
  },
  btn: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnHalf: { flex: 1 },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btnText: { fontSize: 16, fontWeight: '800' },
  kakao: { backgroundColor: KAKAO_YELLOW },
  naver: { backgroundColor: '#03C75A' },
  google: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
  },

  howBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  howText: { color: colors.primary, fontSize: 14, fontWeight: '800' },

  terms: {
    color: colors.textTertiary,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
  },

  /* ---- 이용 방법 시트 ---- */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    width,
    alignSelf: 'center',
    maxHeight: height * 0.86,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingTop: spacing.sm,
  },
  sheetGrip: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  sheetTitle: { fontSize: 21, fontWeight: '900', color: colors.textPrimary },
  sheetSub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 3,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: { maxHeight: height * 0.66 },
  sheetContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['3xl'],
  },

  stepRow: { flexDirection: 'row', gap: spacing.md },
  stepRail: { alignItems: 'center', width: 40 },
  stepDot: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.line,
    marginVertical: 4,
    borderRadius: 2,
  },
  stepBody: { flex: 1, paddingBottom: spacing.xl },
  stepNo: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  stepText: { fontSize: 13.5, lineHeight: 21, color: colors.textSecondary },

  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
  noteWarn: { backgroundColor: colors.coralSoft, borderColor: '#FFD9DD' },
  noteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 5,
  },
  noteText: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
});
