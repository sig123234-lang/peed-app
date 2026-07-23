import { storeConfigured } from './_store';
import {
  clearUserCookie,
  readUid,
  readUserCookie,
  signUser,
  userCookie,
} from './_session';
import { getUserById, publicUser, updateUser, upsertFromProvider } from './_users';

// 소셜 로그인(카카오·네이버·구글) 단일 라우트.
//   GET  /api/auth?action=login&provider=kakao|naver|google  → 제공자 인증 페이지로 리다이렉트
//   GET  /api/auth?code=..&state=..                          → 콜백(토큰 교환 → 유저 upsert → 세션 쿠키)
//   GET  /api/auth?action=me                                 → 로그인 유저(공개 프로필) or null
//   POST /api/auth?action=logout                             → 로그아웃
//   POST /api/auth?action=profile { name?, handle?, bio?, avatar? } → 내 프로필 수정
// 모든 제공자는 같은 redirect_uri 를 쓰고 provider 는 state 에 담는다.

type Provider = 'kakao' | 'naver' | 'google';

// 옛 NextAuth 앱이 콘솔에 등록해 둔 콜백 형식과 동일하게 맞춰, 콘솔 재설정 없이
// 기존 등록을 재사용한다. (vercel.json 리라이트가 이 경로를 /api/auth로 보냄)
function redirectUri(provider: Provider): string {
  return `https://peed.co.kr/api/auth/callback/${provider}`;
}

function authorizeUrl(provider: Provider, state: string): string {
  const r = encodeURIComponent(redirectUri(provider));
  const st = encodeURIComponent(state);
  if (provider === 'kakao') {
    return `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${process.env.KAKAO_CLIENT_ID}&redirect_uri=${r}&state=${st}`;
  }
  if (provider === 'naver') {
    return `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${process.env.NAVER_CLIENT_ID}&redirect_uri=${r}&state=${st}`;
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${r}&scope=${encodeURIComponent(
    'openid email profile'
  )}&state=${st}`;
}

async function exchangeToken(provider: Provider, code: string, state: string): Promise<string | null> {
  let url = '';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(provider),
  });
  if (provider === 'kakao') {
    url = 'https://kauth.kakao.com/oauth/token';
    body.set('client_id', process.env.KAKAO_CLIENT_ID || '');
    if (process.env.KAKAO_CLIENT_SECRET) body.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  } else if (provider === 'naver') {
    url = 'https://nid.naver.com/oauth2.0/token';
    body.set('client_id', process.env.NAVER_CLIENT_ID || '');
    body.set('client_secret', process.env.NAVER_CLIENT_SECRET || '');
    body.set('state', state);
  } else {
    url = 'https://oauth2.googleapis.com/token';
    body.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
    body.set('client_secret', process.env.GOOGLE_CLIENT_SECRET || '');
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const j: any = await r.json().catch(() => ({}));
  return j.access_token || null;
}

async function fetchProfile(
  provider: Provider,
  token: string
): Promise<{ providerId: string; name?: string; avatar?: string; email?: string } | null> {
  if (provider === 'kakao') {
    const r = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json().catch(() => ({}));
    if (!j.id) return null;
    const acc = j.kakao_account || {};
    const prof = acc.profile || j.properties || {};
    return {
      providerId: String(j.id),
      name: prof.nickname || j.properties?.nickname,
      avatar: prof.profile_image_url || prof.profile_image || j.properties?.profile_image,
      email: acc.email,
    };
  }
  if (provider === 'naver') {
    const r = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j: any = await r.json().catch(() => ({}));
    const p = j.response;
    if (!p?.id) return null;
    return { providerId: String(p.id), name: p.nickname || p.name, avatar: p.profile_image, email: p.email };
  }
  const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await r.json().catch(() => ({}));
  if (!j.id) return null;
  return { providerId: String(j.id), name: j.name, avatar: j.picture, email: j.email };
}

function redirect(res: any, location: string) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

export default async function handler(req: any, res: any) {
  const q = req.query || {};
  const action = String(q.action || '');

  // ── 로그인 시작 → 제공자 인증 페이지 ──
  if (req.method === 'GET' && action === 'login') {
    const provider = String(q.provider || '') as Provider;
    if (!['kakao', 'naver', 'google'].includes(provider)) {
      res.status(400).json({ ok: false, error: 'bad_provider' });
      return;
    }
    const state = Buffer.from(
      JSON.stringify({ provider, n: Math.random().toString(36).slice(2) })
    ).toString('base64url');
    redirect(res, authorizeUrl(provider, state));
    return;
  }

  // ── 현재 로그인 유저 ──
  if (req.method === 'GET' && action === 'me') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const uid = readUid(readUserCookie(req.headers.cookie));
    if (!uid) {
      res.status(200).json({ user: null });
      return;
    }
    const u = await getUserById(uid);
    res.status(200).json({ user: u ? publicUser(u) : null });
    return;
  }

  // ── 로그아웃 ──
  if (req.method === 'POST' && action === 'logout') {
    res.setHeader('Set-Cookie', clearUserCookie());
    res.status(200).json({ ok: true });
    return;
  }

  // ── 내 프로필 수정 ──
  if (req.method === 'POST' && action === 'profile') {
    const uid = readUid(readUserCookie(req.headers.cookie));
    if (!uid) {
      res.status(401).json({ ok: false, error: 'unauthorized' });
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
    const patch: any = {};
    if (typeof b?.name === 'string') patch.name = b.name.slice(0, 20);
    if (typeof b?.bio === 'string') patch.bio = b.bio.slice(0, 80);
    if (typeof b?.avatar === 'string') patch.avatar = b.avatar.slice(0, 400);
    if (typeof b?.handle === 'string') {
      let h = b.handle.replace(/\s/g, '');
      if (!h.startsWith('@')) h = '@' + h.replace(/^@+/, '');
      patch.handle = h.slice(0, 24);
    }
    const u = await updateUser(uid, patch);
    res.status(200).json({ ok: !!u, user: u ? publicUser(u) : null });
    return;
  }

  // ── OAuth 콜백 (code+state) ──
  if (req.method === 'GET' && q.code && q.state) {
    if (!storeConfigured()) {
      redirect(res, '/?login=nostore');
      return;
    }
    let provider: Provider | null =
      q.provider && ['kakao', 'naver', 'google'].includes(String(q.provider))
        ? (String(q.provider) as Provider)
        : null;
    if (!provider) {
      try {
        provider = JSON.parse(Buffer.from(String(q.state), 'base64url').toString()).provider;
      } catch {
        provider = null;
      }
    }
    if (!provider) {
      redirect(res, '/?login=error');
      return;
    }
    try {
      const token = await exchangeToken(provider, String(q.code), String(q.state));
      if (!token) return redirect(res, '/?login=token');
      const prof = await fetchProfile(provider, token);
      if (!prof) return redirect(res, '/?login=profile');
      const user = await upsertFromProvider({
        provider,
        providerId: prof.providerId,
        name: prof.name,
        avatar: prof.avatar,
        email: prof.email,
      });
      res.setHeader('Set-Cookie', userCookie(signUser(user.id)));
      redirect(res, '/?login=ok');
    } catch (e: any) {
      redirect(res, '/?login=error');
    }
    return;
  }

  res.status(400).json({ ok: false, error: 'bad_request' });
}
