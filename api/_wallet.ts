import { getJSON, putJSON } from './_store';
import { getUserById, updateUser } from './_users';

// 소비자 PB 지갑 — 잔액은 users.json 의 user.pb 가 권위(authoritative). 모든
// 적립/차감은 서버에서만 일어나고 원장(v2/pb_ledger.json)에 기록된다.
export type PbEvent = {
  id: string;
  uid: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  ts: number;
};
const LEDGER = 'v2/pb_ledger.json';

export async function getBalance(uid: string): Promise<number> {
  const u = await getUserById(uid);
  return u ? Number(u.pb) || 0 : 0;
}

async function record(uid: string, delta: number, reason: string, balanceAfter: number): Promise<void> {
  const l = await getJSON<PbEvent[]>(LEDGER, []);
  l.unshift({
    id: `pbe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    uid,
    delta,
    reason,
    balanceAfter,
    ts: Date.now(),
  });
  await putJSON(LEDGER, l.slice(0, 20000));
}

export async function credit(uid: string, amount: number, reason: string): Promise<number> {
  const amt = Math.max(0, Math.round(amount));
  const u = await getUserById(uid);
  if (!u) return 0;
  if (amt === 0) return Number(u.pb) || 0;
  const next = (Number(u.pb) || 0) + amt;
  await updateUser(uid, { pb: next });
  await record(uid, amt, reason, next);
  return next;
}

export async function debit(
  uid: string,
  amount: number,
  reason: string
): Promise<{ ok: boolean; balance: number }> {
  const amt = Math.max(0, Math.round(amount));
  const u = await getUserById(uid);
  if (!u) return { ok: false, balance: 0 };
  const cur = Number(u.pb) || 0;
  if (cur < amt) return { ok: false, balance: cur };
  const next = cur - amt;
  await updateUser(uid, { pb: next });
  await record(uid, -amt, reason, next);
  return { ok: true, balance: next };
}

export async function ledgerFor(uid: string, limit = 50): Promise<PbEvent[]> {
  const l = await getJSON<PbEvent[]>(LEDGER, []);
  return l.filter((e) => e.uid === uid).slice(0, limit);
}
