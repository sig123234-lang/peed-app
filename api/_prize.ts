import { notify } from './_notifs';
import { getJSON, putJSON } from './_store';

/* 경품 수령 — 당첨 이후를 담당한다(추첨은 _draw.ts).

   지금 경품은 전부 '상품권(일련번호)' 다. 일련번호는 사실상 현금이라,
   먼저 본 사람이 써버릴 수 있다. 그래서 번호는 목록 응답에 절대 싣지 않고,
   본인이 '수령하기' 를 누른 순간에만 한 번 내려준다(그 시각을 기록해 둔다).

   수령 기한은 수령 가능해진 날부터 30일이다. 기한을 두지 않으면 미수령 건이
   영원히 장부에 남아 재고·정산을 닫을 수 없다. */

const SHIPMENTS = 'v2/shipments.json';

export const CLAIM_DAYS = 30;
const DAY = 24 * 3600 * 1000;

/** 만료 임박 알림을 보낼 시점(남은 일수). 작은 것부터 둔다 — 판정이 이 순서에 기댄다. */
const WARN_DAYS = [1, 7];

export type ClaimState = 'pending' | 'ready' | 'claimed' | 'expired';

/** 일련번호가 등록됐는가 = 당첨자가 받아갈 수 있는가. */
function hasSerial(s: any): boolean {
  return !!String(s?.serial || '').trim();
}

/* 상태 문구는 수령 방식마다 다르다(어드민 STATUS_BY_METHOD 가 원본).
   상품권은 준비→발급완료→완료, 택배는 준비→발송→완료 식이다.
   여기서 '발송' 을 일괄로 쓰면 상품권 건에 그 방식엔 없는 상태가 박혀,
   어드민 편집창의 상태 칩이 아무것도 안 눌린 것처럼 보인다. */
function readyStatus(method: string): string {
  if (method.includes('상품권')) return '발급완료';
  if (method.includes('택배')) return '발송';
  if (method.includes('방문')) return '준비'; // 방문 수령엔 중간 상태가 없다
  return '처리중';
}

/**
 * 만료 시각 — readyAt(수령 가능해진 시각) + 30일.
 *
 * 당첨일이 아니라 '받아갈 수 있게 된 날' 부터 센다. 관리자가 일련번호를
 * 늦게 넣었다고 당첨자가 손해를 보면 안 된다.
 */
export function expiresAt(s: any): number | null {
  const ready = Number(s?.readyAt) || 0;
  return ready ? ready + CLAIM_DAYS * DAY : null;
}

export function claimState(s: any, now = Date.now()): ClaimState {
  if (!s) return 'pending';
  if (s.claimedAt) return 'claimed';
  if (s.status === '만료') return 'expired';
  if (!hasSerial(s)) return 'pending';
  const exp = expiresAt(s);
  if (exp && now > exp) return 'expired';
  return 'ready';
}

export type ClaimResult =
  | { ok: true; serial: string; claimedAt: number }
  | { ok: false; error: string };

/**
 * 당첨자가 일련번호를 받아간다. 성공하면 그 시각을 남긴다.
 *
 * 이미 받은 건이면 같은 번호를 그대로 돌려준다 — 새로고침하거나 기기를
 * 바꿨다고 번호를 못 보게 되면 그게 더 큰 사고다.
 */
export async function claimPrize(uid: string, productId: string): Promise<ClaimResult> {
  if (!uid) return { ok: false, error: 'not_logged_in' };
  const pid = String(productId || '').trim();
  if (!pid) return { ok: false, error: 'no_product' };

  const list = await getJSON<any[]>(SHIPMENTS, []);
  const i = list.findIndex((s) => s && String(s.winnerId || '') === uid && s.productId === pid);
  if (i < 0) return { ok: false, error: 'not_a_winner' };

  const s = list[i];
  const state = claimState(s);
  if (state === 'claimed') {
    return { ok: true, serial: String(s.serial || ''), claimedAt: Number(s.claimedAt) || 0 };
  }
  if (state === 'expired') return { ok: false, error: 'expired' };
  if (state === 'pending') return { ok: false, error: 'not_ready' };

  const now = Date.now();
  s.claimedAt = now;
  // 방문 수령만 완료 상태 이름이 다르다(어드민 STATUS_BY_METHOD).
  s.status = String(s.method || '').includes('방문') ? '수령완료' : '완료';
  list[i] = s;
  await putJSON(SHIPMENTS, list);
  return { ok: true, serial: String(s.serial || ''), claimedAt: now };
}

export type UpkeepResult = { readied: number; expired: number; warned: number };

/**
 * 주기적으로 도는 뒷정리 — 수령 가능 전환, 만료 임박 알림, 기한 만료.
 *
 * 관리자는 일반 CRUD 화면에서 일련번호를 넣기 때문에(api/admin/data.ts),
 * '언제 넣었는지' 를 잡아둘 훅이 없다. 그래서 여기서 처음 발견한 시점을
 * readyAt 으로 삼는다. 10분마다 도니 오차는 최대 10분이다.
 */
export async function runPrizeUpkeep(): Promise<UpkeepResult> {
  const list = await getJSON<any[]>(SHIPMENTS, []);
  if (!list.length) return { readied: 0, expired: 0, warned: 0 };

  const now = Date.now();
  const out: UpkeepResult = { readied: 0, expired: 0, warned: 0 };
  const pending: { uid: string; title: string; body: string }[] = [];
  let dirty = false;

  for (const s of list) {
    if (!s || s.claimedAt || s.status === '만료') continue;
    const uid = String(s.winnerId || '');
    const name = String(s.product || '경품');

    // ① 일련번호가 들어왔다 → 수령 가능. 여기서부터 기한을 센다.
    if (hasSerial(s) && !s.readyAt) {
      s.readyAt = now;
      if (s.status === '준비') s.status = readyStatus(String(s.method || ''));
      dirty = true;
      out.readied++;
      pending.push({
        uid,
        title: '🎁 경품을 받아가세요',
        body: `'${name}' 수령 준비가 끝났어요. 마이 > 당첨 탭에서 ${CLAIM_DAYS}일 안에 받아주세요.`,
      });
      continue;
    }

    const exp = expiresAt(s);
    if (!exp) continue;

    // ② 기한 만료
    if (now > exp) {
      s.status = '만료';
      dirty = true;
      out.expired++;
      pending.push({
        uid,
        title: '경품 수령 기한이 지났어요',
        body: `'${name}' 의 수령 기한 ${CLAIM_DAYS}일이 지나 소멸됐어요.`,
      });
      continue;
    }

    // ③ 만료 임박 — D-7, D-1 각각 한 번씩만.
    const left = Math.ceil((exp - now) / DAY);
    const warned = new Set<number>(Array.isArray(s.warned) ? s.warned.map(Number) : []);
    let hit: number | null = null;
    for (const d of WARN_DAYS) {
      if (left <= d && !warned.has(d)) {
        hit = d;
        break;
      }
    }
    if (hit !== null) {
      // D-1 을 보낸 뒤 D-7 알림이 뒤늦게 나가지 않도록 큰 임계값도 함께 소진한다.
      for (const d of WARN_DAYS) if (d >= hit) warned.add(d);
      s.warned = [...warned];
      dirty = true;
      out.warned++;
      pending.push({
        uid,
        title: `⏰ 경품 수령 ${hit}일 남았어요`,
        body: `'${name}' 을 아직 안 받으셨어요. 기한이 지나면 소멸돼요.`,
      });
    }
  }

  if (dirty) await putJSON(SHIPMENTS, list);
  // 저장이 끝난 뒤에 알린다(저장 실패 시 헛알림 방지) — _draw.ts 와 같은 순서.
  for (const n of pending) {
    if (n.uid) await notify(n.uid, { type: 'raffle', title: n.title, body: n.body });
  }
  return out;
}
