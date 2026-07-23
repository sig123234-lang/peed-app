import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

// PB(PeedBack) 잔액 — 서버(user.pb)가 권위. 로컬(AsyncStorage)은 즉시 표시용 캐시일
// 뿐이고, 로그인 시/행동 후 서버 값으로 덮어써 정합을 맞춘다.
const PB_STORAGE_KEY = 'CURRENT_PB';

type PbContextValue = {
  /** Current PB balance. */
  pb: number;
  /** True once the persisted balance has finished loading. */
  ready: boolean;
  /** 낙관적 표시용 로컬 가산(서버가 이미 적립했으면 refreshPb로 정합). */
  earn: (amount: number) => void;
  /** 낙관적 표시용 로컬 차감. 실제 차감은 서버에서. 부족하면 false. */
  spend: (amount: number) => boolean;
  /** 서버 권위 잔액을 즉시 반영(응모/적립 응답 등). */
  setBalance: (n: number) => void;
  /** 서버(/api/auth?action=me)에서 잔액을 다시 읽어 정합. */
  refreshPb: () => void;
};

const PbContext = createContext<PbContextValue | undefined>(undefined);

export function PbProvider({ children }: { children: React.ReactNode }) {
  const [pb, setPb] = useState(0);
  const [ready, setReady] = useState(false);
  // Mirror of `pb` so earn/spend read the latest value synchronously without
  // depending on a possibly-stale state closure.
  const pbRef = useRef(0);

  const setBalance = useCallback((next: number) => {
    const safe = Math.max(0, Math.round(next));
    pbRef.current = safe;
    setPb(safe);
    AsyncStorage.setItem(PB_STORAGE_KEY, String(safe)).catch((e) =>
      console.log('PB 저장 실패', e)
    );
  }, []);

  // 서버 권위 잔액을 읽어와 정합(로그인/행동 후).
  const refreshPb = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const r = await fetch('/api/auth?action=me', { credentials: 'include' });
      const d = await r.json();
      if (d?.user && typeof d.user.pb === 'number') setBalance(d.user.pb);
    } catch {
      // ignore
    }
  }, [setBalance]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(PB_STORAGE_KEY);
        if (saved !== null) {
          const value = Number(saved) || 0;
          pbRef.current = value;
          setPb(value);
        }
      } catch {
        // ignore
      } finally {
        setReady(true);
      }
      refreshPb(); // 서버 권위 잔액으로 덮어쓰기
    })();
  }, [refreshPb]);

  const earn = useCallback(
    (amount: number) => {
      if (!amount || amount <= 0) return;
      setBalance(pbRef.current + amount);
    },
    [setBalance]
  );

  const spend = useCallback(
    (amount: number) => {
      if (!amount || amount <= 0) return true;
      if (pbRef.current < amount) return false;
      setBalance(pbRef.current - amount);
      return true;
    },
    [setBalance]
  );

  return (
    <PbContext.Provider value={{ pb, ready, earn, spend, setBalance, refreshPb }}>
      {children}
    </PbContext.Provider>
  );
}

export function usePb() {
  const ctx = useContext(PbContext);
  if (!ctx) {
    throw new Error('usePb는 PbProvider 안에서만 사용할 수 있어요.');
  }
  return ctx;
}
