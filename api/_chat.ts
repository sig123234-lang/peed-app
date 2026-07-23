import { getJSON, putJSON } from './_store';

// 채팅 저장소 — 예전엔 Supabase(Postgres + Realtime)였고, 지금은 서버 로컬 JSON이다.
// 행(row) 필드명은 Supabase 시절 그대로(snake_case) 유지해서 호출측 코드를 건드리지 않는다.
// 실시간 푸시(WebSocket) 대신 클라이언트가 chatPoll 로 주기적으로 물어본다.
const CONVS = 'v2/chat_conversations.json';
const MEMBERS = 'v2/chat_members.json';
const MESSAGES = 'v2/chat_messages.json';

export type ConvRow = {
  id: string;
  is_group: boolean;
  title: string;
  created_by: string;
  created_at: string;
};
export type MemberRow = { conversation_id: string; user_id: string; last_read_at: string };
export type MessageRow = {
  id: string;
  conversation_id: string;
  from_user: string;
  body: string;
  image: string | null;
  created_at: string;
};

// 로컬 저장소라 항상 사용 가능. (호출측의 `supabaseConfigured()` 자리를 그대로 대체)
export function chatConfigured(): boolean {
  return true;
}

const rid = (p: string) =>
  `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// 읽고-고치고-쓰는 구간을 직렬화한다. 채팅 쓰기는 양이 적어 전부 한 줄로 세워도 무방하고,
// 이렇게 해야 두 요청이 겹쳐서 메시지가 사라지는 일이 없다.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

const readConvs = () => getJSON<ConvRow[]>(CONVS, []);
const readMembers = () => getJSON<MemberRow[]>(MEMBERS, []);
const readMessages = () => getJSON<MessageRow[]>(MESSAGES, []);

export async function convIdsForUser(uid: string): Promise<string[]> {
  const members = await readMembers();
  return members.filter((m) => m.user_id === uid).map((m) => m.conversation_id);
}

export async function isMember(uid: string, convId: string): Promise<boolean> {
  const members = await readMembers();
  return members.some((m) => m.user_id === uid && m.conversation_id === convId);
}

export async function membersOf(convId: string): Promise<string[]> {
  const members = await readMembers();
  return members.filter((m) => m.conversation_id === convId).map((m) => m.user_id);
}

// 메시지 삽입. 시스템/통화 메시지도 이 경로를 쓴다.
export async function insertMessage(
  convId: string,
  from: string,
  body: string,
  image?: string
): Promise<MessageRow | null> {
  if (!convId || !from) return null;
  return locked(async () => {
    const messages = await readMessages();
    const row: MessageRow = {
      id: rid('msg'),
      conversation_id: convId,
      from_user: from,
      body: body || '',
      image: image || null,
      created_at: new Date().toISOString(),
    };
    messages.push(row);
    // 무한 증가 방지 — 최근 20000건만 보관.
    await putJSON(MESSAGES, messages.length > 20000 ? messages.slice(-20000) : messages);
    return row;
  });
}

// 두 사람의 기존 1:1 대화 찾기(중복 생성 방지).
export async function findDirect(a: string, b: string): Promise<string | null> {
  const [members, convs] = await Promise.all([readMembers(), readConvs()]);
  const ca = members.filter((m) => m.user_id === a).map((m) => m.conversation_id);
  const cb = new Set(members.filter((m) => m.user_id === b).map((m) => m.conversation_id));
  const common = ca.filter((id) => cb.has(id));
  if (!common.length) return null;
  const hit = convs.find((c) => common.includes(c.id) && !c.is_group);
  return hit ? hit.id : null;
}

export async function createConversation(
  createdBy: string,
  isGroup: boolean,
  title: string,
  memberIds: string[]
): Promise<string | null> {
  return locked(async () => {
    const [convs, members] = await Promise.all([readConvs(), readMembers()]);
    const conv: ConvRow = {
      id: rid('conv'),
      is_group: isGroup,
      title: String(title || '').slice(0, 60),
      created_by: createdBy,
      created_at: new Date().toISOString(),
    };
    convs.push(conv);
    const uniq = Array.from(new Set(memberIds.filter(Boolean)));
    for (const uid of uniq) {
      members.push({
        conversation_id: conv.id,
        user_id: uid,
        last_read_at: new Date(0).toISOString(),
      });
    }
    await putJSON(CONVS, convs);
    await putJSON(MEMBERS, members);
    return conv.id;
  });
}

// 내 대화방 목록 원본(방·멤버·최근 메시지). 프로필 붙이기는 호출측 몫.
export async function listForUser(uid: string): Promise<{
  convs: ConvRow[];
  members: MemberRow[];
  messages: MessageRow[];
}> {
  const [allConvs, allMembers, allMessages] = await Promise.all([
    readConvs(),
    readMembers(),
    readMessages(),
  ]);
  const ids = new Set(
    allMembers.filter((m) => m.user_id === uid).map((m) => m.conversation_id)
  );
  if (!ids.size) return { convs: [], members: [], messages: [] };
  return {
    convs: allConvs.filter((c) => ids.has(c.id)),
    members: allMembers.filter((m) => ids.has(m.conversation_id)),
    // 호출측이 "첫 항목 = 최신"을 가정하므로 created_at 내림차순.
    messages: allMessages
      .filter((m) => ids.has(m.conversation_id))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 600),
  };
}

// 대화방 메시지(오래된 → 최신). since(ISO)가 있으면 그 이후 것만 — 폴링용.
export async function messagesOf(
  convId: string,
  since?: string,
  limit = 500
): Promise<MessageRow[]> {
  const all = await readMessages();
  let rows = all.filter((m) => m.conversation_id === convId);
  if (since) rows = rows.filter((m) => m.created_at > since);
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rows.length > limit ? rows.slice(-limit) : rows;
}

// 내가 참여한 모든 방에서 since 이후의 새 메시지 — 폴링 1회로 전체를 훑는다.
export async function newMessagesForUser(uid: string, since?: string): Promise<MessageRow[]> {
  const [allMembers, allMessages] = await Promise.all([readMembers(), readMessages()]);
  const ids = new Set(
    allMembers.filter((m) => m.user_id === uid).map((m) => m.conversation_id)
  );
  if (!ids.size) return [];
  let rows = allMessages.filter((m) => ids.has(m.conversation_id));
  if (since) rows = rows.filter((m) => m.created_at > since);
  rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return rows.slice(-300);
}

export async function markRead(uid: string, convId: string): Promise<void> {
  await locked(async () => {
    const members = await readMembers();
    const row = members.find((m) => m.user_id === uid && m.conversation_id === convId);
    if (!row) return;
    row.last_read_at = new Date().toISOString();
    await putJSON(MEMBERS, members);
  });
}
