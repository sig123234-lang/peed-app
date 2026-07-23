import { recordPbEvent } from './_pb';
import { getJSON } from './_store';
import { getUserById } from './_users';

// 소비자 PB 지갑 — 잔액은 users.json 의 user.pb 가 권위(authoritative)다.
// 원장은 어드민 PB 원장과 같은 v2/pb_events.json 한 곳에만 쌓인다.
// (예전에는 앱이 v2/pb_ledger.json 에, 어드민이 v2/pb_events.json 에 따로
//  기록해서 같은 회원의 PB 내역이 두 장부로 갈라져 있었다.)
export type PbEvent = {
  id: string;
  uid: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  ts: number;
};

const LEDGER = 'v2/pb_events.json';

export async function getBalance(uid: string): Promise<number> {
  const u = await getUserById(uid);
  return u ? Number(u.pb) || 0 : 0;
}

// 잔액 반영과 원장 기록은 recordPbEvent 안에서 함께 일어난다. 여기서 따로
// updateUser 를 부르면 증감이 두 번 적용되므로 절대 추가하지 않는다.
export async function credit(uid: string, amount: number, reason: string): Promise<number> {
  const amt = Math.max(0, Math.round(amount));
  const u = await getUserById(uid);
  if (!u) return 0;
  if (amt === 0) return Number(u.pb) || 0;
  const ev = await recordPbEvent({
    memberId: uid,
    memberName: u.name,
    type: 'issue',
    amount: amt,
    reason,
  });
  return ev.balanceAfter;
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
  if (amt === 0) return { ok: true, balance: cur };
  const ev = await recordPbEvent({
    memberId: uid,
    memberName: u.name,
    type: 'spend',
    amount: amt,
    reason,
  });
  return { ok: true, balance: ev.balanceAfter };
}

// 앱 화면(설정 → PB 내역)이 기대하는 형태로 변환해서 돌려준다.
export async function ledgerFor(uid: string, limit = 50): Promise<PbEvent[]> {
  const l = await getJSON<any[]>(LEDGER, []);
  return l
    .filter((e) => e?.memberId === uid)
    .slice(0, limit)
    .map((e) => ({
      id: String(e.id),
      uid: String(e.memberId),
      delta: Number(e.signed) || 0,
      reason: String(e.reason || ''),
      balanceAfter: Number(e.balanceAfter) || 0,
      ts: Number(e.createdAt) || 0,
    }));
}
