import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { routes, runDueDraws, runPrizeUpkeep } from './build/routes.mjs';

// PEED 독립 실행 서버.
// 원래는 Vercel(정적 호스팅 + 서버리스 함수)에 올라가던 앱이라, 여기서 그 두 가지를
// 한 프로세스로 대신한다.
//   1) dist/ 의 Expo 웹 빌드 정적 서빙 + SPA 폴백
//   2) /api/* → api/ 핸들러 호출 (Vercel 의 req/res 모양을 흉내낸 어댑터)
// TLS·도메인·gzip 은 앞단의 Caddy 가 맡는다. 이 서버는 127.0.0.1 만 듣는다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 25 * 1024 * 1024; // 사진이 data URL(base64)로 올라와서 넉넉히 잡는다

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// ── Vercel 핸들러가 기대하는 req/res 모양 맞추기 ──
function adaptRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    const body = JSON.stringify(obj);
    if (!res.hasHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);
    return res;
  };
  res.send = (data) => {
    if (data === undefined || data === null) return res.end();
    const buf = Buffer.isBuffer(data) ? data : typeof data === 'object' ? JSON.stringify(data) : String(data);
    if (typeof data === 'object' && !Buffer.isBuffer(data) && !res.hasHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.setHeader('Content-Length', Buffer.byteLength(buf));
    res.end(buf);
    return res;
  };
  res.redirect = (loc) => {
    res.statusCode = 302;
    res.setHeader('Location', loc);
    res.end();
    return res;
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBody(raw, contentType) {
  if (!raw || !raw.length) return undefined;
  const ct = String(contentType || '');
  const text = raw.toString('utf8');
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  // Vercel 도 타입을 모르면 원문 문자열을 넘긴다. 핸들러들이 문자열이면 JSON.parse 를 시도한다.
  return text;
}

// ── 정적 파일 ──
function serveStatic(res, filePath, { immutable = false } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  // 해시가 박힌 번들(_expo/static/…)은 오래 캐시해도 안전하고, 그 외는 매번 확인시킨다.
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
  fs.createReadStream(filePath).pipe(res);
}

function safeJoin(base, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(base, decoded));
  return target.startsWith(base) ? target : null;
}

const server = http.createServer(async (req, res) => {
  adaptRes(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = url.pathname;

  try {
    // ── /api/* ──
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const query = Object.fromEntries(url.searchParams);

      // vercel.json 리라이트 재현: /api/auth/callback/:provider → /api/auth?cb=1&provider=…
      const cb = pathname.match(/^\/api\/auth\/callback\/([^/]+)$/);
      if (cb) {
        pathname = '/api/auth';
        query.cb = '1';
        query.provider = cb[1];
      }

      const handler = routes[pathname.replace(/\/+$/, '')] || routes[pathname];
      if (!handler) {
        res.status(404).json({ error: 'not_found', path: pathname });
        return;
      }

      req.query = query;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        try {
          req.body = parseBody(await readBody(req), req.headers['content-type']);
        } catch (e) {
          res.status(413).json({ error: 'payload_too_large' });
          return;
        }
      }

      await handler(req, res);
      if (!res.writableEnded) res.end();
      return;
    }

    // ── 정적 파일 ──
    const filePath = safeJoin(DIST, pathname);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveStatic(res, filePath, { immutable: pathname.startsWith('/_expo/static/') });
      return;
    }
    // 확장자 없는 경로(/home, /settings …)는 Expo Router 가 처리 → index.html
    // 확장자가 있는데 없는 파일이면 진짜 404.
    if (path.extname(pathname)) {
      res.status(404).send('Not Found');
      return;
    }
    const index = path.join(DIST, 'index.html');
    if (!fs.existsSync(index)) {
      res.status(503).send('빌드 결과(dist/index.html)가 없습니다. npm run build 를 먼저 실행하세요.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    serveStatic(res, index);
  } catch (e) {
    console.error(`[${req.method} ${req.url}]`, e);
    if (!res.headersSent) res.status(500).json({ error: 'server_error' });
    else if (!res.writableEnded) res.end();
  }
});

// 경품 자동 추첨 — 발표일이 된 상품을 서버가 스스로 추첨한다.
// 서버가 꺼져 있던 동안 발표일이 지났어도, 다시 켜지면 곧바로 따라잡는다.
const DRAW_INTERVAL_MS = 10 * 60 * 1000; // 10분
async function drawTick() {
  try {
    const done = await runDueDraws();
    for (const r of done) {
      console.log(`자동 추첨: ${r.name} — 당첨 ${r.winners}명`);
    }
  } catch (e) {
    console.error('자동 추첨 실패:', e?.message || e);
  }
  // 추첨과 별개로 돌린다 — 추첨이 실패해도 수령·만료 처리는 계속돼야 한다.
  try {
    const r = await runPrizeUpkeep();
    if (r.readied || r.expired || r.warned) {
      console.log(
        `경품 수령 정리: 수령가능 ${r.readied} · 만료임박알림 ${r.warned} · 만료 ${r.expired}`
      );
    }
  } catch (e) {
    console.error('경품 수령 정리 실패:', e?.message || e);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`PEED 서버 http://${HOST}:${PORT}  (정적: ${DIST})`);
  console.log(`데이터: ${process.env.PEED_DATA_DIR || path.join(process.env.HOME || '', 'peed-data')}`);
  console.log(`공개주소: ${process.env.PUBLIC_BASE_URL || '(미설정 — 요청 헤더로 추론)'}`);
  // 기동 직후 한 번 확인하고, 이후 10분마다.
  drawTick();
  setInterval(drawTick, DRAW_INTERVAL_MS).unref();
});
