import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { useShell } from '@/context/shell';
import { ReservableStore } from '@/data/stores';

// 예약 — 서버 저장(계정 귀속). 예전의 로컬 PB 보증금 방식은 서버 PB와 충돌해 제거.
export type ResStatus = 'confirmed' | 'visited' | 'cancelled';

export type Reservation = {
  id: string;
  storeId: string;
  storeName: string;
  storeImage: any;
  location: string;
  dateLabel: string;
  time: string;
  party: number;
  status: ResStatus;
  heldPb: number; // 하위호환(항상 0)
};

type BookInput = {
  store: ReservableStore;
  dateLabel: string;
  time: string;
  party: number;
};

type ReservationsValue = {
  reservations: Reservation[];
  pendingStore: ReservableStore | null;
  openReserve: (store: ReservableStore) => void;
  closeReserve: () => void;
  book: (input: BookInput) => { heldPb: number };
  cancel: (id: string) => void;
  markVisited: (id: string) => void;
};

const ReservationsContext = createContext<ReservationsValue | undefined>(undefined);

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';
const STATUS_TO_CLIENT: Record<string, ResStatus> = {
  예약: 'confirmed',
  방문완료: 'visited',
  취소: 'cancelled',
};

function toClient(r: any): Reservation {
  return {
    id: r.id,
    storeId: r.storeId || '',
    storeName: r.storeName || '',
    storeImage: r.storeImage ? { uri: r.storeImage } : undefined,
    location: r.location || '',
    dateLabel: r.date || '',
    time: r.time || '',
    party: Number(r.people) || 1,
    status: STATUS_TO_CLIENT[r.status] || 'confirmed',
    heldPb: 0,
  };
}

export function ReservationsProvider({ children }: { children: React.ReactNode }) {
  const { openOverlay, dropOverlay } = useShell();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [pendingStore, setPendingStore] = useState<ReservableStore | null>(null);
  const ref = useRef<Reservation[]>([]);

  const commit = useCallback((next: Reservation[]) => {
    ref.current = next;
    setReservations(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!isWeb()) return;
    try {
      const r = await fetch('/api/public?action=myReservations', { credentials: 'include' });
      const d = await r.json();
      if (Array.isArray(d?.reservations)) commit(d.reservations.map(toClient));
    } catch {
      // ignore
    }
  }, [commit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const closeReserveOverlay = useCallback(() => setPendingStore(null), []);

  const openReserve = useCallback(
    (store: ReservableStore) => {
      setPendingStore(store);
      openOverlay(closeReserveOverlay);
    },
    [openOverlay, closeReserveOverlay]
  );
  const closeReserve = useCallback(() => {
    setPendingStore(null);
    dropOverlay(closeReserveOverlay);
  }, [dropOverlay, closeReserveOverlay]);

  const book = useCallback(
    (input: BookInput) => {
      // 낙관적 추가 → 서버 저장 후 정합.
      const optimistic: Reservation = {
        id: `tmp_${Date.now().toString(36)}`,
        storeId: input.store.id,
        storeName: input.store.name,
        storeImage: input.store.image,
        location: input.store.location,
        dateLabel: input.dateLabel,
        time: input.time,
        party: input.party,
        status: 'confirmed',
        heldPb: 0,
      };
      commit([optimistic, ...ref.current]);
      setPendingStore(null);
      dropOverlay(closeReserveOverlay);
      if (isWeb()) {
        const img =
          typeof input.store.image === 'object' && input.store.image?.uri
            ? input.store.image.uri
            : typeof input.store.image === 'string'
              ? input.store.image
              : '';
        fetch('/api/public?action=reserve', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: input.store.id,
            storeName: input.store.name,
            storeImage: img,
            location: input.store.location,
            date: input.dateLabel,
            time: input.time,
            people: input.party,
          }),
        })
          .then(() => refresh())
          .catch(() => {});
      }
      return { heldPb: 0 };
    },
    [commit, dropOverlay, closeReserveOverlay, refresh]
  );

  const cancel = useCallback(
    (id: string) => {
      commit(ref.current.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)));
      if (isWeb()) {
        fetch('/api/public?action=cancelReservation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => {});
      }
    },
    [commit]
  );

  const markVisited = useCallback(
    (id: string) => {
      commit(ref.current.map((x) => (x.id === id ? { ...x, status: 'visited' } : x)));
      if (isWeb()) {
        fetch('/api/public?action=visitReservation', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        }).catch(() => {});
      }
    },
    [commit]
  );

  const value = useMemo(
    () => ({
      reservations,
      pendingStore,
      openReserve,
      closeReserve,
      book,
      cancel,
      markVisited,
    }),
    [reservations, pendingStore, openReserve, closeReserve, book, cancel, markVisited]
  );

  return (
    <ReservationsContext.Provider value={value}>{children}</ReservationsContext.Provider>
  );
}

export function useReservations() {
  const ctx = useContext(ReservationsContext);
  if (!ctx) {
    throw new Error('useReservations는 ReservationsProvider 안에서만 사용할 수 있어요.');
  }
  return ctx;
}
