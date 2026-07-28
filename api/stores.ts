import { ensureWiped } from './_reset';
import { getJSON } from './_store';

// Public: only ACTIVE (paying) burning stores appear on the app map/list.
export default async function handler(_req: any, res: any) {
  try {
    await ensureWiped();
    const stores = await getJSON<any[]>('v2/stores.json', []);
    const active = (stores || [])
      .filter((s) => s.stage === '활성')
      .map((s) => ({
        id: s.id,
        name: s.storeName,
        category: s.category || '버닝 매장',
        location: s.address ? `${s.address} · ${s.region}` : s.region,
        region: s.region,
        lat: s.lat,
        lng: s.lng,
        image: s.image || (Array.isArray(s.photos) ? s.photos[0] : '') || '',
        photos: Array.isArray(s.photos) ? s.photos.slice(0, 8) : [],
        phone: s.contact || '',
        hours: s.hours || '',
        menus: Array.isArray(s.menus) ? s.menus.slice(0, 40) : [],
      }));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.status(200).json({ stores: active });
  } catch {
    res.status(200).json({ stores: [] });
  }
}
