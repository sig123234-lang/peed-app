import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import Home from './home';

const { height } = Dimensions.get('window');

const BRAND_BLUE = '#4F6BFF';
const KAKAO_YELLOW = '#FEE500';
const KAKAO_TEXT = '#191919';

const slides = [
  {
    id: 0,
    title: '어차피\n쓸 거잖아',
    description: '놀고, 먹고, 즐기고, 마시고\n이미 쓴 돈이라면 남겨봐.',
  },
  {
    id: 1,
    title: '리뷰 하나면\n충분해',
    description: '복잡한 인증 없이\n경험한 그대로 남겨봐.',
  },
  {
    id: 2,
    title: '이런 것까지\n경품으로?',
    description: '리뷰가 쌓이고 쌓이면\n상상 그 이상의 기회가 열려.',
  },
];

export default function IndexScreen() {
  const pagerRef = useRef<PagerView>(null);
  const [page, setPage] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleNext = () => {
    if (page < slides.length - 1) {
      pagerRef.current?.setPage(page + 1);
    } else {
      setShowLogin(true);
    }
  };

  if (isLoggedIn) {
    return <Home />;
  }

  if (showLogin) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        <View style={styles.loginWrap}>
          <View>
            <Text style={styles.loginBrand}>PEED</Text>
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
              style={styles.kakaoButton}
              onPress={() => setIsLoggedIn(true)}
            >
              <Text style={styles.kakaoButtonText}>
                카카오톡으로 계속하기
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.appleButton}
              onPress={() => setIsLoggedIn(true)}
            >
              <Text style={styles.appleButtonText}>
                Apple로 계속하기
              </Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>
              로그인하면 서비스 이용약관 및 개인정보처리방침에{'\n'}
              동의하게 됩니다.
            </Text>

            <TouchableOpacity onPress={() => setShowLogin(false)}>
              <Text style={styles.backText}>온보딩 다시 보기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      <View style={styles.topRow}>
        <Text style={styles.brand}>PEED</Text>
      </View>

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        scrollEnabled
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {slides.map((slide) => (
          <View key={slide.id.toString()} style={styles.page}>
            <View style={styles.heroCard}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  PLAY · EAT · ENTERTAIN · DRINK
                </Text>
              </View>

              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          </View>
        ))}
      </PagerView>

      <View style={styles.bottomArea}>
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <View
              key={index}
              style={[styles.dot, page === index && styles.activeDot]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
          <Text style={styles.primaryButtonText}>
            {page < slides.length - 1 ? '다음' : 'PEED 시작하기'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },

  brand: {
    color: BRAND_BLUE,
    fontSize: 22,
    fontWeight: '800',
  },

  pager: {
    flex: 1,
  },

  page: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    minHeight: height * 0.68,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 22,
  },

  badgeText: {
    color: BRAND_BLUE,
    fontSize: 11,
    fontWeight: '700',
  },

  title: {
    color: '#111111',
    fontSize: 38,
    fontWeight: '800',
    lineHeight: 46,
    marginBottom: 14,
  },

  description: {
    color: '#666666',
    fontSize: 17,
    lineHeight: 27,
  },

  bottomArea: {
    paddingHorizontal: 20,
    paddingBottom: 26,
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 4,
  },

  activeDot: {
    width: 24,
    backgroundColor: BRAND_BLUE,
  },

  primaryButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  loginWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'space-between',
  },

  loginBrand: {
    color: BRAND_BLUE,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 32,
  },

  loginTitle: {
    color: '#111111',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 44,
    marginBottom: 16,
  },

  loginDesc: {
    color: '#666666',
    fontSize: 16,
    lineHeight: 26,
  },

  loginBottom: {
    gap: 12,
  },

  kakaoButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: KAKAO_YELLOW,
    justifyContent: 'center',
    alignItems: 'center',
  },

  kakaoButtonText: {
    color: KAKAO_TEXT,
    fontSize: 17,
    fontWeight: '800',
  },

  appleButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
  },

  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },

  termsText: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },

  backText: {
    color: BRAND_BLUE,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
