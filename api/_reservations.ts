import { getJSON, putJSON } from './_store';

// 예약 — 서버 저장. 유저가 매장 예약을 남기면 계정에 귀속(기기 무관 유지).
export type Reservation = {
  id: string;
  uid: string;
  storeId: string;
  storeName: string;
  storeImage?: string;
  location?: string;
  date: string; // YYYY-MM-DD 또는 라벨
  time: string;
  people: number;
  status: '예약' | '방문완료' | '취소';
  createdAt: number;
};
const KEY = 'v2/reservations.json';

export async function allReservations(): Promise<Reservation[]> {
  const r = await getJSON<Reservation[]>(KEY, []);
  return Array.isArray(r) ? r : [];
}

export async function addReservation(
  input: Omit<Reservation, 'id' | 'status' | 'createdAt'>
): Promise<Reservation> {
  const list = await allReservations();
  const rec: Reservation = {
    ...input,
    id: `rsv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    status: '예약',
    createdAt: Date.now(),
  };
  list.unshift(rec);
  await putJSON(KEY, list.slice(0, 50000));
  return rec;
}

export async function myReservations(uid: string): Promise<Reservation[]> {
  const list = await allReservations();
  return list.filter((r) => r.uid === uid);
}

export async function setStatus(
  id: string,
  uid: string,
  status: Reservation['status']
): Promise<boolean> {
  const list = await allReservations();
  const idx = list.findIndex((r) => r.id === id && r.uid === uid);
  if (idx < 0) return false;
  list[idx].status = status;
  await putJSON(KEY, list);
  return true;
}
