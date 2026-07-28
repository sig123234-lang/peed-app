import { ensureWiped } from './_reset';
import { getJSON } from './_store';

// Public: active prize products for the app's 경품 page (admin-managed).
export default async function handler(_req: any, res: any) {
  try {
    await ensureWiped();
    const items = await getJSON<any[]>('v2/products.json', []);
    const now = Date.now();
    const active = (items || []).filter((p) => {
      if (p.status === 'ended') return false;
      // 예약 등록: 노출 시작일(goLiveAt)이 아직 안 됐으면 앱에 안 보인다.
      const go = p.goLiveAt ? new Date(p.goLiveAt).getTime() : 0;
      if (go && !Number.isNaN(go) && go > now) return false;
      return true;
    });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.status(200).json({ products: active });
  } catch {
    res.status(200).json({ products: [] });
  }
}
