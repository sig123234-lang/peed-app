import { getJSON, putJSON } from './_store';

// 구(區) 도장 — 유저별 각 구에서 적립된 리뷰 수. 같은 구 5개마다 +1 PB 보너스.
type Store = Record<string, Record<string, number>>;
const KEY = 'v2/district_stats.json';
export const DISTRICT_GOAL = 5;

async function all(): Promise<Store> {
  const s = await getJSON<Store>(KEY, {} as Store);
  return s && typeof s === 'object' ? s : ({} as Store);
}

export async function statsFor(uid: string): Promise<Record<string, number>> {
  const s = await all();
  return s[uid] || {};
}

// 리뷰 1건 반영 → 새 카운트 + 이번에 5의 배수를 달성했는지(=보너스).
export async function bump(uid: string, district: string): Promise<{ count: number; bonus: boolean }> {
  const s = await all();
  s[uid] = s[uid] || {};
  s[uid][district] = (s[uid][district] || 0) + 1;
  const count = s[uid][district];
  await putJSON(KEY, s);
  return { count, bonus: count % DISTRICT_GOAL === 0 };
}

// 텍스트에서 "○○구" 추출(주소/지역/매장명 기준). 경계 뒤에 오는 것만.
export function extractDistrict(text: string): string {
  const m = String(text || '').match(/([가-힣]{2,4}구)(?=[\s·,]|$)/);
  return m ? m[1] : '';
}
