import { getJSON } from './_store';

// Public: active ad banners for the app (admin-managed).
export default async function handler(_req: any, res: any) {
  try {
    const items = await getJSON<any[]>('v2/ads.json', []);
    const now = Date.now();
    const active = (items || []).filter((a) => {
      if (a.status !== 'active') return false;
      // 기간 예약: 시작일 전이거나 종료일 지난 광고는 노출하지 않는다.
      const start = a.startAt ? new Date(a.startAt).getTime() : 0;
      if (start && !Number.isNaN(start) && start > now) return false;
      const end = a.endAt ? new Date(a.endAt).getTime() : 0;
      // 종료일은 그날 끝까지 포함(+1일).
      if (end && !Number.isNaN(end) && now > end + 86400000) return false;
      return true;
    });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.status(200).json({ ads: active });
  } catch {
    res.status(200).json({ ads: [] });
  }
}
