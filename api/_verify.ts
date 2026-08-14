import { RECEIPT_MAX_AGE_DAYS, type ReceiptVerdict, type ShotMeta } from './_receipt';
import { getJSON, putJSON } from './_store';

// 리뷰 인증 — 자체 검열 시스템.
//
// 인증의 근거는 '영수증 사진 한 장'이다(판독은 _receipt.ts 가 한다). 이 파일이
// 하는 일은 셋이다.
//   · 판독 결과를 scanId 로 잠깐 보관한다 — /api/verify 가 넣고 /api/review 가 꺼낸다
//   · 같은 영수증·같은 사진이 다시 오는지 지문으로 대조한다
//   · 모인 신호에 위험 점수를 매긴다
//
// 예전에는 다른 플랫폼의 '리뷰 쓰기 완료' 캡처를 받았고, 그게 본인 리뷰라는 걸
// 증명하려고 일회용 인증 코드를 발급해 리뷰 맨 앞에 붙이게 했다. 리뷰를 PEED 안에서
// 쓰게 되면서 둘 다 없앴다 — 영수증은 승인번호+거래일시가 거래마다 유일해서,
// 코드가 하던 '재제출 차단' 을 재촬영·크롭에도 흔들리지 않는 방식으로 대신한다.
//
// 정책상 적립은 항상 해준다. 여기서 매기는 건 '위험 점수'뿐이고, 높은 건만
// 어드민 모더레이션 화면에 올라간다.

const SHOTS = 'v2/verify_shots.json';

export type ShotPrint = {
  byteHash: string;
  textHash: string;
  /** 영수증 고유키(사업자번호+승인번호 등). 재촬영·크롭에도 안 바뀌는 지문. */
  receiptKey: string;
  uid: string;
  store: string;
  ts: number;
};

/* ---------------------------------------------------------------- 글자 지문 */

/** 판독 글자의 지문 — 같은 사진을 다시 올리면(재압축·크롭) 같은 값이 나온다. */
export function textFingerprint(raw: string): string {
  const norm = String(raw || '')
    .replace(/[^0-9a-z가-힣]/gi, '')
    .toLowerCase();
  if (norm.length < 12) return '';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

/* ------------------------------------------------------------------ 지문함 */

async function readShots(): Promise<ShotPrint[]> {
  const list = await getJSON<ShotPrint[]>(SHOTS, []);
  return Array.isArray(list) ? list : [];
}

export type DupKind = 'receipt' | 'image' | 'text';

/**
 * 두 영수증 키가 같은 종이를 가리키는가.
 *
 * 완전히 같으면 당연히 같다. 문제는 다시 찍으면 판독이 한 글자쯤 어긋난다는 것이다.
 * 실측(2026-08-14)에서 같은 영수증의 승인번호가 `56207962` 와 `36207962` 로 읽혀
 * 재제출이 그대로 통과했다. 사업자등록번호는 체크섬이 있어 스스로 고쳐지지만
 * 승인번호에는 그런 장치가 없다.
 *
 * 그래서 승인번호는 한 글자 어긋남까지 같은 것으로 본다. 다만 **맨 끝자리는 예외**다 —
 * 같은 단말에서 이어서 결제하면 승인번호가 끝자리만 다르게 나온다. 그걸 봐주면 옆
 * 테이블 손님의 영수증까지 '이미 쓴 영수증' 이 되어 멀쩡한 회원이 막힌다.
 * 매장(사업자번호·전화)이 다르면 애초에 비교하지 않는다.
 */
export function sameReceiptKey(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const ma = a.match(/^(\d+)_ap(\d+)$/);
  const mb = b.match(/^(\d+)_ap(\d+)$/);
  if (!ma || !mb || ma[1] !== mb[1]) return false;

  const [x, y] = [ma[2], mb[2]];
  if (x.length !== y.length) return false;
  let at = -1;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    if (at >= 0) return false;   // 두 글자 이상 다르면 다른 거래다
    at = i;
  }
  return at >= 0 && at !== x.length - 1;
}

/**
 * 이미 제출된 적 있는 영수증·사진인지 본다.
 *
 * 찾는 순서가 곧 증거의 세기다. 영수증 고유키는 다시 찍든 잘라내든 그대로라
 * 가장 강하고, 바이트 해시는 파일이 똑같을 때만, 글자 지문은 판독이 똑같을 때만 걸린다.
 * 무엇이 걸렸는지를 같이 돌려주는 이유는 위험 점수의 무게가 다르기 때문이다.
 */
export async function findDuplicateShot(print: {
  byteHash: string;
  textHash: string;
  receiptKey: string;
}): Promise<{ hit: ShotPrint; kind: DupKind } | null> {
  const { byteHash, textHash, receiptKey } = print;
  if (!byteHash && !textHash && !receiptKey) return null;
  const list = await readShots();

  if (receiptKey) {
    const hit = list.find((s) => sameReceiptKey(s.receiptKey, receiptKey));
    if (hit) return { hit, kind: 'receipt' };
  }
  if (byteHash) {
    const hit = list.find((s) => s.byteHash === byteHash);
    if (hit) return { hit, kind: 'image' };
  }
  if (textHash) {
    const hit = list.find((s) => s.textHash === textHash);
    if (hit) return { hit, kind: 'text' };
  }
  return null;
}

export async function rememberShot(print: ShotPrint): Promise<void> {
  if (!print.byteHash && !print.textHash && !print.receiptKey) return;
  const list = await readShots();
  list.unshift(print);
  await putJSON(SHOTS, list.slice(0, 8000));
}

/* ------------------------------------------------------------------ 판독함 */

// 영수증을 판독한 결과를 잠깐 보관한다. /api/verify 가 넣고 /api/review 가 꺼내
// 쓰므로, 같은 사진을 두 번 올리지 않고 OCR 도 한 번만 돈다.

const SCANS = 'v2/verify_scans.json';
const SCAN_TTL_MS = 2 * 60 * 60 * 1000;

export type ScanRecord = {
  id: string;
  uid: string;
  ts: number;
  byteHash: string;
  textHash: string;
  /** 영수증 고유키. 못 만들었으면 빈 문자열 — 그때는 이미지·글자 지문이 대신한다. */
  receiptKey: string;
  ocrText: string;
  shotUrl: string;
  shotKey: string;
  /** 중복이면 먼저 낸 사람의 uid. */
  dupOf: string;
  /** 무엇이 겹쳤는지. 빈 문자열이면 중복 아님. */
  dupKind: '' | DupKind;
  receipt: ReceiptVerdict;
  /** 촬영 메타데이터 — 글자와 무관한 두 번째 증거. */
  exif: ShotMeta;
};

export async function readScans(): Promise<ScanRecord[]> {
  const list = await getJSON<ScanRecord[]>(SCANS, []);
  return Array.isArray(list) ? list : [];
}

export async function saveScan(rec: ScanRecord): Promise<void> {
  const list = await readScans();
  list.unshift(rec);
  await putJSON(SCANS, list.slice(0, 3000));
}

export async function takeScan(id: string, uid: string): Promise<ScanRecord | null> {
  if (!id || !uid) return null;
  const rec = (await readScans()).find((s) => s.id === id && s.uid === uid);
  if (!rec || Date.now() - rec.ts > SCAN_TTL_MS) return null;
  return rec;
}

export async function dropScan(id: string): Promise<void> {
  if (!id) return;
  const list = await readScans();
  await putJSON(SCANS, list.filter((s) => s.id !== id).slice(0, 3000));
}

/* ------------------------------------------------------------------ 위험도 */

export type RiskFlag = {
  code: string;
  label: string;
  weight: number;
};

// 무게를 매기는 기준은 하나다 — **부정을 저지르지 않고서는 나오기 어려운 신호인가.**
// 감열지 판독은 절반쯤 무너지는 게 정상이라, 판독 실패 계열(not_receipt,
// ocr_unreadable, receipt_undated)은 단독으로 검수 문턱(25)을 넘지 않게 둔다.
// 반대로 같은 영수증 재제출·미래 날짜처럼 실수로는 나오지 않는 신호는 단독으로
// 'high' 가 되게 둔다.
const FLAGS: Record<string, { label: string; weight: number }> = {
  dup_receipt: { label: '이미 인증에 쓴 영수증', weight: 55 },
  same_store_spam: { label: '같은 매장 같은 날 3회 이상 반복 적립', weight: 55 },
  dup_image: { label: '이미 제출된 사진', weight: 50 },
  dup_text: { label: '같은 내용의 사진 재제출', weight: 40 },
  // 영수증에 찍힌 결제 시각이 미래다 — 판독 오류라기엔 다른 항목이 멀쩡한 경우가 많다.
  receipt_future: { label: '결제 시각이 미래', weight: 40 },
  shot_missing: { label: '영수증 사진 없음', weight: 35 },
  // 영수증 주소의 구(區)가 고른 매장과 다르다. 판독이 반쯤 무너져도 구까지 틀리게
  // 읽는 일은 드물어서, 이건 '다른 데서 받은 영수증' 일 가능성이 높다.
  place_mismatch: { label: '영수증 주소와 선택한 매장이 다름', weight: 40 },
  // 결제가 나오기 전에 찍힌 사진 — 남의 영수증을 미리 받아 둔 경로에서 나온다.
  shot_before_payment: { label: '결제보다 먼저 찍힌 사진', weight: 30 },
  same_store_day: { label: '같은 매장 같은 날 2번째 적립', weight: 25 },
  // 유효기간(14일)이 지난 영수증. 방문 증거로서의 신선도 문제지 부정은 아니다.
  receipt_stale: { label: '오래된 영수증', weight: 25 },
  burst: { label: '짧은 시간에 몰아서 작성', weight: 20 },
  caption_echo: { label: '이전 리뷰와 본문 동일', weight: 20 },
  // 촬영 정보가 통째로 없다 — 메신저로 받은 사진일 수 있다. 다만 갤러리 앱·브라우저가
  // 다시 인코딩하면서 지우는 일도 흔해서, 단독으로는 검수 대상이 되지 않게 둔다.
  shot_meta_stripped: { label: '촬영 정보 없는 사진', weight: 20 },
  // 목록에서 고르지 않고 이름을 직접 적었다 — 대조할 매장 자체가 없다는 뜻이다.
  place_missing: { label: '매장을 목록에서 고르지 않음', weight: 20 },
  daily_volume: { label: '하루 작성량 과다', weight: 15 },
  ocr_unreadable: { label: '사진을 읽지 못함', weight: 15 },
  receipt_undated: { label: '영수증 날짜를 읽지 못함', weight: 15 },
  // 부정이 아니라 판별 실패다. 단독으로는 'clean' 을 넘지 않게 낮게 둔다 —
  // 다만 다른 신호와 겹치면 검수 대상이 되도록 점수는 매긴다.
  region_unknown: { label: '지역을 판별하지 못함(도장 미적립)', weight: 15 },
  // 사진은 냈는데 영수증으로 안 읽혔다. 아무것도 안 낸 것(35)보다는 가볍게 두되,
  // 음식 사진을 올리고 넘어가는 게 이득이 되지 않도록 문턱 가까이 둔다.
  not_receipt: { label: '영수증으로 보이지 않음', weight: 20 },
  // 위치 태그를 꺼 두고 찍는 사람이 훨씬 많다. 실측한 갤럭시 원본 사진도 촬영
  // 시각·기종은 남았지만 GPS 는 없었다. 혼자서는 아무 의미가 없고, 다른 신호와
  // 겹칠 때만 눈금 하나를 더한다.
  shot_no_gps: { label: '위치 정보 없는 사진', weight: 5 },
  // 매장은 골랐는데 영수증에 주소가 안 찍혔거나 못 읽어서 맞춰 보지 못했다.
  // 간이영수증처럼 애초에 주소가 없는 종이도 많아, 회원 잘못으로 보지 않는다.
  place_unconfirmed: { label: '영수증으로 매장을 확인하지 못함', weight: 5 },
};

// 한 가지 사건이 여러 이름으로 불리는 것을 막는다.
//
// 판독이 무너지면 '영수증 아님'·'못 읽음'·'날짜 없음' 이 한꺼번에 선다. 이건 세 가지
// 사건이 아니라 한 가지다. 그대로 더하면 잘라낸 진짜 영수증 한 장(50점)이 같은
// 영수증 재제출(55점)과 거의 같은 취급을 받는다 — 하나는 판독 실패고 하나는 부정인데.
// 한 무리에서는 가장 무거운 것 하나만 점수에 센다(목록에는 다 남긴다 —
// 어드민에게는 무엇이 어떻게 실패했는지가 다 보여야 한다).
const FAMILIES: string[][] = [
  ['shot_missing', 'not_receipt', 'ocr_unreadable', 'receipt_undated'],
];

/**
 * 적립을 막아야 하는 신호 — 있으면 그 문구를, 없으면 빈 문자열.
 *
 * 이 서비스의 기본 정책은 '지급하되 플래그' 다. 판독은 자주 틀리고, 애매한 것을 막으면
 * 부정한 사람보다 멀쩡한 회원이 먼저 다치기 때문이다. 다만 그 정책이 성립하려면 신호가
 * **애매해야** 한다. 여기 모은 둘은 애매하지 않다.
 *
 *   · 같은 영수증 재제출 — 사업자번호+승인번호가 같은 '같은 거래' 다. 판독이 반쯤
 *     무너져도 키가 섰다는 건 같은 종이라는 뜻이다. '영수증 한 장에 인증 한 번' 은
 *     이 방식의 전제라, 경고만 하고 그대로 받아주면 영수증을 증거로 쓰는 의미가 없다.
 *   · 14일이 지난 영수증 — 영수증에 찍힌 결제일시를 **읽어낸** 경우만이다. 날짜를 못
 *     읽어 촬영 시각으로 추정한 건은 막지 않는다. 우리가 정한 기한을 어겼다고 알려
 *     주면서 그대로 받아주면 그건 기한이 아니다.
 *
 * 나머지(영수증으로 안 보임·매장 불일치·촬영 정보 없음)는 여전히 막지 않는다. 전부
 * 판독이 틀렸을 수 있는 것들이고, 그건 위험 점수로 어드민에게 넘긴다.
 */
export function blockReason(codes: string[], receiptDated: boolean): string {
  const has = (c: string) => codes.includes(c);
  if (has('dup_receipt')) {
    return '이미 인증에 사용된 영수증이에요. 영수증 한 장은 한 번만 인증할 수 있어요.';
  }
  if (has('dup_image')) {
    return '이미 제출된 사진이에요. 다른 영수증으로 인증해 주세요.';
  }
  if (has('receipt_stale') && receiptDated) {
    return `결제일로부터 ${RECEIPT_MAX_AGE_DAYS}일이 지난 영수증이에요. 최근 방문 영수증으로 인증해 주세요.`;
  }
  return '';
}

export type RiskResult = {
  score: number;
  level: 'clean' | 'watch' | 'high';
  flags: RiskFlag[];
};

export function scoreRisk(codes: string[]): RiskResult {
  const seen = new Set<string>();
  const flags: RiskFlag[] = [];
  for (const c of codes) {
    if (!c || seen.has(c) || !FLAGS[c]) continue;
    seen.add(c);
    flags.push({ code: c, label: FLAGS[c].label, weight: FLAGS[c].weight });
  }

  const counted = new Set(flags.map((f) => f.code));
  for (const family of FAMILIES) {
    const mine = flags.filter((f) => family.includes(f.code));
    if (mine.length < 2) continue;
    const top = mine.reduce((a, b) => (b.weight > a.weight ? b : a));
    for (const f of mine) if (f.code !== top.code) counted.delete(f.code);
  }

  const score = Math.min(
    100,
    flags.reduce((a, f) => (counted.has(f.code) ? a + f.weight : a), 0)
  );
  const level = score >= 50 ? 'high' : score >= 25 ? 'watch' : 'clean';
  return { score, level, flags };
}

/** 본문 비교용 정규화 — 이모지·공백·문장부호를 지운 알맹이. */
export function captionKey(s: string): string {
  return String(s || '')
    .replace(/[^0-9a-z가-힣]/gi, '')
    .toLowerCase()
    .slice(0, 120);
}

/**
 * 같은 유저의 최근 리뷰들을 보고 행동 기반 신호를 뽑는다.
 * (몰아쓰기 / 하루 과다 / 본문 복붙 / 같은 매장 재작성)
 */
export function behaviourFlags(
  myReviews: { createdAt?: number; date?: string; store?: string; caption?: string }[],
  now: number,
  store: string,
  caption: string
): string[] {
  const out: string[] = [];
  const today = new Date(now).toISOString().slice(0, 10);
  const recent = myReviews.filter((r) => now - (Number(r.createdAt) || 0) < 15 * 60 * 1000);
  if (recent.length >= 3) out.push('burst');
  const todays = myReviews.filter((r) => r.date === today);
  if (todays.length >= 7) out.push('daily_volume');
  // 오늘 같은 매장에 이미 몇 건 썼는지 — 이번 건은 아직 목록에 없다.
  const sameStore = store ? todays.filter((r) => (r.store || '') === store).length : 0;
  if (sameStore >= 2) out.push('same_store_spam');
  else if (sameStore === 1) out.push('same_store_day');
  const key = captionKey(caption);
  if (key.length >= 12 && myReviews.some((r) => captionKey(r.caption || '') === key)) {
    out.push('caption_echo');
  }
  return out;
}
