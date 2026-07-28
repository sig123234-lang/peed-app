import { getJSON } from './_store';

// 매장명 매칭 — "유저가 버닝 매장인 줄 모르고 일반 리뷰로 올려서 2PB만 받는" 문제를 없앤다.
// 네이버플레이스 매장명을 그대로 받아 등록된 버닝 매장과 대조하고, 같은 곳이면
// 서버가 버닝으로 승격시킨다. 클라이언트가 보낸 burning 플래그는 신뢰하지 않는다.

export type BurningStore = {
  id: string;
  name: string;
  reward: number;
  category: string;
  region: string;
  address: string;
};

/** 비교용 정규화 — 공백·괄호·특수문자·대소문자를 지우고 뼈대만 남긴다. */
export function normalizeStoreName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s ]+/g, '')
    .replace(/[^0-9a-z가-힣]/g, '');
}

/** "…강남역신분당선점" 처럼 끝에 붙는 지점 표기를 떼어 본점 이름만 남긴다. */
export function stripBranch(normalized: string): string {
  return normalized.replace(/(점|지점|스토어|store)$/u, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 유사도. OCR 오탈자 한두 글자를 견디게 하려고 편집거리를 길이로 정규화한다. */
export function similarity(a: string, b: string): number {
  const x = normalizeStoreName(a);
  const y = normalizeStoreName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const max = Math.max(x.length, y.length);
  return 1 - levenshtein(x, y) / max;
}

/** 활성(과금 중) 버닝 매장 목록. */
export async function loadBurningStores(): Promise<BurningStore[]> {
  const raw = await getJSON<any[]>('v2/stores.json', []);
  return (raw || [])
    .filter((s) => s && s.stage === '활성' && s.storeName)
    .map((s) => ({
      id: String(s.id || ''),
      name: String(s.storeName || ''),
      reward: typeof s.reward === 'number' ? s.reward : 10,
      category: String(s.category || ''),
      region: String(s.region || ''),
      address: String(s.address || ''),
    }));
}

export type StoreMatch = {
  store: BurningStore;
  score: number; // 0..1
  how: 'exact' | 'branch' | 'fuzzy';
};

// 유사도 하한. 0.86 이면 열 글자 중 한 글자쯤 어긋나도 통과하고,
// 서로 다른 지점(예: 강남점 vs 홍대점)은 걸러진다.
const FUZZY_MIN = 0.86;

/**
 * 입력한 매장명이 등록된 버닝 매장인지 찾는다.
 *
 * 정확도(precision)를 재현율(recall)보다 우선한다. 못 잡으면 일반 리뷰 2PB로
 * 지금과 같지만, 잘못 잡으면 엉뚱한 매장에 10PB가 적립되기 때문이다. 그래서
 *   · 지점이 다르면(강남점 vs 홍대점) 같은 브랜드라도 매칭하지 않고
 *   · 후보가 비등하게 둘 이상이면(브랜드명만 입력된 경우) 아예 포기한다.
 */
export function matchBurningStore(
  input: string,
  stores: BurningStore[]
): StoreMatch | null {
  const q = normalizeStoreName(input);
  if (q.length < 2) return null;

  const hits: StoreMatch[] = [];

  for (const store of stores) {
    const n = normalizeStoreName(store.name);
    if (!n) continue;

    if (n === q) {
      hits.push({ store, score: 1, how: 'exact' });
      continue;
    }

    // 한쪽이 다른 쪽을 통째로 품고 있고, 남는 꼬리가 지점 표기뿐일 때만 인정.
    const [long, short] = n.length >= q.length ? [n, q] : [q, n];
    if (long.startsWith(short)) {
      const tail = long.slice(short.length);
      if (!tail || /^[0-9가-힣a-z]{0,10}(점|지점)$/u.test(tail)) {
        hits.push({ store, score: 0.97, how: 'branch' });
        continue;
      }
    }

    // 지점을 뗀 본점 이름이 같으면 같은 브랜드의 다른 지점 — 매칭하지 않는다.
    if (stripBranch(n) === stripBranch(q)) continue;

    // 짧은 이름은 글자 하나만 틀려도 유사도 비율이 확 떨어진다("사케골묵" vs
    // "사케골목" = 0.75). OCR 오독 한 글자는 봐주되, 길이가 같을 때로 한정한다.
    // 글자가 늘거나 줄었다면 오독이 아니라 다른 상호일 가능성이 높다
    // ("사케골목집"은 "사케골목"이 아니다).
    const s = similarity(n, q);
    const misread = n.length === q.length && n.length >= 4 && levenshtein(n, q) <= 1;
    if (s >= FUZZY_MIN || misread) {
      hits.push({ store, score: Math.max(s, misread ? 0.9 : s), how: 'fuzzy' });
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => b.score - a.score);
  const best = hits[0];
  // 1등과 2등이 사실상 같으면 어느 지점인지 알 수 없다 — 승격하지 않는다.
  if (hits.length > 1 && hits[1].score >= best.score - 0.02) return null;
  return best;
}

/**
 * 리뷰/게시물 저장 직전에 부르는 최종 판정.
 * 반환된 burning·reward·storeName 이 권위 있는 값이다.
 */
export async function resolveStore(input: string): Promise<{
  burning: boolean;
  reward: number;
  storeName: string;
  storeId: string;
  category: string;
  region: string;
  address: string;
}> {
  const name = String(input || '').trim();
  const stores = await loadBurningStores();
  const m = matchBurningStore(name, stores);
  if (!m) {
    return {
      burning: false,
      reward: 2,
      storeName: name,
      storeId: '',
      category: '',
      region: '',
      address: '',
    };
  }
  return {
    burning: true,
    reward: m.store.reward,
    // 표기를 등록된 이름으로 통일해야 매장 상세·지도·집계가 한 곳으로 모인다.
    storeName: m.store.name,
    storeId: m.store.id,
    category: m.store.category,
    region: m.store.region,
    // 도장 패스포트의 지역 판별은 시·도만으로는 부족하다("서울"만으로는 구를 못 정한다).
    // 등록 매장의 상세 주소까지 넘겨야 예전처럼 구(區)가 잡힌다.
    address: m.store.address,
  };
}
