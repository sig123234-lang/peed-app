import { getJSON } from './_store';

// Public: active ad banners for the app (admin-managed).
export default async function handler(_req: any, res: any) {
  try {
    const items = await getJSON<any[]>('v2/ads.json', []);
    const active = (items || []).filter((a) => a.status === 'active');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.status(200).json({ ads: active });
  } catch {
    res.status(200).json({ ads: [] });
  }
}
