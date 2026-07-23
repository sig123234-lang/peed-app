import { getJSON, putJSON } from './_store';

// Blob에 저장되는 소비자 유저. 소셜(provider+providerId)로 식별.
export type User = {
  id: string; // 내부 uid
  provider: 'kakao' | 'naver' | 'google';
  providerId: string;
  name: string;
  handle: string; // @아이디
  avatar: string; // 프로필 사진 URL (없으면 '')
  email: string;
  bio: string;
  pb: number; // 서버 권위 PB 잔액
  createdAt: number;
};

const KEY = 'v2/users.json';

function rid(n = 6): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

async function all(): Promise<User[]> {
  return getJSON<User[]>(KEY, []);
}

export async function findByProvider(provider: string, providerId: string): Promise<User | null> {
  const users = await all();
  return users.find((u) => u.provider === provider && u.providerId === providerId) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await all();
  return users.find((u) => u.id === id) || null;
}

// 소셜 로그인 성공 시 upsert. 신규면 생성(핸들 자동), 기존이면 이름/사진 갱신.
export async function upsertFromProvider(input: {
  provider: User['provider'];
  providerId: string;
  name?: string;
  avatar?: string;
  email?: string;
}): Promise<User> {
  const users = await all();
  const idx = users.findIndex(
    (u) => u.provider === input.provider && u.providerId === input.providerId
  );
  if (idx >= 0) {
    const u = users[idx];
    if (input.avatar && !u.avatar) u.avatar = input.avatar;
    if (input.name && !u.name) u.name = input.name;
    if (input.email && !u.email) u.email = input.email;
    users[idx] = u;
    await putJSON(KEY, users);
    return u;
  }
  const base = (input.name || 'peeduser').replace(/[^0-9a-zA-Z가-힣]/g, '').slice(0, 10) || 'peed';
  const handle = `@${base}${rid(3)}`;
  const user: User = {
    id: `u_${Date.now().toString(36)}_${rid(4)}`,
    provider: input.provider,
    providerId: input.providerId,
    name: input.name || 'PEED 유저',
    handle,
    avatar: input.avatar || '',
    email: input.email || '',
    bio: '',
    pb: 0,
    createdAt: Date.now(),
  };
  users.push(user);
  await putJSON(KEY, users);
  return user;
}

export async function updateUser(id: string, patch: Partial<User>): Promise<User | null> {
  const users = await all();
  const idx = users.findIndex((u) => u.id === id);
  if (idx < 0) return null;
  users[idx] = { ...users[idx], ...patch, id: users[idx].id }; // id 불변
  await putJSON(KEY, users);
  return users[idx];
}

// 공개 프로필(민감정보 제외).
export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    handle: u.handle,
    avatar: u.avatar,
    bio: u.bio,
    pb: u.pb,
    provider: u.provider,
  };
}
