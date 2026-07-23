import { canManageStaff, clearCookieHeader, readCookie, readSession } from '../_auth';

// GET  → session identity (name/position/권한).
// POST → log out (clear the session cookie).
export default async function handler(req: any, res: any) {
  if (req.method === 'POST') {
    res.setHeader('Set-Cookie', clearCookieHeader());
    res.status(200).json({ ok: true });
    return;
  }
  const id = readSession(readCookie(req.headers?.cookie));
  res.status(200).json({
    authed: !!id,
    name: id?.name || '',
    position: id?.position || '',
    sup: !!id?.sup,
    canManageStaff: canManageStaff(id),
  });
}
