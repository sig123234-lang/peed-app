import { requireAdmin } from '../_auth';
import { saveDataUrl } from '../_store';

// Admin image upload — base64 data URL 을 받아 로컬 저장소 v2/img/ 에 저장하고
// 프록시 URL(/api/blob?k=…)을 돌려준다.
export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
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
  const dataUrl = String(b?.dataUrl || '');

  try {
    const saved = await saveDataUrl(dataUrl);
    if (!saved) {
      res.status(400).json({ error: 'bad_image' });
      return;
    }
    res.status(200).json(saved);
  } catch (e: any) {
    res.status(500).json({ error: 'upload_failed', detail: String(e?.message || e) });
  }
}
