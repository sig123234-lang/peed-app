import { put } from '@vercel/blob';

import { requireAdmin } from '../_auth';

// Admin image upload — receives a base64 data URL, stores it in the private Blob
// store under v2/img/, returns a proxy URL (/api/blob?k=…) that serves it.
export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'store_not_connected' });
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
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) {
    res.status(400).json({ error: 'bad_image' });
    return;
  }
  const contentType = m[1];
  const buf = Buffer.from(m[2], 'base64');
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const key = `v2/img/${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

  try {
    await put(key, buf, {
      access: 'private',
      token,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    } as any);
    res.status(200).json({ key, url: `/api/blob?k=${encodeURIComponent(key)}` });
  } catch (e: any) {
    res.status(500).json({ error: 'upload_failed', detail: String(e?.message || e) });
  }
}
