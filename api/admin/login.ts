import crypto from 'crypto';

import { cookieHeader, signSession } from '../_auth';
import { getJSON } from '../_store';
import { SEEDS } from './data';

// v2 admin credentials. The id is not secret; the password is stored ONLY as a
// salted SHA-256 hash (never plaintext in the repo). To change the password,
// recompute:  sha256(newPassword + SALT).
const ADMIN_LOGIN_ID = 'admin@peed.co.kr';
const SALT = 'peed_admin_salt_v2';
const PASSWORD_HASH =
  'f3db5265a1f5c267f9b39ca5cd019814b37a5ff83877842e9468435f57d8b5ef';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const id = String(body?.id ?? '');
  const password = String(body?.password ?? '');
  const hash = crypto.createHash('sha256').update(password + SALT).digest('hex');

  const idOk = id === ADMIN_LOGIN_ID;
  const pwOk =
    hash.length === PASSWORD_HASH.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(PASSWORD_HASH));

  if (idOk && pwOk) {
    res.setHeader('Set-Cookie', cookieHeader(signSession({ sup: true, name: '관리자', position: '대표' })));
    res.status(200).json({ ok: true, name: '관리자', position: '대표' });
    return;
  }

  // 직원 로그인 — 발급된 로그인 ID + 비밀번호 (재직자만).
  try {
    let staff = await getJSON<any[]>('v2/staff.json', []);
    if (!staff.length && Array.isArray(SEEDS.staff)) staff = SEEDS.staff;
    const norm = (s: any) => String(s || '').trim().toLowerCase();
    const s = staff.find(
      (x) => norm(x.loginId) === norm(id) && String(x.password || '') === password && x.status !== '퇴사'
    );
    if (s) {
      res.setHeader(
        'Set-Cookie',
        cookieHeader(signSession({ staffId: s.id, name: s.name, position: s.position }))
      );
      res.status(200).json({ ok: true, name: s.name, position: s.position });
      return;
    }
  } catch {
    // fall through to 401
  }

  res.status(401).json({ error: 'invalid_credentials' });
}
