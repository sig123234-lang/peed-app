import { getJSON, putJSON } from './_store';

// 리뷰 인증 — 자체 검열 시스템.
//
// 핵심은 '일회용 인증 코드'다. 예전에는 모두가 같은 「PEED)」를 붙였기 때문에
// 스크린샷 한 장으로 몇 번이든 다시 제출할 수 있었고, 남의 캡처를 빌려도 알 수 없었다.
// 이제는 유저마다 다른 「PEED-A3F9)」 같은 코드를 발급하고 한 번 쓰면 소각한다.
//   · 같은 리뷰 재제출  → 코드가 이미 소각됨(code_reused)
//   · 남의 스크린샷     → 코드 주인이 다름(code_foreign)
//   · 캡처 돌려쓰기     → 이미지·텍스트 지문 중복(dup_image / dup_text)
//
// 정책상 적립은 항상 해준다. 여기서 매기는 건 '위험 점수'뿐이고, 높은 건만
// 어드민 모더레이션 화면에 올라간다.

const CODES = 'v2/verify_codes.json';
const SHOTS = 'v2/verify_shots.json';

const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const CODE_LEN = 4;
// OCR 이 헷갈리는 글자(0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G, U/V)는 아예 뺀다.
const ALPHABET = 'ACEFHJPRWY349';

export type VerifyCode = {
  code: string;
  uid: string;
  issuedAt: number;
  expiresAt: number;
  usedAt?: number;
  usedFor?: string;
};

export type ShotPrint = {
  byteHash: string;
  textHash: string;
  uid: string;
  store: string;
  ts: number;
};

/* ------------------------------------------------------------------ 코드 */

function randomCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

async function readCodes(): Promise<VerifyCode[]> {
  const list = await getJSON<VerifyCode[]>(CODES, []);
  return Array.isArray(list) ? list : [];
}

async function writeCodes(list: VerifyCode[]): Promise<void> {
  // 만료된 지 일주일 넘은 건 버린다(재사용 판정에 더는 쓸모없다).
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  await putJSON(
    CODES,
    list.filter((c) => c.expiresAt > cutoff).slice(0, 20000)
  );
}

/**
 * 유저에게 쓰지 않은 코드가 있으면 그대로, 없으면 새로 발급한다.
 * (리뷰를 쓰다 말고 나갔다 와도 같은 코드를 붙여넣을 수 있게)
 */
export async function issueCode(uid: string): Promise<VerifyCode> {
  const list = await readCodes();
  const now = Date.now();
  const live = list.find((c) => c.uid === uid && !c.usedAt && c.expiresAt > now);
  if (live) return live;

  const taken = new Set(list.filter((c) => c.expiresAt > now).map((c) => c.code));
  let code = randomCode();
  for (let i = 0; i < 40 && taken.has(code); i++) code = randomCode();

  const rec: VerifyCode = { code, uid, issuedAt: now, expiresAt: now + CODE_TTL_MS };
  list.unshift(rec);
  await writeCodes(list);
  return rec;
}

/** OCR 오독을 흡수하려고 닮은 글자를 한 글자로 접는다. */
function foldConfusable(s: string): string {
  return s
    .toUpperCase()
    .replace(/[0OQD]/g, '0')
    .replace(/[1IL|]/g, '1')
    .replace(/[5S]/g, '5')
    .replace(/[8B]/g, '8')
    .replace(/[2Z]/g, '2')
    .replace(/[6G]/g, '6')
    .replace(/[UV]/g, 'U');
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

export type CodeState = 'ok' | 'reused' | 'foreign' | 'plain' | 'missing';

/**
 * 판독된 글자에서 인증 표식을 찾는다.
 *   ok      = 이 유저에게 발급된 살아있는 코드 (가장 강한 인증)
 *   reused  = 이미 쓴 코드를 또 냈다
 *   foreign = 남에게 발급된 코드다
 *   plain   = 코드 없이 옛날 방식 「PEED)」만 붙였다
 *   missing = 표식이 아예 없다
 */
export async function checkCode(
  uid: string,
  ocrText: string
): Promise<{ state: CodeState; code: string; owner?: string }> {
  const text = String(ocrText || '');
  const coded = text.match(/(?:peed|피드)\s*[-–—]\s*([0-9a-z]{3,6})/i);

  if (coded) {
    const seen = foldConfusable(coded[1]);
    const list = await readCodes();
    const now = Date.now();
    let best: { rec: VerifyCode; d: number } | null = null;
    for (const rec of list) {
      const d = editDistance(seen, foldConfusable(rec.code));
      // 4글자 코드에서 1글자까지만 봐준다. 2글자를 봐주면 남의 코드와 겹친다.
      if (d <= 1 && (!best || d < best.d)) best = { rec, d };
    }
    if (best) {
      const rec = best.rec;
      if (rec.uid !== uid) return { state: 'foreign', code: rec.code, owner: rec.uid };
      if (rec.usedAt) return { state: 'reused', code: rec.code };
      if (rec.expiresAt <= now) return { state: 'plain', code: rec.code };
      return { state: 'ok', code: rec.code };
    }
    // 코드 모양은 갖췄지만 우리가 발급한 게 아니다 — 옛 방식과 같은 취급.
    return { state: 'plain', code: '' };
  }

  if (/(?:peed|피드)\s*\)/i.test(text)) return { state: 'plain', code: '' };
  return { state: 'missing', code: '' };
}

/** 코드를 소각한다. 같은 캡처를 다시 내면 이제 reused 로 잡힌다. */
export async function burnCode(code: string, reviewId: string): Promise<void> {
  if (!code) return;
  const list = await readCodes();
  const rec = list.find((c) => c.code === code);
  if (!rec || rec.usedAt) return;
  rec.usedAt = Date.now();
  rec.usedFor = reviewId;
  await writeCodes(list);
}

/* ---------------------------------------------------------------- 화면 판독 */

const METROS = [
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
];

export type ParsedShot = {
  platform: string;
  store: string;
  category: string;
  region: string;
  rating: number;
  body: string;
  isReviewScreen: boolean;
};

const cleanLine = (s: string) =>
  s.replace(/[|_=~<>\\^]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * 네이버 '리뷰 쓰기 완료' 화면의 글자에서 필드를 뽑는다.
 * OCR 은 늘 조금씩 틀리므로 어느 항목이든 못 찾으면 그냥 비워 두고,
 * 화면에서는 유저가 고칠 수 있게 보여 준다.
 */
export function parseReviewShot(raw: string): ParsedShot {
  const lines = String(raw || '')
    .split('\n')
    .map(cleanLine)
    .filter((l) => l.length > 0);
  const joined = lines.join('\n');

  const platform = /카카오/.test(joined)
    ? '카카오맵'
    : /google|구글/i.test(joined)
      ? '구글'
      : /리뷰\s*쓰기\s*완료|남겨주셨어요|플레이스|네이버/.test(joined)
        ? '네이버'
        : '';

  // 리뷰 '작성 완료' 화면인지 — 아무 사진이나 올리는 걸 걸러낸다.
  const isReviewScreen =
    /리뷰\s*쓰기\s*완료|리뷰를?\s*남겨주셨|리뷰\s*등록|리뷰가?\s*등록|review\s*(posted|submitted)/i.test(
      joined
    );

  // 카테고리·지역 줄: "일본식라면ㆍ서울 강남구 역삼동"
  let category = '';
  let region = '';
  let catIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(.{1,20}?)\s*[·ㆍ‧・∙•]\s*(.{2,40})$/u);
    if (!m) continue;
    const tail = m[2].trim();
    if (!METROS.some((mm) => tail.startsWith(mm))) continue;
    category = m[1].trim();
    region = tail;
    catIdx = i;
    break;
  }

  // 매장명 — 두 곳에서 각각 뽑아 서로 확인한다.
  //   ① "'멘노아지 강남역신분당선점'의" 헤드라인
  //   ② 카테고리 줄 바로 위 카드 제목
  const candidates: string[] = [];
  for (const l of lines) {
    const m = l.match(/^["'''"‘’“”]?(.{2,40}?)["'''"‘’“”]?\s*의$/u);
    if (m) candidates.push(m[1].trim());
  }
  if (catIdx > 0) candidates.push(lines[catIdx - 1]);

  let store = '';
  if (candidates.length) {
    // 두 후보가 같으면 그게 정답이다. 다르면 카드 제목(뒤쪽)이 더 깨끗하다.
    const last = candidates[candidates.length - 1];
    const hit = candidates.find((c) => c !== last && c === last);
    store = hit || last;
  }
  store = store.replace(/^["'''"‘’“”]+|["'''"‘’“”]+$/gu, '').trim();

  // 별점 — ★ 가 W·%·@ 등으로 잘못 읽히므로 숫자 모양으로 찾는다.
  let rating = 0;
  const ratingLine =
    lines.find((l) => /[★☆]/.test(l) && /\d/.test(l)) ||
    lines.slice(catIdx >= 0 ? catIdx : 0).find((l) => /(^|[^\d])[0-5]\.\d([^\d]|$)/.test(l)) ||
    '';
  const rm = ratingLine.match(/(^|[^\d.])([0-5](?:\.\d)?)(?![\d.])/);
  if (rm) {
    const v = parseFloat(rm[2]);
    if (v >= 0.5 && v <= 5) rating = v;
  }

  // 본문 — 인증 표식이 있는 줄부터 별점 줄 직전까지.
  let body = '';
  const kwIdx = lines.findIndex((l) => /(?:peed|피드)\s*[-–—)]/i.test(l));
  if (kwIdx >= 0) {
    const stop = lines.findIndex((l, i) => i > kwIdx && l === ratingLine);
    const end = stop > kwIdx ? stop : lines.length;
    body = lines
      .slice(kwIdx, end)
      .join(' ')
      .replace(/^(?:peed|피드)\s*[-–—]?\s*[0-9a-z]{0,6}\s*\)\s*/i, '')
      .trim();
  }

  return { platform, store, category, region, rating, body, isReviewScreen };
}

/** 판독 글자의 지문 — 같은 리뷰를 다시 캡처해도(재압축·크롭) 같은 값이 나온다. */
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

export async function findDuplicateShot(
  byteHash: string,
  textHash: string
): Promise<ShotPrint | null> {
  if (!byteHash && !textHash) return null;
  const list = await readShots();
  return (
    list.find(
      (s) =>
        (byteHash && s.byteHash === byteHash) || (textHash && s.textHash === textHash)
    ) || null
  );
}

export async function rememberShot(print: ShotPrint): Promise<void> {
  if (!print.byteHash && !print.textHash) return;
  const list = await readShots();
  list.unshift(print);
  await putJSON(SHOTS, list.slice(0, 8000));
}

/* ------------------------------------------------------------------ 판독함 */

// 캡처를 판독한 결과를 잠깐 보관한다. /api/verify 가 넣고 /api/review 가 꺼내
// 쓰므로, 같은 사진을 두 번 올리지 않고 OCR 도 한 번만 돈다.

const SCANS = 'v2/verify_scans.json';
const SCAN_TTL_MS = 2 * 60 * 60 * 1000;

export type ScanRecord = {
  id: string;
  uid: string;
  ts: number;
  byteHash: string;
  textHash: string;
  ocrText: string;
  shotUrl: string;
  shotKey: string;
  codeState: CodeState;
  codeValue: string;
  dupOf: string;
  parsed: ParsedShot;
  resolvedStore: string;
  burning: boolean;
  reward: number;
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

const FLAGS: Record<string, { label: string; weight: number }> = {
  code_foreign: { label: '남에게 발급된 인증 코드', weight: 50 },
  dup_image: { label: '이미 제출된 스크린샷', weight: 50 },
  code_reused: { label: '이미 사용한 인증 코드', weight: 45 },
  dup_text: { label: '같은 내용의 캡처 재제출', weight: 40 },
  shot_missing: { label: '인증 스크린샷 없음', weight: 35 },
  keyword_missing: { label: '인증 표식 없음', weight: 30 },
  store_mismatch: { label: '입력 매장명과 캡처 매장명 불일치', weight: 30 },
  not_review_screen: { label: '리뷰 완료 화면이 아님', weight: 25 },
  // 같은 매장 하루 1회 적립 제한을 없앴기 때문에(정책: 지급하되 플래그),
  // 반복 적립을 막는 장치는 이 플래그뿐이다. 그래서 횟수가 늘수록 세진다.
  // 3회째부터는 이것 하나로 'high' 가 되어 어드민 검수 대상이 된다.
  same_store_spam: { label: '같은 매장 같은 날 3회 이상 반복 적립', weight: 55 },
  same_store_day: { label: '같은 매장 같은 날 2번째 적립', weight: 25 },
  code_plain: { label: '일회용 코드 없이 구 방식 표식', weight: 20 },
  burst: { label: '짧은 시간에 몰아서 작성', weight: 20 },
  caption_echo: { label: '이전 리뷰와 본문 동일', weight: 20 },
  daily_volume: { label: '하루 작성량 과다', weight: 15 },
  ocr_unreadable: { label: '캡처를 읽지 못함', weight: 15 },
  // 부정이 아니라 판별 실패다. 단독으로는 'clean' 을 넘지 않게 낮게 둔다 —
  // 다만 다른 신호와 겹치면 검수 대상이 되도록 점수는 매긴다.
  region_unknown: { label: '지역을 판별하지 못함(도장 미적립)', weight: 15 },
};

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
  const score = Math.min(100, flags.reduce((a, f) => a + f.weight, 0));
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
