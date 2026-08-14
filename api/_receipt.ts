// 영수증 판독 — 네이버 리뷰 캡처를 대신해 '실제로 방문했다' 를 증명하는 새 근거.
//
// 예전에는 다른 플랫폼의 '리뷰 쓰기 완료' 화면을 캡처하게 했다. 그건 "다른 데
// 리뷰를 썼다" 는 증거지 "이 매장에 갔다" 는 증거가 아니었고, 리뷰를 PEED 밖에서
// 쓰게 만든다는 더 큰 문제가 있었다. 이제 리뷰는 PEED 안에서 쓰고, 방문 증거만
// 영수증이 맡는다.
//
// 영수증이 캡처보다 나은 점이 셋 있다.
//   · 사업자등록번호가 매장의 고유키다 — 상호 표기가 흔들려도 같은 곳으로 묶인다
//   · 주소에 구(區)까지 찍혀 있다 — 도장 패스포트의 지역 판별이 정확해진다
//   · 승인번호+거래일시가 영수증마다 유일하다 — 재제출을 지문 대조보다 확실히 막는다
//
// 반대로 어려워진 점도 분명하다. 앱이 그려낸 글자를 읽던 것과 달리 이제는
// 감열지를 찍은 '사진 속 글자' 라, OCR 오독을 전제로 짜야 한다. 그래서 이 파일의
// 파서는 어느 항목이든 못 찾으면 조용히 비워 두고, 찾은 것만으로 판단한다.

/* ------------------------------------------------------------------ 타입 */

export type ParsedReceipt = {
  /** 정규화된 사업자등록번호 `123-45-67890`. 못 읽었으면 빈 문자열. */
  bizNo: string;
  /** 체크섬을 통과했는지. 통과하면 OCR 이 제대로 읽었다고 봐도 된다. */
  bizNoValid: boolean;
  store: string;
  address: string;
  /** 매장 전화번호(숫자만). 사업자번호를 못 읽었을 때의 대체 매장 키. */
  phone: string;
  /** 거래일시(ms). 0 이면 못 읽음. */
  at: number;
  /** 합계 금액(원). 0 이면 못 읽음. */
  total: number;
  approval: string;
  /** 영수증으로 보이는지 — 아무 사진이나 올리는 걸 거른다. */
  isReceipt: boolean;
  /** 0..1. 어느 항목을 몇 개나 건졌는지로 매긴다. */
  confidence: number;
};

/* -------------------------------------------------------- 사업자등록번호 */

/**
 * 사업자등록번호 체크섬(국세청 규칙).
 *   가중치 [1,3,7,1,3,7,1,3,5] 를 앞 9자리에 곱해 더하고,
 *   9번째 자리 × 5 의 십의 자리를 한 번 더 더한 뒤,
 *   10 에서 일의 자리를 뺀 값이 마지막 자리와 같아야 한다.
 *
 * 이게 있어서 "OCR 이 번호를 제대로 읽었는가" 를 추측이 아니라 계산으로 판정한다.
 */
export function validateBizNo(digits: string): boolean {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length !== 10) return false;
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

// OCR 이 숫자 자리에서 자주 흘리는 글자들. 영수증은 감열지라 특히 심하다.
const DIGIT_FIX: Record<string, string> = {
  O: '0', o: '0', Q: '0', D: '0', ㅇ: '0',
  I: '1', l: '1', i: '1', '|': '1', ']': '1', '[': '1',
  Z: '2', z: '2',
  E: '3',
  A: '4',
  S: '5', s: '5',
  G: '6', b: '6',
  T: '7', '/': '7',
  B: '8',
  g: '9', q: '9',
};

function toDigits(s: string): string {
  return String(s || '')
    .split('')
    .map((c) => DIGIT_FIX[c] ?? c)
    .join('')
    .replace(/\D/g, '');
}

/**
 * 열 자리 중 한 글자가 틀렸다고 보고 고쳐 본다.
 * 체크섬을 통과하는 후보가 **정확히 하나** 일 때만 받아들인다 — 둘 이상이면
 * 어느 쪽인지 알 수 없고, 잘못 고치면 남의 매장에 리뷰가 붙는다.
 */
function repairBizNo(d: string): string {
  if (d.length !== 10) return '';
  const hits: string[] = [];
  for (let i = 0; i < 10; i++) {
    for (let n = 0; n <= 9; n++) {
      const c = String(n);
      if (c === d[i]) continue;
      const cand = d.slice(0, i) + c + d.slice(i + 1);
      if (validateBizNo(cand)) hits.push(cand);
      if (hits.length > 1) return '';
    }
  }
  return hits.length === 1 ? hits[0] : '';
}

const fmtBizNo = (d: string) => `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;

/**
 * 글자 뭉치에서 사업자등록번호를 찾는다.
 * 구분자는 하이픈이 정석이지만 OCR 이 `~`, `.`, 공백, 또는 아무것도 아닌 것으로
 * 읽는 일이 흔해서 전부 허용한다.
 */
export function findBizNo(raw: string): { bizNo: string; valid: boolean } {
  const text = String(raw || '');
  const seen = new Set<string>();
  const cands: string[] = [];

  // ① 라벨이 붙은 자리를 먼저 본다 — 전화번호를 잘못 집는 걸 막는다.
  const labeled = text.match(
    /(?:사업자\s*(?:등록)?\s*(?:번호|번[호오]|No)?|등록번호)\s*[:：]?\s*([0-9OolIiZzEASsGbTB|\[\]/\-–—~.\s]{10,20})/gi
  );
  if (labeled) {
    for (const m of labeled) {
      const d = toDigits(m.replace(/사업자|등록|번호|번[호오]|No|[:：]/gi, ''));
      if (d.length >= 10 && !seen.has(d.slice(0, 10))) {
        seen.add(d.slice(0, 10));
        cands.push(d.slice(0, 10));
      }
    }
  }

  // ② 라벨이 없거나 못 읽었으면 `000-00-00000` 모양을 통째로 훑는다.
  const loose = text.match(/\d{3}\s*[-–—~.\s]\s*\d{2}\s*[-–—~.\s]\s*\d{5}/g);
  if (loose) {
    for (const m of loose) {
      const d = m.replace(/\D/g, '');
      if (d.length === 10 && !seen.has(d)) {
        seen.add(d);
        cands.push(d);
      }
    }
  }

  // 체크섬을 통과한 후보가 있으면 그게 정답이다.
  for (const d of cands) if (validateBizNo(d)) return { bizNo: fmtBizNo(d), valid: true };
  // 없으면 한 글자만 고쳐 본다.
  for (const d of cands) {
    const fixed = repairBizNo(d);
    if (fixed) return { bizNo: fmtBizNo(fixed), valid: true };
  }
  // 그래도 안 되면 읽힌 대로 두되 '검증 실패' 로 넘긴다(적립은 하되 플래그).
  return cands.length ? { bizNo: fmtBizNo(cands[0]), valid: false } : { bizNo: '', valid: false };
}

/* ------------------------------------------------------------ 거래일시 */

/**
 * 거래일시. 영수증마다 표기가 제각각이라 흔한 형태를 모두 받는다.
 *   2026-08-10 19:32:15 / 2026.08.10 19:32 / 26/08/10 19:32 / 2026년 8월 10일
 * 시각을 못 읽으면 날짜만으로도 받는다(당일 중복 판정에는 날짜만으로도 충분하다).
 */
export function findDateTime(raw: string, now = Date.now()): number {
  const text = String(raw || '');
  const cands: number[] = [];

  const push = (y: number, mo: number, d: number, h = 12, mi = 0) => {
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
    if (h > 23 || mi > 59) { h = 12; mi = 0; }   // 시각이 이상하면 날짜만 믿는다
    const t = new Date(y, mo - 1, d, h, mi).getTime();
    if (!isFinite(t)) return;
    cands.push(t);
  };

  // 시각 앞을 `\s+` 로 두면 안 된다. 앞의 `\s*일?` 이 공백을 먼저 먹은 뒤
  // 시각 그룹이 선택적이라는 이유로 역추적 없이 성공해버려, `2026-08-10 19:32` 에서
  // 시각을 통째로 놓친다. `\s*` 로 두면 공백을 누가 먹든 붙는다.
  // (`[:시]` 를 반드시 요구하므로 `19,000` 같은 금액이 시각으로 잘못 붙지는 않는다.)
  const re =
    /(\d{2,4})\s*[-.\/년]\s*(\d{1,2})\s*[-.\/월]\s*(\d{1,2})\s*일?(?:\s*[(（]?[월화수목금토일][)）]?)?(?:\s*(\d{1,2})\s*[:시]\s*(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    push(Number(m[1]), Number(m[2]), Number(m[3]),
         m[4] === undefined ? 12 : Number(m[4]),
         m[5] === undefined ? 0 : Number(m[5]));
  }
  if (!cands.length) return 0;

  // 미래이거나 2년보다 오래된 값은 오독일 가능성이 크다. 그런 걸 걸러내고
  // 남은 것 중 가장 최근을 고른다(영수증에는 발행일 말고 다른 날짜도 찍힌다).
  const sane = cands.filter((t) => t <= now + 2 * 24 * 3600 * 1000 && t >= now - 730 * 24 * 3600 * 1000);
  const pool = sane.length ? sane : cands;
  return Math.max(...pool);
}

/* -------------------------------------------------------------- 그 밖 */

const AMOUNT_LABELS = /(합\s*계|총\s*액|총\s*합|받을\s*금액|결제\s*금액|승인\s*금액|판매\s*금액|과세\s*물품가액|합계금액)/;

/** 합계 금액. 여러 개가 잡히면 가장 큰 값을 쓴다(부가세·품목가가 같이 잡히므로). */
export function findTotal(raw: string): number {
  const lines = String(raw || '').split('\n');
  const vals: number[] = [];
  for (const line of lines) {
    if (!AMOUNT_LABELS.test(line)) continue;
    const nums = line.match(/\d{1,3}(?:[,，]\d{3})+|\d{4,8}/g);
    if (!nums) continue;
    for (const n of nums) {
      const v = Number(n.replace(/[,，]/g, ''));
      if (v >= 100 && v <= 100_000_000) vals.push(v);
    }
  }
  return vals.length ? Math.max(...vals) : 0;
}

/**
 * 승인번호. 라벨이 살아 있으면 그걸 쓰고, 없으면 홀로 선 숫자 덩어리에서 찾는다.
 *
 * 실측에서 스타벅스 영수증의 「승인번호」 라벨이 `베루` 로 깨져 나왔다. 숫자(56207962)는
 * 멀쩡히 읽혔는데 라벨이 죽어서 통째로 놓쳤다. 영수증에서 6~12자리 독립 숫자는 사실상
 * 승인번호뿐이라(사업자번호·전화·카드번호·바코드·금액은 모양이 다르다) 되찾을 수 있다.
 *
 * 다만 후보가 둘 이상이면 포기한다 — 사업자번호 복구와 같은 원칙이다. 애매하면 비운다.
 */
export function findApproval(raw: string, bizNo = ''): string {
  const text = String(raw || '');

  const m = text.match(/승인\s*(?:번호|No)?\s*[:：]?\s*([0-9OolIiSsBG]{4,14})/i);
  if (m) {
    const d = toDigits(m[1]);
    if (d.length >= 4) return d.slice(0, 14);
  }

  const bizDigits = bizNo.replace(/\D/g, '');
  const seen = new Set<string>();
  const cands: string[] = [];

  for (const line of text.split('\n')) {
    // 카드번호가 적힌 줄은 통째로 건너뛴다. 마스킹된 카드번호의 앞 6자리가
    // 승인번호와 자릿수가 겹쳐서(485462) 후보를 둘로 만들고, 그러면 애매하다는
    // 이유로 진짜 승인번호까지 버려진다.
    if (/카드|card|번호\s*:/i.test(line) && !/승인/.test(line)) continue;

    // **끊기지 않은 숫자 덩어리 전체**를 단위로 본다. 길이만 보고 잘라 쓰면
    // 13자리 바코드(0550038290620)에서 12자리를 떼어내 후보로 삼게 되고,
    // 후보가 둘이 되어 진짜 승인번호까지 같이 버려진다(실측에서 실제로 그랬다).
    for (const mm of line.matchAll(/\d+/g)) {
      const d = mm[0];
      if (d.length < 6 || d.length > 12) continue;

      // 앞뒤에 콤마·점·하이픈이 붙어 있으면 금액이거나 이어진 번호(전화·카드)다.
      // `*` 는 카드번호 마스킹인데 OCR 이 `%` `x` 로도 흘리므로 함께 막는다.
      const i = mm.index ?? 0;
      const before = line[i - 1] ?? '';
      const after = line[i + d.length] ?? '';
      if (/[,.\-–—~*%xX]/.test(before) || /[,.\-–—~*%xX]/.test(after)) continue;

      if (d === bizDigits) continue;
      if (/^20[0-9]{2}(0[1-9]|1[0-2])/.test(d)) continue;   // 20260508 같은 날짜 뭉치
      if (/^(\d)\1+$/.test(d)) continue;                     // 000000 처럼 의미 없는 값
      if (seen.has(d)) continue;
      seen.add(d);
      cands.push(d);
    }
  }
  return cands.length === 1 ? cands[0] : '';
}

/**
 * 매장 전화번호. 매장 식별의 **대체 키**다.
 *
 * 네이버 영수증 리뷰가 사업자 정보를 「업체명, 주소, 전화번호 **또는** 사업자등록번호」
 * 로 두는 이유를 실측에서 확인했다. 사업자등록번호 판독에 실패한 영수증에서도
 * 전화번호(02-2646-4885)는 세 가지 설정 모두에서 완벽하게 읽혔다. 숫자가 짧게 끊겨
 * 있고 하이픈 자리가 예측 가능해서 긴 숫자열보다 훨씬 잘 살아남는다.
 *
 * 사업자번호 하나만 키로 쓰면 읽히는 정보를 버리게 된다.
 */
export function findPhone(raw: string): string {
  const text = String(raw || '');
  const seen = new Set<string>();
  const out: string[] = [];
  // 구분자 자리를 넉넉히 잡는다. 실측에서 `02-2646-4885` 가 `02-2646~-4885` 로,
  // 하이픈 하나가 `~` 와 `-` 두 글자로 불어난 채 읽혔다. 한 글자만 허용하면 놓친다.
  const SEP = '[-–—~.\\s]{1,2}';
  const PHONE = `(0\\d{1,2}${SEP}\\d{3,4}${SEP}\\d{4}|1[5678]\\d{2}${SEP}\\d{4})`;

  for (const m of text.matchAll(new RegExp(`(?:^|[^\\d])${PHONE}(?!\\d)`, 'g'))) {
    const d = m[1].replace(/\D/g, '');
    if (d.length < 8 || d.length > 11) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  // 여러 개면 라벨(TEL) 이 붙은 걸 우선한다.
  const labeled = text.match(new RegExp(`(?:TEL|전화|연락처)\\s*[:：.\\]]?\\s*${PHONE}`, 'i'));
  if (labeled) return labeled[1].replace(/\D/g, '');
  return out[0] || '';
}

const METROS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  '충청', '전라', '경상',
];

/** 주소 — 시·도로 시작하는 줄. 도장 패스포트의 지역 판별에 그대로 넘긴다. */
export function findAddress(raw: string): string {
  const lines = String(raw || '').split('\n').map((l) => l.trim());
  for (const line of lines) {
    const body = line.replace(/^(?:주\s*소|가맹점\s*주소|사업장\s*주소)\s*[:：]?\s*/, '').trim();
    if (body.length < 6 || body.length > 80) continue;
    if (!METROS.some((m) => body.startsWith(m))) continue;
    // 구·군·시·로·길 중 하나는 있어야 주소다(상호에 '서울' 이 들어간 경우를 거른다).
    if (!/[구군시읍면동로길]/.test(body)) continue;
    return body;
  }
  return '';
}

const STORE_NOISE =
  /(영수증|계산서|신용카드|매출전표|승인|취소|과세|면세|부가세|합계|금액|사업자|대표자|전화|주소|카드|거래|일시|번호|테이블|주문|포스|POS|TEL|고객용|가맹점용)/i;

/**
 * 상호. 라벨이 있으면 그걸 쓰고, 없으면 영수증 맨 위의 '노이즈가 아닌 첫 줄' 을 쓴다.
 * 한국 영수증은 상호를 맨 위에 크게 찍는 관행이 있어 이 추정이 꽤 잘 맞는다.
 */
export function findStore(raw: string): string {
  const lines = String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean);

  const labeled = String(raw || '').match(
    /(?:상\s*호|가맹점\s*(?:명)?|매장\s*명|점\s*명)\s*[:：]?\s*(.{2,30})/
  );
  if (labeled) {
    const v = labeled[1].replace(/[:：].*$/, '').trim();
    if (v && !STORE_NOISE.test(v)) return v.slice(0, 40);
  }

  for (const line of lines.slice(0, 6)) {
    const v = line.replace(/[[\]()<>*=\-—_]/g, ' ').replace(/\s+/g, ' ').trim();
    if (v.length < 2 || v.length > 30) continue;
    if (STORE_NOISE.test(v)) continue;
    if (/^\d/.test(v)) continue;                 // 숫자로 시작하면 상호가 아니다
    if (!/[가-힣]/.test(v)) continue;            // 한글이 하나도 없으면 상호로 안 본다

    // 판독이 무너진 줄을 상호로 내보내면 안 된다. 회원이 적은 매장명과 대조할 때
    // 엉뚱한 불일치 플래그가 서고, 어드민 검수 목록만 지저분해진다.
    // 실측에서 `^ wes 0 그 그 월 일어 Set | ere |` 같은 것이 상호로 나왔다.
    const letters = (v.match(/[가-힣a-zA-Z]/g) || []).length;
    if (letters / v.length < 0.6) continue;      // 글자 비율이 낮으면 노이즈다
    if ((v.match(/\s/g) || []).length > 3) continue;  // 상호에 띄어쓰기가 넷 이상은 드물다
    if (/[|^~`]/.test(line)) continue;           // OCR 파편이 섞인 줄

    return v.slice(0, 40);
  }
  return '';
}

/* -------------------------------------------------------------- 종합 */

// 영수증에만 나오는 낱말들. 감열지 판독은 절반쯤 무너지는 게 정상이라
// 어휘가 좁으면 멀쩡한 영수증도 '영수증 아님' 으로 떨어진다. 실측에서 순백회관
// 영수증이 그렇게 떨어졌다 — 「사업자」 가 깨지고 나니 남는 단서가 없었다.
// 대신 음식 사진·리뷰 캡처에는 안 나올 낱말로만 채워 문턱을 낮추되 헐겁게는 두지 않는다.
const RECEIPT_HINT =
  /(영수증|매출전표|신용승인|카드승인|승인번호|사업자|합\s*계|부가세|과세물품|현금영수증|가맹점|상\s*품\s*명|단\s*가|수\s*량|대표자|매장명|주문번호|결제금액|받을금액|신용카드|POS)/;

export function parseReceipt(raw: string, now = Date.now()): ParsedReceipt {
  const text = String(raw || '');
  const { bizNo, valid } = findBizNo(text);
  const at = findDateTime(text, now);
  const total = findTotal(text);
  const phone = findPhone(text);
  const approval = findApproval(text, bizNo);
  const address = findAddress(text);
  const store = findStore(text);

  // 영수증 판정 — 단서 하나에 걸지 않고 **서로 독립적인 증거의 합**으로 본다.
  // 감열지 판독은 절반쯤 무너지는 게 정상이라, 어느 한 항목을 필수로 두면 멀쩡한
  // 영수증이 떨어진다. 실측에서 순백회관 영수증이 그랬다 — 사업자번호는 깨졌지만
  // 전화번호(02-2646-4885)는 멀쩡히 읽혔는데도 '영수증 아님' 으로 판정됐다.
  const hints = (text.match(new RegExp(RECEIPT_HINT, 'g')) || []).length;
  const isReceipt =
    valid ||                          // 체크섬 통과 사업자번호 하나면 확정
    hints >= 2 ||                     // 영수증 어휘가 둘 이상
    (!!phone && hints >= 1) ||        // 매장 전화 + 영수증 어휘
    (!!phone && at > 0) ||            // 매장 전화 + 거래일시
    (!!approval && at > 0);           // 승인번호 + 거래일시

  // 신뢰도 — 뒷단(위험 점수)이 쓸 눈금이다. 항목마다 무게가 다르다.
  // 매장 식별은 사업자번호 하나가 아니라 전화·주소·상호까지 '넷 중 하나' 로 본다
  // (네이버 영수증 리뷰의 요건도 OR 조건이고, 실측에서도 사업자번호만 실패하고
  //  전화·주소·상호는 멀쩡히 읽히는 영수증이 있었다).
  let score = 0;
  if (valid) score += 0.40;
  else if (bizNo) score += 0.12;
  if (phone) score += 0.14;
  if (at) score += 0.18;
  if (approval) score += 0.10;
  if (total) score += 0.08;
  if (address) score += 0.06;
  if (store) score += 0.04;

  return {
    bizNo, bizNoValid: valid, store, address, phone, at, total, approval,
    isReceipt,
    confidence: Math.min(1, Number(score.toFixed(2))),
  };
}

/* ------------------------------------------------------- 인증 판정 */

// 리뷰 본문·매장명·별점은 회원이 직접 적는다. 그래서 영수증이 답해야 할 질문은
// 셋뿐이다 — **영수증이 맞나 / 중복이 아닌가 / 최근 것인가.**
// 상호·금액을 정확히 뽑아낼 필요가 없어졌으므로 OCR 실패에 훨씬 관대해질 수 있다.

export type ReceiptVerdict = {
  isReceipt: boolean;
  /** 중복 판정 키. 비었으면 OCR 로는 못 만들었다는 뜻(호출한 쪽이 이미지 지문으로 대체). */
  key: string;
  /** 회원이 적은 매장명과 맞춰 볼 힌트. 불일치는 막지 않고 플래그만 남긴다. */
  hints: { store: string; phone: string; address: string; bizNo: string };
  /** 결제 시각(ms). 0 이면 못 읽음. 화면에서 "이 영수증이 맞나" 를 확인시킬 때 쓴다. */
  at: number;
  /** 결제 금액(원). 0 이면 못 읽음. */
  total: number;
  flags: string[];
  confidence: number;
};

export type ShotMeta = {
  shotAt: number;
  hasGps: boolean;
  stripped: boolean;
};

/**
 * 영수증 사진 한 장에 대한 판정.
 *
 * EXIF 를 함께 보는 이유: OCR 이 하는 일이 줄어든 만큼 "실제로 가서 직접 찍었나" 를
 * 사진 자체가 받쳐 줘야 한다. 카카오톡 등 메신저를 거치면 GPS 가 지워지므로,
 * 남의 영수증 사진을 받아 올리는 경로가 여기서 걸린다.
 *
 * 무엇도 차단하지 않는다 — 이 서비스의 정책은 '지급하되 플래그' 다.
 */
export function checkReceipt(
  ocrText: string,
  meta: ShotMeta,
  now = Date.now()
): ReceiptVerdict {
  const p = parseReceipt(ocrText, now);
  const flags: string[] = [];

  if (!p.isReceipt) flags.push('not_receipt');
  if (!ocrText.trim()) flags.push('ocr_unreadable');

  // 결제일시가 읽히면 그걸, 아니면 촬영일시를 신선도의 근거로 쓴다.
  const when = p.at || meta.shotAt;
  if (!when) flags.push('receipt_undated');
  else flags.push(...receiptAgeFlags(when, now));

  // 촬영 메타데이터 — 원본 사진인지의 신호.
  if (meta.stripped) flags.push('shot_meta_stripped');
  else if (!meta.hasGps) flags.push('shot_no_gps');
  // 결제보다 이전에 찍힌 사진은 앞뒤가 맞지 않는다(영수증이 나오기 전에 찍을 수 없다).
  if (p.at && meta.shotAt && meta.shotAt < p.at - 6 * 3600 * 1000) {
    flags.push('shot_before_payment');
  }

  return {
    isReceipt: p.isReceipt,
    key: receiptKey(p),
    hints: { store: p.store, phone: p.phone, address: p.address, bizNo: p.bizNo },
    at: p.at,
    total: p.total,
    flags,
    confidence: p.confidence,
  };
}

/**
 * 영수증 한 장의 고유키. 같은 영수증을 다시 올리면 여기서 걸린다.
 *
 * 예전 캡처 방식은 이미지 해시(byteHash)와 글자 지문(textHash)으로 중복을 잡았는데,
 * 다시 찍거나 크롭하면 둘 다 바뀌어 빠져나갈 수 있었다. 사업자번호+거래일시+승인번호는
 * 같은 거래면 무조건 같으므로 재촬영·재압축에 영향을 받지 않는다.
 *
 * 승인번호를 못 읽었으면 금액으로 대신한다. 그래도 사업자번호와 시각이 같고 금액까지
 * 같은 별개 거래는 사실상 없다.
 */
export function receiptKey(p: ParsedReceipt): string {
  // 매장 자리는 사업자번호가 1순위, 없으면 전화번호. 둘 중 하나만 읽혀도 키가 선다.
  const store = p.bizNo ? p.bizNo.replace(/-/g, '') : p.phone;
  if (!store) return '';

  // ① 승인번호가 있으면 그것만으로 충분하다. 카드 거래 하나에 하나씩 붙는 값이라
  //    날짜가 통째로 날아가도(실측에서 실제로 그랬다) 중복을 잡아낸다.
  if (p.approval) return `${store}_ap${p.approval}`;

  if (!p.at) return '';
  const d = new Date(p.at);
  const stamp =
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
    `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

  // ② 승인번호가 없으면 시각+금액으로 대신한다. 같은 매장 같은 분 같은 금액인
  //    별개 거래는 사실상 없다. 금액마저 없으면 키를 만들지 않는다 — 시각만으로
  //    묶으면 남의 영수증을 중복으로 잘못 막을 수 있다.
  return p.total ? `${store}_${stamp}_a${p.total}` : '';
}

/** 영수증이 너무 오래됐는지 — 방문 증거로서의 신선도. */
export const RECEIPT_MAX_AGE_DAYS = 14;

export function receiptAgeFlags(at: number, now = Date.now()): string[] {
  if (!at) return [];
  const out: string[] = [];
  if (at > now + 24 * 3600 * 1000) out.push('receipt_future');
  else if (now - at > RECEIPT_MAX_AGE_DAYS * 24 * 3600 * 1000) out.push('receipt_stale');
  return out;
}
