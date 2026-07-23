import crypto from 'crypto';

// Supabase 브리지 — 내 쿠키 로그인(uid)을 Supabase가 이해하는 JWT로 발급하고,
// 서버 쓰기(대화방/그룹 생성)는 service_role 로 REST 직접 호출한다.
const URL = process.env.SUPABASE_URL || '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

export function supabaseConfigured(): boolean {
  return !!URL && !!SERVICE && !!JWT_SECRET;
}

// 내 uid → Supabase RLS 용 JWT(HS256, sub=uid, role=authenticated).
export function signSupabaseJWT(uid: string, ttlSec = 3600): string {
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: uid, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + ttlSec });
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function rest(path: string, opts: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: r.ok, status: r.status, data };
}

const enc = (s: string) => encodeURIComponent(s);

export async function convIdsForUser(uid: string): Promise<string[]> {
  const r = await rest(`conversation_members?user_id=eq.${enc(uid)}&select=conversation_id`);
  return Array.isArray(r.data) ? r.data.map((x: any) => x.conversation_id) : [];
}

export async function isMember(uid: string, convId: string): Promise<boolean> {
  const r = await rest(
    `conversation_members?user_id=eq.${enc(uid)}&conversation_id=eq.${enc(convId)}&select=user_id&limit=1`
  );
  return Array.isArray(r.data) && r.data.length > 0;
}

export async function membersOf(convId: string): Promise<string[]> {
  const r = await rest(`conversation_members?conversation_id=eq.${enc(convId)}&select=user_id`);
  return Array.isArray(r.data) ? r.data.map((x: any) => x.user_id) : [];
}

// 시스템/통화 메시지 삽입(서비스롤). 실시간으로 대화 참가자에게 전달됨.
export async function insertMessage(
  convId: string,
  from: string,
  body: string,
  image?: string
): Promise<any> {
  const r = await rest('messages', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: convId, from_user: from, body, image: image || null }),
  });
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

// 두 사람의 기존 1:1 대화 찾기(중복 생성 방지).
export async function findDirect(a: string, b: string): Promise<string | null> {
  const [ca, cb] = await Promise.all([convIdsForUser(a), convIdsForUser(b)]);
  const common = ca.filter((id) => cb.includes(id));
  if (!common.length) return null;
  const r = await rest(`conversations?id=in.(${common.join(',')})&is_group=eq.false&select=id&limit=1`);
  return Array.isArray(r.data) && r.data[0] ? r.data[0].id : null;
}

export async function createConversation(
  createdBy: string,
  isGroup: boolean,
  title: string,
  memberIds: string[]
): Promise<string | null> {
  const c = await rest('conversations', {
    method: 'POST',
    body: JSON.stringify({ is_group: isGroup, title: title.slice(0, 60), created_by: createdBy }),
  });
  const id = Array.isArray(c.data) && c.data[0] ? c.data[0].id : null;
  if (!id) return null;
  const uniq = Array.from(new Set(memberIds.filter(Boolean)));
  await rest('conversation_members', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(uniq.map((uid) => ({ conversation_id: id, user_id: uid }))),
  });
  return id;
}

// 내 대화방 목록(멤버·마지막메시지·안읽음). 프로필은 호출측에서 Blob users로 붙인다.
export async function listForUser(uid: string): Promise<{
  convs: any[];
  members: any[];
  messages: any[];
}> {
  const ids = await convIdsForUser(uid);
  if (!ids.length) return { convs: [], members: [], messages: [] };
  const list = ids.join(',');
  const [convs, members, messages] = await Promise.all([
    rest(`conversations?id=in.(${list})&select=id,is_group,title,created_at`),
    rest(`conversation_members?conversation_id=in.(${list})&select=conversation_id,user_id,last_read_at`),
    rest(
      `messages?conversation_id=in.(${list})&select=id,conversation_id,from_user,body,image,created_at&order=created_at.desc&limit=600`
    ),
  ]);
  return {
    convs: Array.isArray(convs.data) ? convs.data : [],
    members: Array.isArray(members.data) ? members.data : [],
    messages: Array.isArray(messages.data) ? messages.data : [],
  };
}
