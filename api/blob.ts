import { list } from '@vercel/blob';

// Public image proxy — streams an image from the private Blob store so the admin
// and the app can display it without exposing the store token. Only serves the
// v2/img/ prefix.
export default async function handler(req: any, res: any) {
  const k = String(req.query?.k || '');
  if (!k.startsWith('v2/img/')) {
    res.status(400).end();
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(500).end();
    return;
  }
  try {
    const { blobs } = await list({ prefix: k, token, limit: 10 });
    const blob = blobs.find((x) => x.pathname === k);
    if (!blob) {
      res.status(404).end();
      return;
    }
    const r = await fetch(`${blob.url}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      res.status(502).end();
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(buf);
  } catch {
    res.status(500).end();
  }
}
