import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { AdminApp } from '@/components/admin/AdminApp';
import { BiteComposer } from '@/components/feed/BiteComposer';
import { BiteViewer } from '@/components/feed/BiteViewer';
import { RightRail } from '@/components/nav/RightRail';
import { Sidebar } from '@/components/nav/Sidebar';
import { ReserveModal } from '@/components/reservation/ReserveModal';
import { UserSearch } from '@/components/search/UserSearch';
import { SessionSync } from '@/components/SessionSync';
import { InfoSheet } from '@/components/ui/InfoSheet';
import { FollowListScreen } from '@/components/user/FollowListScreen';
import { UserProfileScreen } from '@/components/user/UserProfileScreen';
import { CallBar } from '@/components/voice/CallBar';
import { PullToRefresh } from '@/components/web/PullToRefresh';
import { DmProvider } from '@/context/dm';
import { FeedProvider } from '@/context/feed';
import { PbProvider } from '@/context/pb';
import { ReservationsProvider } from '@/context/reservations';
import { ShellProvider, useShell } from '@/context/shell';
import { VoiceProvider } from '@/context/voice';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { APP_MAX_WIDTH, colors } from '@/theme';
import ReviewScreen from './(tabs)/review';

export const unstable_settings = {
  anchor: '(tabs)',
};

const stackEl = (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
  </Stack>
);

// Review renders as a blurred popup over whatever screen is behind it.
function ReviewHost() {
  const { showReview, setShowReview } = useShell();
  if (!showReview) return null;
  return <ReviewScreen onBack={() => setShowReview(false)} />;
}

function AppShell() {
  const { authed, hydrated } = useShell();
  const isDesktop = useIsDesktop();

  // Wait for persisted login state before deciding what to show — avoids a
  // flash of onboarding on refresh when already logged in.
  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingLogo}>PEED</Text>
      </View>
    );
  }

  // Native + mobile web: the phone app (keeps its own bottom nav).
  if (!isDesktop) {
    return stackEl;
  }

  // Web, pre-login: centered phone-width onboarding column.
  if (!authed) {
    return (
      <View style={styles.webRoot}>
        <View style={styles.onboardStage}>{stackEl}</View>
      </View>
    );
  }

  // Web, logged in: full-width desktop layout — nav pinned to the left edge,
  // widgets pinned to the right edge, feed centered between them (Facebook/
  // Instagram desktop style).
  return (
    <View style={styles.webRoot}>
      <View style={styles.stage}>
        <Sidebar />
        <View style={styles.centerCol}>{stackEl}</View>
        <RightRail />
      </View>
    </View>
  );
}

// The admin console lives on admin.peed.co.kr (or ?admin=1 for testing before
// DNS is switched). It's a standalone app — no consumer providers needed.
function isAdminHost(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const host = window.location.hostname || '';
    const params = new URLSearchParams(window.location.search || '');
    return host.startsWith('admin.') || params.get('admin') === '1';
  } catch {
    return false;
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  if (isAdminHost()) {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AdminApp />
        <StatusBar style="dark" />
      </ThemeProvider>
    );
  }

  return (
    <PbProvider>
      <FeedProvider>
        <DmProvider>
        <VoiceProvider>
        <ShellProvider>
          <ReservationsProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <AppShell />
              <ReserveModal />
              <ReviewHost />
              <BiteComposer />
              <BiteViewer />
              <InfoSheet />
              <UserSearch />
              <UserProfileScreen />
              <FollowListScreen />
              <CallBar />
              <SessionSync />
              <PullToRefresh />
              <StatusBar style="auto" />
            </ThemeProvider>
          </ReservationsProvider>
        </ShellProvider>
        </VoiceProvider>
        </DmProvider>
      </FeedProvider>
    </PbProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  loadingLogo: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  loadingDot: {
    color: '#FF6B6B',
  },
  webRoot: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
  },
  onboardStage: {
    flex: 1,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    backgroundColor: colors.bg,
    ...({ boxShadow: '0 0 40px rgba(20, 24, 60, 0.08)' } as object),
  },
  stage: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // Fills the whole middle between the edge-pinned sidebars. The screen inside
  // centers its own content, so the leftover space on either side is part of
  // the scroll surface → dragging on the "empty" area scrolls too.
  centerCol: {
    flex: 1,
  },
});
