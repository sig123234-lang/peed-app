import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import { useShell } from '@/context/shell';

// 앱 시작 시 서버 세션(/api/auth?action=me)을 확인해서, 로그인돼 있으면 자동으로
// 로그인 상태로 만들고 서버 프로필(이름/아이디/사진)을 로컬에 브릿지한다.
// (기존 화면들이 로컬 프로필 값을 읽으므로, 서버 값을 그 키에 심어주면 그대로 반영)
export function SessionSync() {
  const { setAuthed } = useShell();
  const { setProfileAvatar } = useFeed();
  const { earn } = usePb();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let done = false;
    (async () => {
      const params = new URLSearchParams(window.location.search || '');
      const login = params.get('login');
      try {
        const r = await fetch('/api/auth?action=me', { credentials: 'include' });
        const d = await r.json();
        if (!done && d?.user) {
          const u = d.user;
          setAuthed(true);
          try {
            if (u.name) await AsyncStorage.setItem('PROFILE_NAME', u.name);
            if (u.handle) await AsyncStorage.setItem('PROFILE_HANDLE', u.handle);
          } catch {
            // ignore
          }
          if (u.avatar) setProfileAvatar(u.avatar);
        }
      } catch {
        // ignore
      }

      // URL 의 ?login 파라미터 정리 + 실패 안내.
      if (login) {
        if (['error', 'token', 'profile', 'nostore'].includes(login) && window.alert) {
          window.alert('로그인에 실패했어요. 다시 시도해 주세요.');
        }
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('login');
          window.history.replaceState({}, '', url.toString());
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      done = true;
    };
  }, [setAuthed, setProfileAvatar, earn]);

  return null;
}
