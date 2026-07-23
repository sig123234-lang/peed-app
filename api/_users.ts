import { getJSON, putJSON } from './_store';

// v2/users.json 은 회원의 단일 원천(single source of truth)이다.
// 앱 소셜 가입자와 어드민이 만든 회원(일반·기업)이 같은 배열에 함께 산다.
//   - 소셜 가입자: provider = 'kakao' | 'naver' | 'google'
//   - 어드민 생성: provider = '' (로그인ID/비밀번호로 식별)
// 예전에는 users.json(앱)과 members.json(어드민)이 따로 있어서 어드민에서
// 앱 가입자가 보이지 않고 PB 잔액도 두 벌로 갈렸다. 그 둘을 여기로 합쳤다.
export type MemberType = '일반' | '기업';

export type User = {
  id: string; // 내부 uid
  provider: 'kakao' | 'naver' | 'google' | '';
  providerId: string;
  name: string;
  handle: string; // @아이디
  avatar: string; // 프로필 사진 URL (없으면 '')
  email: string;
  bio: string;
  pb: number; // 서버 권위 PB 잔액
  createdAt: number;

  // ── 어드민 관리 필드 (구 members.json 에서 흡수) ──
  memberType: MemberType; // 일반 | 기업
  status: string; // active | suspended
  role: string; // user | vip | admin
  joinedAt: string; // YYYY-MM-DD
  referralCode: string; // 친구 초대 코드
  referralCount: number;

  // 기업 회원 전용 필드(상호·사업자번호·담당자·연결 매장·로그인ID 등)는
  // 어드민 폼이 자유롭게 늘어나므로 고정 스키마로 묶지 않는다.
  [k: string]: any;
};

/** 어느 경로로 만들어졌든 회원 레코드가 갖춰야 할 기본값을 채운다. */
export function withDefaults(u: any): User {
  return {
    memberType: '일반',
    status: 'active',
    role: 'user',
    provider: '',
    providerId: '',
    name: '',
    handle: '',
    avatar: '',
    email: '',
    bio: '',
    referralCode: '',
    referralCount: 0,
    joinedAt: new Date(u?.createdAt || Date.now()).toISOString().slice(0, 10),
    createdAt: Date.now(),
    ...u,
    // 잔액은 항상 숫자로 정규화한다(문자열 "0" 이 들어와도 계산이 깨지지 않게).
    pb: Number(u?.pb) || 0,
  } as User;
}

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
  const user: User = withDefaults({
    id: `u_${Date.now().toString(36)}_${rid(4)}`,
    provider: input.provider,
    providerId: input.providerId,
    name: input.name || 'PEED 유저',
    handle,
    avatar: input.avatar || '',
    email: input.email || '',
    bio: '',
    pb: 0,
    // 소셜 가입자도 어드민 회원 목록에 그대로 뜨도록 관리 필드를 채워서 만든다.
    memberType: '일반',
    status: 'active',
    role: 'user',
    referralCode: `P${rid(5).toUpperCase()}`,
    createdAt: Date.now(),
  });
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
