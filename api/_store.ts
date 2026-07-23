import fs from 'fs';
import path from 'path';

// v2 datastore = 서버 로컬 파일시스템. 컬렉션 하나당 JSON 파일 하나를 `v2/` 접두사
// 아래에 둔다(Vercel Blob 시절의 키 구조를 그대로 유지 — 상위 코드는 수정 불필요).
// 저장 위치는 PEED_DATA_DIR 로 바꿀 수 있다.
const ROOT = process.env.PEED_DATA_DIR || path.join(process.env.HOME || '/home/ubuntu', 'peed-data');

export function storeConfigured(): boolean {
  return true;
}

// `..` 이탈을 막고 ROOT 안쪽 경로로만 해석한다.
function safePath(key: string): string {
  const parts = String(key)
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..');
  if (!parts.length) throw new Error('bad_key');
  return path.join(ROOT, ...parts);
}

// 쓰기 직렬화 — 같은 파일에 동시 쓰기가 겹쳐 깨지는 것을 막는다.
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

// temp 파일에 쓴 뒤 rename — 중간에 죽어도 반쯤 쓰인 JSON이 남지 않는다.
function writeAtomic(file: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const file = safePath(key);
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function putJSON(key: string, data: unknown): Promise<void> {
  const file = safePath(key);
  await serialize(async () => {
    writeAtomic(file, JSON.stringify(data));
  });
}

// ── 이미지 등 바이너리 ──
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

export async function putBinary(key: string, buf: Buffer): Promise<void> {
  const file = safePath(key);
  await serialize(async () => {
    writeAtomic(file, buf);
  });
}

export async function getBinary(
  key: string
): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const file = safePath(key);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const ext = path.extname(file).toLowerCase();
    return { buf: fs.readFileSync(file), contentType: MIME[ext] || 'application/octet-stream' };
  } catch {
    return null;
  }
}

// data URL → v2/img/ 에 저장하고 프록시 URL 반환. (업로드 경로가 여러 곳이라 여기로 모은다)
export async function saveDataUrl(dataUrl: string): Promise<{ key: string; url: string } | null> {
  const m = String(dataUrl).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const contentType = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const key = `v2/img/${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  await putBinary(key, buf);
  return { key, url: `/api/blob?k=${encodeURIComponent(key)}` };
}
