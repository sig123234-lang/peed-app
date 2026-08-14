import { normalizeStoreName } from './_match';
import { getJSON } from './_store';
import { matchRegion, regionKey } from '../data/regions';

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
  if (cached) return { items: cached, external: KAKAO_KEY ? 'ok' : 'off' };

  const [peed, kakao] = await Promise.all([peedStores(q), kakaoSearch(q, size)]);
  const items = dedupe(peed, kakao);

  // 카카오가 죽었는데 캐시에 넣으면 10분 동안 반쪽 결과가 굳는다.
  const external: SearchResult['external'] = !KAKAO_KEY
    ? 'off'
    : kakao.length
      ? 'ok'
      : 'error';
  if (external !== 'error') cacheSet(key, items);

  return { items, external };
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
