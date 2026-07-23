import { list, put } from '@vercel/blob';

// v2 datastore = Vercel Blob (private store `peed-v2`). One JSON blob per
// collection under a `v2/` prefix. Token is auto-injected as
// BLOB_READ_WRITE_TOKEN once the store is created + linked to the project.
const token = process.env.BLOB_READ_WRITE_TOKEN;

export function storeConfigured(): boolean {
  return !!token;
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  if (!token) return fallback;
  try {
    const { blobs } = await list({ prefix: key, token, limit: 100 });
    const blob = blobs.find((b) => b.pathname === key);
    if (!blob) return fallback;
    // Private blobs need the token to read. `no-store` avoids a stale CDN copy
    // (critical for a read-modify-write JSON store).
    const opts: RequestInit = {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
    };
    let r = await fetch(`${blob.url}?t=${Date.now()}`, opts);
    if (!r.ok) {
      const dl = (blob as any).downloadUrl;
      if (dl) r = await fetch(`${dl}${dl.includes('?') ? '&' : '?'}t=${Date.now()}`, opts);
    }
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export async function putJSON(key: string, data: unknown): Promise<void> {
  if (!token) throw new Error('store_not_connected');
  await put(key, JSON.stringify(data), {
    access: 'private',
    token,
    contentType: 'application/json',
    allowOverwrite: true,
    addRandomSuffix: false,
  } as any);
}
