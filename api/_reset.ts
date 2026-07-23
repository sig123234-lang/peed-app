import { getJSON, putJSON, storeConfigured } from './_store';

// 실 사용 전환 1회 초기화 — 개발 중 쌓인 더미 회원/경품/버닝매장 데이터를 배포된
// 서버가 첫 요청 때 스스로 비운다. 버전 가드(v2/_wipe.json)로 정확히 1회만 실행되고,
// 이후 실사용자가 넣은 데이터는 절대 건드리지 않는다.
//
// 새 초기화가 필요하면 WIPE_VERSION 을 올리고 WIPE_TARGETS 를 조정한 뒤 배포하면 된다.
const WIPE_VERSION = 1;
const WIPE_TARGETS = ['members', 'products', 'stores', 'pb_events'];
const WIPE_META_KEY = 'v2/_wipe.json';

// 인스턴스 메모리 캐시 — 최초 확인 후에는 매 요청마다 Blob 을 재조회하지 않는다.
let ensured = false;

export async function ensureWiped(): Promise<void> {
  if (ensured || !storeConfigured()) return;
  try {
    const meta = await getJSON<{ v?: number }>(WIPE_META_KEY, {});
    if ((meta?.v || 0) >= WIPE_VERSION) {
      ensured = true;
      return;
    }
    for (const name of WIPE_TARGETS) {
      await putJSON(`v2/${name}.json`, []);
    }
    await putJSON(WIPE_META_KEY, { v: WIPE_VERSION });
    ensured = true;
  } catch {
    // 초기화 실패는 호출한 엔드포인트에 영향 주지 않는다(다음 요청에서 재시도).
  }
}
