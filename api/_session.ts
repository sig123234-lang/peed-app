import crypto from 'crypto';

// 소비자(일반 유저) 세션 — 어드민 세션과 별개 쿠키. HMAC 서명 쿠키에 uid만 담는다.
const SECRET =
  process.env.NEXTAUTH_SECRET || process.env.ADMIN_SECRET || 'peed-dev-secret';
const COOKIE = 'peed_uid';
const MAX_AGE = 60 * 60 * 24 * 60; // 60일

export function signUser(uid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: Date.now() + MAX_AGE * 1000 })
  ).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readUid(token: string | undefined | null): string | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (obj.exp && Date.now() >= obj.exp) return null;
    return typeof obj.uid === 'string' ? obj.uid : null;
  } catch {
    return null;
  }
}

export function userCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}
export function clearUserCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export function readUserCookie(cookieStr: string | undefined): string | null {
  if (!cookieStr) return null;
  for (const part of cookieStr.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}
