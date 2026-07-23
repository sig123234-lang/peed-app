import crypto from 'crypto';

// Shared admin-auth helpers (underscore prefix → Vercel treats this as a private
// module, not an API route). Sessions are stateless HMAC-signed cookies keyed by
// ADMIN_SECRET — no DB needed for auth.
const SECRET = process.env.ADMIN_SECRET || 'dev-secret';
const COOKIE = 'peed_admin';
const MAX_AGE = 7 * 24 * 3600; // 7 days (seconds)

// 직원 메뉴(직원 관리)를 볼 수 있는 직무 — 관리자/인사 계열만.
export const STAFF_MENU_POSITIONS = ['대표', '관리자', '인사', '인사팀장', '인사매니저'];

export type Identity = {
  name?: string;
  position?: string;
  staffId?: string;
  sup?: boolean; // 슈퍼관리자(admin@peed.co.kr)
};

export function signSession(id: Identity = { sup: true }): string {
  const payload = Buffer.from(
    JSON.stringify({ admin: true, ...id, exp: Date.now() + MAX_AGE * 1000 })
  ).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

// 서명·만료 검증 후 신원 페이로드 반환 (실패 시 null).
export function readSession(token: string | undefined | null): (Identity & { admin: boolean }) | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!obj.admin || (obj.exp && Date.now() >= obj.exp)) return null;
    return obj;
  } catch {
    return null;
  }
}

export function verifySession(token: string | undefined | null): boolean {
  return !!readSession(token);
}

export function canManageStaff(id: Identity | null | undefined): boolean {
  if (!id) return false;
  if (id.sup) return true;
  // 직원 세션(staffId 보유)만 직무로 제한. 그 외(슈퍼관리자·레거시 쿠키)는 전체 접근.
  if (!id.staffId) return true;
  return !!id.position && STAFF_MENU_POSITIONS.includes(id.position);
}

export function cookieHeader(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(cookieStr: string | undefined): string | null {
  if (!cookieStr) return null;
  for (const part of cookieStr.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export function requireAdmin(req: any, res: any): boolean {
  const ok = verifySession(readCookie(req.headers?.cookie));
  if (!ok) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}
