import { getJSON, putJSON } from './_store';

// 도장 패스포트 — 유저가 지역을 하나 고르고, 그 지역의 서로 다른 매장에
// 리뷰를 남길 때마다 도장이 하나씩 찍힌다. 7개를 채우면 보너스 PB 를 주고
// 지역 선택이 다시 열린다.
//
// 도장 기준을 '리뷰 건수' 가 아니라 '서로 다른 매장' 으로 둔 이유는, 한 매장에
// 반복해서 쓰는 것만으로 채워지면 동네를 돌아다니게 만드는 의미가 없어서다.

export const PASSPORT_GOAL = 5;
export const PASSPORT_REWARD = 2; // 완주 보너스 PB

export type Passport = {
  region: string; // 진행 중인 지역 키. 빈 문자열이면 아직 안 골랐다.
  stores: string[]; // 이번 지역에서 도장 찍은 매장명
  completed: number; // 지금까지 완주한 횟수
  history: string[]; // 완주한 지역들(최근 것이 앞)
};

type Book = Record<string, Passport>;
const KEY = 'v2/passport.json';

const EMPTY: Passport = { region: '', stores: [], completed: 0, history: [] };

async function all(): Promise<Book> {
  const s = await getJSON<Book>(KEY, {} as Book);
  return s && typeof s === 'object' ? s : ({} as Book);
}

function normalize(p: any): Passport {
  return {
    region: String(p?.region || ''),
    stores: Array.isArray(p?.stores) ? p.stores.map(String) : [],
    completed: Number(p?.completed) || 0,
    history: Array.isArray(p?.history) ? p.history.map(String) : [],
  };
}

export async function get(uid: string): Promise<Passport> {
  if (!uid) return { ...EMPTY };
  const book = await all();
  return book[uid] ? normalize(book[uid]) : { ...EMPTY };
}

/**
 * 지역을 고른다. 진행 중이던 지역과 다르면 도장은 처음부터 다시 모은다 —
 * 모아둔 도장을 지역만 바꿔 이어받으면 '그 지역을 돌았다'는 뜻이 사라진다.
 * 되돌릴 수 없으니 호출부(화면)에서 먼저 확인을 받는다.
 */
export async function pick(uid: string, region: string): Promise<Passport> {
  const book = await all();
  const cur = book[uid] ? normalize(book[uid]) : { ...EMPTY };
  const next: Passport = {
    ...cur,
    region: String(region || ''),
    stores: cur.region === region ? cur.stores : [],
  };
  book[uid] = next;
  await putJSON(KEY, book);
  return next;
}

/**
 * 리뷰 1건 반영. 고른 지역과 리뷰 지역이 같고 처음 가는 매장일 때만 찍힌다.
 * 7개를 채우면 지역을 비워서 다음 지역을 고를 수 있게 한다.
 */
export async function stamp(
  uid: string,
  region: string,
  storeName: string
): Promise<{ added: boolean; count: number; done: boolean; region: string }> {
  const store = String(storeName || '').trim();
  const book = await all();
  const cur = book[uid] ? normalize(book[uid]) : { ...EMPTY };

  const miss = { added: false, count: cur.stores.length, done: false, region: cur.region };
  if (!uid || !store || !cur.region || cur.region !== region) return miss;
  if (cur.stores.includes(store)) return miss;

  cur.stores = [...cur.stores, store];
  const count = cur.stores.length;
  const done = count >= PASSPORT_GOAL;
  const finished = cur.region;

  if (done) {
    cur.completed += 1;
    cur.history = [finished, ...cur.history].slice(0, 50);
    cur.region = ''; // 다음 지역을 고를 수 있게 연다
    cur.stores = [];
  }

  book[uid] = cur;
  await putJSON(KEY, book);
  return { added: true, count, done, region: finished };
}
