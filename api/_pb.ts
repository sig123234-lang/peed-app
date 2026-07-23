import { getJSON, putJSON } from './_store';

// PB 원장(ledger). 모든 PB 증감은 이 함수를 통해 이벤트로 기록되고 회원 잔액에 반영된다.
//   issue   발행 (리뷰 적립·프로모션·보상)      +
//   spend   사용 (경품 응모·차감)               -
//   reclaim 회수 (허위리뷰·부정 적립 환수)      -
//   adjust  수동 보정 (+/- 부호는 amount 그대로)  ±
export type PbType = 'issue' | 'spend' | 'reclaim' | 'adjust';

export type PbEvent = {
  id: string;
  memberId: string;
  memberName: string;
  type: PbType;
  amount: number; // 절대값
  signed: number; // 잔액에 반영되는 부호값
  reason: string;
  storeId: string;
  ref: string;
  balanceAfter: number;
  date: string;
  createdAt: number;
};

function signedAmount(type: PbType, amount: number): number {
  const a = Number(amount) || 0;
  if (type === 'spend' || type === 'reclaim') return -Math.abs(a);
  if (type === 'adjust') return a; // 부호 그대로
  return Math.abs(a); // issue
}

export async function recordPbEvent(ev: {
  memberId: string;
  memberName?: string;
  type: PbType;
  amount: number;
  reason?: string;
  storeId?: string;
  ref?: string;
}): Promise<PbEvent> {
  const [events, members] = await Promise.all([
    getJSON<any[]>('v2/pb_events.json', []),
    getJSON<any[]>('v2/members.json', []),
  ]);
  const m = members.find((x) => x.id === ev.memberId);
  const signed = signedAmount(ev.type, ev.amount);
  const before = m ? Number(m.pb) || 0 : 0;
  const balanceAfter = Math.max(0, before + signed);
  const record: PbEvent = {
    id: `pb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    memberId: ev.memberId,
    memberName: ev.memberName || m?.name || '',
    type: ev.type,
    amount: Math.abs(Number(ev.amount) || 0),
    signed,
    reason: ev.reason || '',
    storeId: ev.storeId || '',
    ref: ev.ref || '',
    balanceAfter,
    date: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  };
  await putJSON('v2/pb_events.json', [record, ...events]);
  if (m) {
    m.pb = balanceAfter;
    await putJSON('v2/members.json', members);
  }
  return record;
}
