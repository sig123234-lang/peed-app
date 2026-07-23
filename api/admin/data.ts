import { requireAdmin } from '../_auth';
import { recordPbEvent } from '../_pb';
import { ensureWiped } from '../_reset';
import { getJSON, putJSON, storeConfigured } from '../_store';

// Generic admin CRUD over R2 JSON collections. One endpoint drives members,
// products, shipments, ads and the finance ledger.
//   GET  /api/admin/data?c=products            → { items }
//   POST /api/admin/data?c=products { action, item?/id? }
const ALLOWED = [
  'stores',
  'members',
  'products',
  'shipments',
  'ads',
  'ledger',
  'campaigns',
  'reports',
  'notices',
  'pb_events',
  'audit',
  'staff',
  'reviews',
];

// Seed data so each section is populated on first open (materialised to R2 on
// the first write).
export const SEEDS: Record<string, any[]> = {
  // 버닝 매장 영업 파이프라인 (CRM). 실 사용 전환으로 더미 제거 — 실제 데이터만.
  stores: [],
  members: [],
  products: [],
  ads: [
    { id: 'ad1', title: '봄맞이 버닝 매장 이벤트', placement: '피드 상단', link: '', status: 'active', startAt: '2026-04-01', endAt: '2026-04-30' },
  ],
  shipments: [],
  // 내부 직원 — 영업 담당 배정 시 선택지로 노출 + 급여는 지출 반영.
  staff: [
    { id: 'staff_hr', name: '이인사', position: '인사', phone: '010-2000-0009', email: 'hr@peed.co.kr', status: '재직', joinedAt: '2026-01-15', loginId: 'hr_lee', password: 'peedhr01', salary: 3500000, memo: '인사·총무' },
    { id: 'rep_park', name: '박영업', position: '영업사원', phone: '010-2000-0001', email: 'park@peed.co.kr', status: '재직', joinedAt: '2026-02-01', loginId: 'sales_park', password: 'peed0001', salary: 3000000, memo: '' },
    { id: 'rep_kim', name: '김영업', position: '영업사원', phone: '010-2000-0002', email: 'kim@peed.co.kr', status: '재직', joinedAt: '2026-02-15', loginId: 'sales_kim', password: 'peed0002', salary: 3000000, memo: '' },
  ],
  ledger: [
    { id: 'l1', type: 'expense', category: '서버·인프라', amount: 120000, memo: 'Vercel · Blob', date: '2026-04-01' },
  ],
  campaigns: [
    { id: 'c1', name: '4월 슈퍼버닝 · 홍대', stores: 10, feePerStore: 500000, prize: '아이폰 17 PRO', reqPb: 150, startAt: '2026-04-01', endAt: '2026-04-30', status: '모집중' },
  ],
  reports: [],
  // PB 원장 — 실제 회원 활동으로만 채워짐(더미 제거).
  pb_events: [],
  notices: [
    { id: 'n1', title: 'PEED 정식 오픈 안내', body: '버닝 매장 방문 후 리뷰로 PB를 모아보세요.', audience: '전체', status: 'active', date: '2026-04-14' },
  ],
};

async function getCollection(name: string): Promise<any[]> {
  await ensureWiped();
  const items = await getJSON<any[]>(`v2/${name}.json`, []);
  if ((!items || items.length === 0) && SEEDS[name]) return SEEDS[name];
  return items || [];
}

// Address → lat/lng via OpenStreetMap Nominatim (free, no key). Used when a
// store is saved without coordinates so approved/active stores get a map pin.
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const query = q.trim();
  if (!query) return null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=kr&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'peed-admin/1.0 (https://peed.co.kr)' } }
    );
    if (!r.ok) return null;
    const arr = await r.json();
    if (Array.isArray(arr) && arr[0]) {
      return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  const c = String(req.query?.c || '');
  if (!ALLOWED.includes(c)) {
    res.status(400).json({ error: 'bad_collection' });
    return;
  }

  if (req.method === 'GET') {
    try {
      res.status(200).json({ items: await getCollection(c), persisted: storeConfigured() });
    } catch (e: any) {
      res.status(500).json({ error: 'load_failed', detail: String(e?.message || e) });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!storeConfigured()) {
      res.status(200).json({ ok: false, error: 'store_not_connected' });
      return;
    }
    let b = req.body;
    if (typeof b === 'string') {
      try {
        b = JSON.parse(b);
      } catch {
        b = {};
      }
    }
    const action = b?.action;
    // PB 지급/회수/보정 — 원장 기록 + 회원 잔액 반영 (기존 /api/admin/pb 통합).
    if (action === 'grant') {
      try {
        const event = await recordPbEvent({
          memberId: b.memberId,
          memberName: b.memberName,
          type: b.type,
          amount: Number(b.amount),
          reason: b.reason,
          storeId: b.storeId,
        });
        res.status(200).json({ ok: true, event });
      } catch (e: any) {
        res.status(500).json({ ok: false, error: 'pb_failed', detail: String(e?.message || e) });
      }
      return;
    }
    try {
      // Auto-geocode only for near-closing/active stores (map pins). Leads skip
      // geocoding so bulk CSV import isn't throttled by Nominatim.
      if (c === 'stores' && b.item && action !== 'delete' && ['계약', '활성'].includes(b.item.stage)) {
        const it = b.item;
        if ((!it.lat || !it.lng) && (it.address || it.region)) {
          const geo = await geocode(`${it.address || ''} ${it.region || ''} 대한민국`);
          if (geo) {
            it.lat = geo.lat;
            it.lng = geo.lng;
          }
        }
      }
      let items = await getCollection(c);
      const labelOf = (o: any) =>
        o?.name || o?.title || o?.storeName || o?.winnerName || o?.category || o?.id || '';
      let auditLabel = '';
      if (action === 'create') {
        const item = {
          ...b.item,
          id:
            b.item?.id ||
            `${c}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
        };
        items = [item, ...items];
        auditLabel = labelOf(item);
      } else if (action === 'update') {
        items = items.map((it: any) => (it.id === b.item?.id ? { ...it, ...b.item } : it));
        auditLabel = labelOf(b.item);
      } else if (action === 'delete') {
        auditLabel = labelOf(items.find((it: any) => it.id === b.id));
        items = items.filter((it: any) => it.id !== b.id);
      } else {
        res.status(400).json({ error: 'bad_action' });
        return;
      }
      await putJSON(`v2/${c}.json`, items);
      // 감사 로그 (best-effort; 실패해도 본 작업엔 영향 없음).
      try {
        const audit = await getJSON<any[]>('v2/audit.json', []);
        audit.unshift({
          id: `au_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          collection: c,
          action,
          itemId: action === 'delete' ? b.id : b.item?.id || '',
          label: auditLabel,
          actor: 'admin@peed.co.kr',
          at: new Date().toISOString(),
        });
        await putJSON('v2/audit.json', audit.slice(0, 500));
      } catch {
        // ignore audit failure
      }
      res.status(200).json({ ok: true, items });
    } catch (e: any) {
      res.status(500).json({ error: 'save_failed', detail: String(e?.message || e) });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
