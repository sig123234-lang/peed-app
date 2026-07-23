import { ensureWiped } from './_reset';
import { getJSON } from './_store';

// Public: active prize products for the app's 경품 page (admin-managed).
export default async function handler(_req: any, res: any) {
  try {
    await ensureWiped();
    const items = await getJSON<any[]>('v2/products.json', []);
    const active = (items || []).filter((p) => p.status !== 'ended');
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.status(200).json({ products: active });
  } catch {
    res.status(200).json({ products: [] });
  }
}
