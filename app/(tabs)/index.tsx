import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/kit';
import { useShell } from '@/context/shell';
import { APP_WIDTH, colors, gradients, radius, spacing } from '@/theme';
import Home from './home';

const { height } = Dimensions.get('window');
const width = APP_WIDTH;

const KAKAO_YELLOW = '#FEE500';
const KAKAO_TEXT = '#191919';

const slides = [
  {
    id: 0,
    emoji: '🍻',
    title: '어차피\n쓸 거잖아',
    description: '놀고, 먹고, 즐기고, 마시고\n이미 쓴 돈이라면 남겨봐.',
  },
  {
    id: 1,
    emoji: '✍️',
    title: '리뷰 하나면\n충분해',
    description: '복잡한 인증 없이\n경험한 그대로 남겨봐.',
  },
  {
    id: 2,
    emoji: '🎁',
    title: '이런 것까지\n경품으로?',
    description: '리뷰가 쌓이고 쌓이면\n상상 그 이상의 기회가 열려.',
  },
];

export default function IndexScreen() {
  const { authed, setAuthed } = useShell();
  const [page, setPage] = useState(0);
  const [showLogin, setShowLogin] = useState(false);

  // 실제 소셜 로그인 — /api/auth 로 풀페이지 리다이렉트(웹).
  const socialLogin = (provider: 'kakao' | 'naver' | 'google') => {
    if (typeof window === 'undefined') {
      setAuthed(true);
      return;
    }
    window.location.href = `/api/auth?action=login&provider=${provider}`;
  };

  const handleNext = () => {
    if (page < slides.length - 1) {
      setPage((prev) => prev + 1);
    } else {
      setShowLogin(true);
    }
  };

  const handlePrev = () => {
    if (page > 0) {
      setPage((prev) => prev - 1);
    }
  };

  if (authed) {
    return <Home />;
  }

  if (showLogin) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" translucent={false} backgroundColor="#FFFFFF" />

        <View style={styles.loginWrap}>
          <View>
            <View style={styles.loginBrandRow}>
              <Text style={styles.loginBrand}>PEED</Text>
            </View>
            <Text style={styles.loginTitle}>
              놀고, 먹고, 즐기고, 마시고{'\n'}
              PEEDBACK 남겨봐.
            </Text>
            <Text style={styles.loginDesc}>
              리뷰만 남기면 시작돼.{'\n'}
              상상 그 이상의 경품이 기다리고 있어.
            </Text>
          </View>

          <View style={styles.loginBottom}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.kakaoButton}
              onPress={() => socialLogin('kakao')}
            >
              <Text style={styles.kakaoButtonText}>카카오로 시작하기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.naverButton}
              onPress={() => socialLogin('naver')}
            >
              <Text style={styles.naverButtonText}>네이버로 시작하기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.googleButton}
              onPress={() => socialLogin('google')}
            >
              <Text style={styles.googleButtonText}>Google로 시작하기</Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>
              로그인하면 서비스 이용약관 및 개인정보처리방침에{'\n'}
              동의하게 됩니다.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const currentSlide = slides[page];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" translucent={false} backgroundColor="#FFFFFF" />

      <View style={styles.topRow}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>PEED</Text>
        </View>
        <TouchableOpacity onPress={() => setShowLogin(true)}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.page}>
          <LinearGradient
            colors={gradients.dusk}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>
                PLAY · EAT · ENTERTAIN · DRINK
              </Text>
            </View>

            <Text style={styles.heroEmoji}>{currentSlide.emoji}</Text>
            <Text style={styles.title}>{currentSlide.title}</Text>
            <Text style={styles.description}>{currentSlide.description}</Text>
          </LinearGradient>
        </View>
      </ScrollView>

      <View style={styles.bottomArea}>
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, page === index && styles.activeDot]}
            />
          ))}
        </View>

        <View style={styles.buttonRow}>
          {page > 0 ? (
            <AppButton
              label="이전"
              variant="ghost"
              onPress={handlePrev}
              style={styles.prevButton}
            />
          ) : (
            <View style={styles.secondaryButtonPlaceholder} />
          )}

          <AppButton
            label={page < slides.length - 1 ? '다음' : 'PEED 시작하기'}
            variant="coral"
            onPress={handleNext}
            style={styles.nextButton}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  topRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },

  brand: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  brandDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.coral,
    marginBottom: 5,
  },

  skipText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontWeight: '700',
  },

  scrollContent: {
    flexGrow: 1,
  },

  page: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    minHeight: height * 0.72,
  },

  heroCard: {
    width: width - spacing.xl * 2,
    borderRadius: radius['2xl'],
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
    minHeight: height * 0.62,
    justifyContent: 'center',
    alignSelf: 'center',
  },

  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginBottom: spacing.xl,
  },

  heroBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  heroEmoji: {
    fontSize: 52,
    marginBottom: spacing.md,
  },

  title: {
    color: colors.white,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 48,
    marginBottom: spacing.lg,
  },

  description: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    lineHeight: 27,
    fontWeight: '500',
  },

  bottomArea: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['2xl'] + 2,
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.lineStrong,
    marginHorizontal: 4,
  },

  activeDot: {
    width: 24,
    backgroundColor: colors.coral,
  },

  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  prevButton: {
    flex: 1,
  },

  nextButton: {
    flex: 2,
  },

  secondaryButtonPlaceholder: {
    flex: 1,
  },

  /* ---- login ---- */

  loginWrap: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
    justifyContent: 'space-between',
  },

  loginBrandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginBottom: spacing['3xl'],
  },

  loginBrand: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  loginTitle: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 44,
    marginBottom: spacing.lg,
  },

  loginDesc: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '500',
  },

  loginBottom: {
    gap: spacing.md,
  },
  inviteWrap: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  inviteLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inviteInput: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  kakaoButton: {
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: KAKAO_YELLOW,
    justifyContent: 'center',
    alignItems: 'center',
  },

  kakaoButtonText: {
    color: KAKAO_TEXT,
    fontSize: 17,
    fontWeight: '800',
  },

  naverButton: {
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: '#03C75A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  naverButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
  },
  googleButton: {
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleButtonText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },

  appleButton: {
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },

  appleButtonText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
  },

  termsText: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },

  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
