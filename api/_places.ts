import { normalizeStoreName } from './_match';
import { getJSON } from './_store';
import { REGIONS, matchRegion, regionKey } from '../data/regions';

// 매장 찾기 — 회원이 이름을 치면 **지점까지 특정된 매장**을 골라 준다.
//
// 왜 이걸 만드는가. 영수증에 찍히는 상호는 사업자등록증상의 이름이라 간판과 다른
// 경우가 흔하다("순백회관 목동본점" 이 영수증에는 다른 상호로 찍힌다). 그래서 영수증
// 판독으로 매장을 알아내려는 시도 자체를 접었다. 영수증은 '언제·얼마·중복 아님' 만
// 답하고, 매장은 회원이 여기서 골라 확정한다. 그러면 주소·좌표·카테고리가 정확히
// 따라오고, 도장 패스포트의 지역 판별도 추측이 아니라 확정값이 된다.
//
// 출처는 둘을 합친다.
//   ① PEED 등록 매장(v2/stores.json) — 맨 위에 올린다. 버닝 여부·리워드가 확정이라
//      이름 철자로 유추하던 매칭(_match.matchBurningStore)이 필요 없어진다.
//   ② 카카오 로컬 키워드 검색 — 나머지 전부.
//
// 네이버 플레이스를 쓰지 않는 이유: 공개 API 가 없다. 어드민의 naver-place.ts 는
// 모바일 페이지를 긁는 방식이라 URL 을 미리 알아야 하고, 실사용자 검색 트래픽에
// 쓰면 구조가 바뀌는 날 통째로 멈춘다. 카카오 로컬은 공식 API 이고 무료 한도가
// 하루 10만 회다(네이버 지역검색은 한 번에 5건뿐이라 지점 목록을 못 고른다).

export type Place = {
  /** 'peed:<id>' 또는 'kakao:<id>'. 어디서 왔는지가 id 에 남는다. */
  id: string;
  source: 'peed' | 'kakao';
  name: string;
  category: string;
  /** 도로명 주소 우선. */
  address: string;
  jibun: string;
  /** 숫자만. 영수증에서 읽은 번호와 그대로 대조하려고 형식을 지운다. */
  phone: string;
  /** '서울 양천구' — 도장 패스포트가 쓰는 키. 못 정하면 빈 문자열. */
  region: string;
  lat: number;
  lng: number;
  burning: boolean;
  reward: number;
};

/**
 * 카카오 REST 키. 로그인용으로 이미 넣어 둔 KAKAO_CLIENT_ID 가 곧 REST 키다
 * (카카오 OAuth 가 REST 키를 client_id 로 쓴다). 나중에 키를 분리하고 싶을 때를
 * 위해 전용 이름을 먼저 본다.
 */
const KAKAO_KEY = process.env.KAKAO_REST_KEY || process.env.KAKAO_CLIENT_ID || '';
const KAKAO_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const FETCH_TIMEOUT_MS = 4000;

const digits = (s: string) => String(s || '').replace(/\D/g, '');

/** 카카오 카테고리 '음식점 > 한식 > 국밥' 에서 마지막 조각만 쓴다. */
function leafCategory(s: string): string {
  const parts = String(s || '')
    .split('>')
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function toRegion(...addresses: string[]): string {
  for (const a of addresses) {
    const m = matchRegion(a || '');
    if (m) return regionKey(m);
  }
  return '';
}

/* ------------------------------------------------------------------ 캐시 */

// 같은 글자를 여러 사람이 친다(자동완성이라 한 사람이 여러 번 치기도 한다).
// 카카오 하루 한도를 지키는 것보다도, 같은 질의에 같은 답을 즉시 주는 게 목적이다.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 300;
const cache = new Map<string, { at: number; items: Place[] }>();

function cacheGet(key: string): Place[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // 최근 쓴 것을 뒤로 옮겨 오래된 것부터 밀려나게 한다.
  cache.delete(key);
  cache.set(key, hit);
  return hit.items;
}

function cacheSet(key: string, items: Place[]): void {
  cache.set(key, { at: Date.now(), items });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/* ------------------------------------------------------- PEED 등록 매장 */

async function peedStores(q: string): Promise<Place[]> {
  const raw = await getJSON<any[]>('v2/stores.json', []);
  const needle = normalizeStoreName(q);
  if (!needle) return [];

  const out: Place[] = [];
  for (const s of raw || []) {
    if (!s || !s.storeName) continue;
    // 과금 중인 매장만 버닝으로 내보낸다. 그 밖의 단계(리드·상담)는 카카오 쪽에서
    // 어차피 검색되므로 여기서 굳이 보여 줄 이유가 없다.
    if (s.stage !== '활성') continue;
    const name = String(s.storeName);
    if (!normalizeStoreName(name).includes(needle)) continue;

    const address = String(s.address || '');
    out.push({
      id: `peed:${String(s.id || name)}`,
      source: 'peed',
      name,
      category: String(s.category || ''),
      address,
      jibun: '',
      phone: digits(s.contact || ''),
      region: toRegion(address, `${s.region || ''} ${address}`),
      lat: Number(s.lat) || 0,
      lng: Number(s.lng) || 0,
      burning: true,
      reward: typeof s.reward === 'number' ? s.reward : 10,
    });
  }
  return out;
}

/* ---------------------------------------------------------- 카카오 로컬 */

async function kakaoSearch(q: string, size: number): Promise<Place[]> {
  if (!KAKAO_KEY) return [];

  const url = `${KAKAO_URL}?query=${encodeURIComponent(q)}&size=${size}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
      signal: ctl.signal,
    });
    if (!r.ok) return [];
    const j: any = await r.json();
    const docs: any[] = Array.isArray(j?.documents) ? j.documents : [];
    return docs.map((d) => {
      const road = String(d.road_address_name || '');
      const jibun = String(d.address_name || '');
      return {
        id: `kakao:${String(d.id || '')}`,
        source: 'kakao' as const,
        name: String(d.place_name || ''),
        category: leafCategory(String(d.category_name || '')),
        address: road || jibun,
        jibun,
        phone: digits(d.phone || ''),
        region: toRegion(road, jibun),
        lat: Number(d.y) || 0,
        lng: Number(d.x) || 0,
        burning: false,
        reward: 2,
      };
    });
  } catch {
    // 시간 초과·네트워크 오류 — 등록 매장만이라도 돌려준다.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------- 합치기 */

/**
 * 같은 매장이 두 출처에서 오면 PEED 쪽만 남긴다.
 *
 * 전화번호가 같으면 같은 곳으로 본다 — 상호 표기가 흔들려도 번호는 흔들리지 않는다.
 * 번호가 없는 쪽은 이름과 지역(구)이 둘 다 같을 때만 같은 곳으로 본다. 이름만으로
 * 묶으면 같은 브랜드의 다른 지점이 사라진다(그게 이 화면이 존재하는 이유다).
 */
function dedupe(peed: Place[], kakao: Place[]): Place[] {
  const phones = new Set(peed.map((p) => p.phone).filter(Boolean));
  const nameRegion = new Set(
    peed.map((p) => `${normalizeStoreName(p.name)}@${p.region}`)
  );
  const rest = kakao.filter((k) => {
    if (k.phone && phones.has(k.phone)) return false;
    if (nameRegion.has(`${normalizeStoreName(k.name)}@${k.region}`)) return false;
    return true;
  });
  return [...peed, ...rest];
}

export type SearchResult = {
  items: Place[];
  /** 카카오 쪽이 살아 있었는지 — 화면에서 '직접 입력' 안내를 띄울지 정할 때 쓴다. */
  external: 'ok' | 'off' | 'error';
};

export async function searchPlaces(query: string, size = 15): Promise<SearchResult> {
  const q = String(query || '').trim().slice(0, 40);
  if (q.length < 2) return { items: [], external: KAKAO_KEY ? 'ok' : 'off' };

  const key = `${q}#${size}`;
  const cached = cacheGet(key);
  if (cached) {
    remember(cached);
    return { items: cached, external: KAKAO_KEY ? 'ok' : 'off' };
  }

  const [peed, kakao] = await Promise.all([peedStores(q), kakaoSearch(q, size)]);
  const items = dedupe(peed, kakao);
  remember(items);

  // 카카오가 죽었는데 캐시에 넣으면 10분 동안 반쪽 결과가 굳는다.
  const external: SearchResult['external'] = !KAKAO_KEY
    ? 'off'
    : kakao.length
      ? 'ok'
      : 'error';
  if (external !== 'error') cacheSet(key, items);

  return { items, external };
}

/* ------------------------------------------------------ 고른 매장 되찾기 */

// 회원이 고른 매장은 id 만 서버로 올라온다. 주소·전화·버닝 여부까지 클라이언트가
// 보내게 하면 그 값을 그대로 믿는 셈이 되어(예전에 burning 을 클라가 보내던 시절과
// 같은 실수), 아무 매장이나 골라 놓고 주소만 버닝 매장 것으로 바꿔 보낼 수 있다.
// 그래서 검색해서 내보낸 원본을 서버가 잠깐 들고 있다가 id 로 되찾아 쓴다.
//
// 리뷰 한 건은 보통 몇 분 안에 끝나므로 30분이면 넉넉하다. 재시작하거나 시간이
// 지나 못 찾으면 '확정할 수 없음' 으로 흘러갈 뿐, 적립이 막히지는 않는다.
const PLACE_TTL_MS = 30 * 60 * 1000;
const PLACE_MAX = 2000;
const seen = new Map<string, { at: number; place: Place }>();

function remember(items: Place[]): void {
  const now = Date.now();
  for (const p of items) {
    seen.delete(p.id);
    seen.set(p.id, { at: now, place: p });
  }
  while (seen.size > PLACE_MAX) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

/** 회원이 고른 매장의 원본. 못 찾으면 null(만료됐거나 서버가 재시작했다). */
export function lookupPlace(id: string): Place | null {
  const hit = seen.get(String(id || ''));
  if (!hit) return null;
  if (Date.now() - hit.at > PLACE_TTL_MS) {
    seen.delete(id);
    return null;
  }
  return hit.place;
}

/* --------------------------------------------------------- 전화번호 판별 */

/**
 * 이 번호로 '어느 지점인가' 를 가릴 수 있는가.
 *
 * 실측(2026-08-14)에서 두 종류가 걸러졌다.
 *   · 대표번호 — 스타벅스 목동점·동탄목동점·오목로점·SBS점이 전부 1522-3232 다.
 *     번호가 맞아도 지점은 아무것도 증명되지 않는다(사업자등록번호도 마찬가지다.
 *     직영 프랜차이즈는 본사 번호 하나를 전 지점이 함께 쓴다).
 *   · 안심번호(0507·050x) — 등록 매장 '나누리흑염소전문점' 이 0507-1323-7047 인데
 *     실제 매장 번호는 02-3394-7047 이다. 영수증에 찍히는 쪽과 애초에 다르다.
 *
 * 그래서 이 둘은 일치해도 근거로 세지 않는다. 지점 식별의 근거는 주소다.
 */
export function phoneIdentifiesBranch(phone: string): boolean {
  const d = digits(phone);
  if (d.length < 9) return false;
  if (/^1[5678]\d{2}/.test(d)) return false;   // 15xx·16xx·17xx·18xx 대표번호
  if (/^080/.test(d)) return false;            // 수신자부담 대표번호
  if (/^050/.test(d)) return false;            // 안심번호(0507 등)
  return true;
}

/* --------------------------------------------------- 영수증과 맞춰 보기 */

export type PlaceCheck = {
  state: 'confirmed' | 'mismatch' | 'unknown';
  /** 무엇으로 판단했는지 — 어드민 검수에서 이유를 볼 수 있어야 한다. */
  how: string;
};

/** 도로명 주소에서 '오목로 337-20' 같은 길 이름+번지만 남긴다. */
function roadKey(address: string): string {
  const m = String(address || '').match(/([가-힣A-Za-z0-9]+(?:로|길))\s*(\d+(?:-\d+)?)/);
  return m ? `${m[1]} ${m[2]}` : '';
}

/**
 * 영수증에 찍힌 주소가 어느 시·군·구인지. 판독 오차를 견디게 헐겁게 본다.
 *
 * 정식 판별(matchRegion)은 '마포구' 처럼 온전한 이름을 요구하는데, 감열지 판독은
 * 끝 한 글자를 자주 흘린다. 실측(2026-08-14)에서 `서울.마포 와무산로 64S` 가 그랬다 —
 * 사람 눈에는 마포구가 분명한데 '구' 하나가 없어서 판별이 통째로 실패했고, 그 바람에
 * 엉뚱한 매장을 골라도 어긋났다고 말할 수 없었다.
 *
 * 그래서 끝 글자를 뗀 이름('마포')도 받아 준다. 다만 한 글자로 줄어드는 이름('중구'→'중')
 * 은 아무 데나 걸리므로 온전한 형태만 쓰고, 시·도까지 함께 있어야 인정한다.
 * 긴 이름부터 보는 이유는 짧은 이름이 먼저 걸려 엉뚱한 구로 확정되는 걸 막기 위해서다.
 */
function readRegionLoosely(address: string): string {
  const text = String(address || '');
  if (!text) return '';

  const strict = matchRegion(text);
  if (strict) return regionKey(strict);

  const sorted = [...REGIONS].sort((a, b) => b.name.length - a.name.length);
  for (const r of sorted) {
    if (!text.includes(r.sido)) continue;
    const short = r.name.replace(/(구|군|시)$/, '');
    if (short.length >= 2 && text.includes(short)) return regionKey(r);
  }
  return '';
}

/**
 * 회원이 고른 매장과 영수증이 같은 곳을 가리키는지 본다.
 *
 * 근거는 주소다. 전화번호는 프랜차이즈 대표번호·안심번호 때문에 지점을 못 가리고,
 * 사업자등록번호도 직영 프랜차이즈는 본사 번호가 전 지점 공통이라 마찬가지다
 * (phoneIdentifiesBranch 주석의 실측 참고). 주소만 지점마다 반드시 다르다.
 *
 * 무엇도 차단하지 않는다 — 결과는 위험 점수로만 쓰인다(정책: 지급하되 플래그).
 */
export function checkPlaceAgainstReceipt(
  place: Place,
  receipt: { address: string; phone: string }
): PlaceCheck {
  const receiptRegion = readRegionLoosely(receipt.address || '');

  if (receiptRegion && place.region) {
    if (receiptRegion !== place.region) {
      return { state: 'mismatch', how: `영수증 ${receiptRegion} ≠ 선택 ${place.region}` };
    }
    const a = roadKey(place.address);
    const b = roadKey(receipt.address);
    if (a && b && a === b) return { state: 'confirmed', how: `도로명 일치(${a})` };
    return { state: 'confirmed', how: `지역 일치(${receiptRegion})` };
  }

  // 주소를 못 읽었을 때만 전화번호를 본다. 지점을 가릴 수 있는 번호일 때 한정이다.
  const rp = digits(receipt.phone);
  if (rp && phoneIdentifiesBranch(place.phone) && phoneIdentifiesBranch(rp)) {
    if (rp === place.phone) return { state: 'confirmed', how: '전화번호 일치' };
    // 영수증에는 매장 번호 말고 다른 번호(주문·본사)가 찍히기도 해서, 다르다는
    // 것만으로 부정으로 보지 않는다. 근거가 없는 것으로 남긴다.
    return { state: 'unknown', how: '전화번호 불일치(근거로 세지 않음)' };
  }

  return { state: 'unknown', how: '영수증에서 주소를 읽지 못함' };
}

/* ------------------------------------------------------------ 호출 제한 */

// 자동완성이라 타자마다 요청이 올 수 있다. 앱에서 디바운스를 걸지만, 서버도 스스로를
// 지켜야 한다(카카오 한도는 하루 10만 회이고 그건 서비스 전체가 나눠 쓴다).
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 40;
const hits = new Map<string, number[]>();

export function rateLimited(who: string): boolean {
  const now = Date.now();
  const list = (hits.get(who) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(who, list);
  // 오래된 방문자 기록은 흘려보낸다(맵이 무한히 자라지 않게).
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > RATE_WINDOW_MS) hits.delete(k);
    }
  }
  return list.length > RATE_MAX;
}
