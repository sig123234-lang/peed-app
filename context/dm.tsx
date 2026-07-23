import { createClient, SupabaseClient } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { imageUriToDataUrl, initialAvatar } from './feed';

// 실시간 채팅 — Supabase Realtime(WebSocket 구독). 1:1 + 그룹(단체톡).
export type DmMessage = {
  id: string;
  from: string;
  fromMe: boolean;
  text: string;
  image?: string;
  ts: number;
};
export type DmMember = { id: string; name: string; handle: string; avatar: any };
export type DmConversation = {
  id: string;
  isGroup: boolean;
  title: string;
  members: DmMember[];
  others: DmMember[];
  last: DmMessage | null;
  unread: number;
};

type DmValue = {
  conversations: DmConversation[];
  messages: Record<string, DmMessage[]>;
  myId: string;
  openConversation: (id: string) => void;
  sendMessage: (id: string, text: string) => void;
  sendImage: (id: string, uri: string) => void;
  markRead: (id: string) => void;
  startDirect: (uid: string) => Promise<string | null>;
  createGroup: (memberIds: string[], title: string) => Promise<string | null>;
  refresh: () => void;
  askNotifyPermission: () => void;
  totalUnread: number;
};

const DmContext = createContext<DmValue | undefined>(undefined);
let seq = 100;
const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

function memberFrom(m: any): DmMember {
  return {
    id: m.id,
    name: m.name || 'PEED 유저',
    handle: m.handle || '@peed',
    avatar: m.avatar ? { uri: m.avatar } : initialAvatar(m.name),
  };
}
// 서버 chatList 항목 → DmConversation.
function toConversation(t: any, myId: string): DmConversation {
  const members: DmMember[] = Array.isArray(t.members) ? t.members.map(memberFrom) : [];
  const last: DmMessage | null = t.last
    ? {
        id: t.last.id,
        from: t.last.from,
        fromMe: t.last.from === myId,
        text: t.last.text || '',
        image: t.last.image || undefined,
        ts: t.last.ts,
      }
    : null;
  return {
    id: t.id,
    isGroup: !!t.isGroup,
    title: t.title || '',
    members,
    others: members.filter((m) => m.id !== myId),
    last,
    unread: t.unread || 0,
  };
}
// Supabase messages 행 → DmMessage.
function rowToMsg(row: any, myId: string): DmMessage {
  return {
    id: row.id,
    from: row.from_user,
    fromMe: row.from_user === myId,
    text: row.body || '',
    image: row.image || undefined,
    ts: new Date(row.created_at).getTime(),
  };
}

export function DmProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [messages, setMessages] = useState<Record<string, DmMessage[]>>({});
  const [myId, setMyId] = useState('');
  const myIdRef = useRef('');
  const clientRef = useRef<SupabaseClient | null>(null);
  const openConvRef = useRef<string | null>(null);
  const tokenRef = useRef({ token: '', at: 0 });
  const conversationsRef = useRef<DmConversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // 서버 목록 새로고침(멤버 프로필·마지막메시지·안읽음).
  const refresh = useCallback(async () => {
    if (!isWeb()) return;
    try {
      const r = await fetch('/api/public?action=chatList', { credentials: 'include' });
      const d = await r.json();
      if (d?.me) {
        myIdRef.current = d.me;
        setMyId(d.me);
      }
      if (Array.isArray(d?.conversations)) {
        setConversations(d.conversations.map((t: any) => toConversation(t, myIdRef.current)));
      }
    } catch {
      // ignore
    }
  }, []);

  // Supabase 클라이언트 초기화(내 쿠키 → JWT 브리지) + 실시간 구독.
  useEffect(() => {
    if (!isWeb()) return;
    let channel: any = null;
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/public?action=chatAuth', { credentials: 'include' });
        const d = await r.json();
        if (!alive || !d?.ok || !d.url || !d.anonKey || !d.token) return;
        myIdRef.current = d.me;
        setMyId(d.me);
        tokenRef.current = { token: d.token, at: Date.now() };

        const client = createClient(d.url, d.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          // 내 서버가 발급한 JWT를 REST/Realtime 인증에 사용(50분마다 갱신).
          accessToken: async () => {
            if (Date.now() - tokenRef.current.at > 50 * 60 * 1000) {
              try {
                const rr = await fetch('/api/public?action=chatAuth', { credentials: 'include' });
                const dd = await rr.json();
                if (dd?.token) {
                  tokenRef.current = { token: dd.token, at: Date.now() };
                  // 실시간 연결도 새 토큰으로 재인증.
                  clientRef.current?.realtime.setAuth(dd.token);
                }
              } catch {
                // keep old token
              }
            }
            return tokenRef.current.token;
          },
          realtime: { params: { eventsPerSecond: 10 } },
        });
        clientRef.current = client;

        // 실시간 WebSocket 을 내 JWT 로 인증(이게 없으면 RLS가 이벤트를 막아 수신 안 됨).
        await client.realtime.setAuth(d.token);

        // 내가 볼 수 있는(=내 대화방) 메시지 INSERT 실시간 수신(RLS로 필터).
        channel = client
          .channel('rt-messages')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload: any) => {
              onIncoming(payload.new);
            }
          )
          .subscribe();

        await refresh();
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
      try {
        if (channel && clientRef.current) clientRef.current.removeChannel(channel);
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 실시간 수신 메시지 처리.
  const onIncoming = useCallback(
    (row: any) => {
      const cid = row.conversation_id;
      const msg = rowToMsg(row, myIdRef.current);
      setMessages((prev) => {
        const arr = prev[cid] || [];
        if (arr.some((m) => m.id === msg.id)) return prev; // dedup
        return { ...prev, [cid]: [...arr, msg] };
      });
      let known = false;
      setConversations((prev) => {
        known = prev.some((c) => c.id === cid);
        return prev.map((c) => {
          if (c.id !== cid) return c;
          const isOpen = openConvRef.current === cid;
          const bump = !msg.fromMe && !isOpen;
          return { ...c, last: msg, unread: bump ? c.unread + 1 : c.unread };
        });
      });
      // 목록에 없는 새 대화(상대가 시작) → 목록 재조회.
      if (!known) refresh();

      // 브라우저 알림 — 내가 보낸 게 아니고, 그 방을 보고 있지 않을 때만.
      if (isWeb() && !msg.fromMe) {
        try {
          const N = (window as any).Notification;
          const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
          const looking = openConvRef.current === cid && visible;
          if (N && N.permission === 'granted' && !looking) {
            const conv = conversationsRef.current.find((c) => c.id === cid);
            const senderName = conv?.members.find((m) => m.id === msg.from)?.name || 'PEED';
            const heading = conv?.isGroup ? conv.title || '그룹' : senderName;
            const bodyTxt = msg.text === '[VOICE_CALL]' ? '📞 음성 통화' : msg.text || '📷 사진';
            const n = new N(heading, {
              body: conv?.isGroup ? `${senderName}: ${bodyTxt}` : bodyTxt,
              tag: cid,
              icon: '/icon.png',
            });
            n.onclick = () => {
              try {
                window.focus();
              } catch {
                // ignore
              }
            };
          }
        } catch {
          // ignore
        }
      }
    },
    [refresh]
  );

  // 브라우저 알림 권한 요청(사용자 제스처에서 호출).
  const askNotifyPermission = useCallback(() => {
    if (!isWeb()) return;
    try {
      const N = (window as any).Notification;
      if (N && N.permission === 'default') N.requestPermission().catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  const openConversation = useCallback(async (id: string) => {
    openConvRef.current = id;
    const client = clientRef.current;
    if (!client || !id) return;
    try {
      const { data } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
        .limit(500);
      if (Array.isArray(data)) {
        setMessages((prev) => ({ ...prev, [id]: data.map((m) => rowToMsg(m, myIdRef.current)) }));
      }
      // 읽음 처리.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      client
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', id)
        .eq('user_id', myIdRef.current)
        .then(() => {});
    } catch {
      // ignore
    }
  }, []);

  const markRead = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    const client = clientRef.current;
    if (!client) return;
    client
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('user_id', myIdRef.current)
      .then(() => {});
  }, []);

  // 전송 후 상대 멤버 벨 알림.
  const notifyOthers = useCallback(
    (id: string, preview: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      fetch('/api/public?action=chatNotify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: conv.members.map((m) => m.id),
          preview,
          isGroup: conv.isGroup,
          title: conv.title,
        }),
      }).catch(() => {});
    },
    [conversations]
  );

  const insertMessage = useCallback(
    async (id: string, body: string, image: string | undefined, tmpId: string) => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const { data } = await client
          .from('messages')
          .insert({ conversation_id: id, from_user: myIdRef.current, body, image: image || null })
          .select()
          .single();
        if (data) {
          const real = rowToMsg(data, myIdRef.current);
          setMessages((prev) => {
            const arr = (prev[id] || []).filter((m) => m.id !== tmpId && m.id !== real.id);
            return { ...prev, [id]: [...arr, real] };
          });
          setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, last: real } : c)));
          notifyOthers(id, body || '📷 사진');
        }
      } catch {
        // ignore
      }
    },
    [notifyOthers]
  );

  const sendMessage = useCallback(
    (id: string, text: string) => {
      const t = text.trim();
      if (!t) return;
      askNotifyPermission(); // 첫 전송 시 알림 권한 요청(제스처)
      const tmpId = `tmp${seq++}`;
      const optimistic: DmMessage = { id: tmpId, from: myIdRef.current, fromMe: true, text: t, ts: Date.now() };
      setMessages((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), optimistic] }));
      insertMessage(id, t, undefined, tmpId);
    },
    [insertMessage, askNotifyPermission]
  );

  const sendImage = useCallback(
    (id: string, uri: string) => {
      const tmpId = `tmp${seq++}`;
      const optimistic: DmMessage = { id: tmpId, from: myIdRef.current, fromMe: true, text: '', image: uri, ts: Date.now() };
      setMessages((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), optimistic] }));
      (async () => {
        try {
          const dataUrl = await imageUriToDataUrl(uri);
          const up = await fetch('/api/public?action=upload', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: dataUrl || uri }),
          }).then((r) => r.json());
          await insertMessage(id, '', up?.url || undefined, tmpId);
        } catch {
          // ignore
        }
      })();
    },
    [insertMessage]
  );

  const startDirect = useCallback(
    async (uid: string): Promise<string | null> => {
      if (!isWeb() || !uid) return null;
      try {
        const r = await fetch('/api/public?action=chatStartDirect', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        });
        const d = await r.json();
        if (d?.ok && d.conversationId) {
          await refresh();
          return d.conversationId;
        }
      } catch {
        // ignore
      }
      return null;
    },
    [refresh]
  );

  const createGroup = useCallback(
    async (memberIds: string[], title: string): Promise<string | null> => {
      if (!isWeb() || memberIds.length < 2) return null;
      try {
        const r = await fetch('/api/public?action=chatCreateGroup', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ members: memberIds, title }),
        });
        const d = await r.json();
        if (d?.ok && d.conversationId) {
          await refresh();
          return d.conversationId;
        }
      } catch {
        // ignore
      }
      return null;
    },
    [refresh]
  );

  const totalUnread = useMemo(
    () => conversations.reduce((a, c) => a + (c.unread || 0), 0),
    [conversations]
  );

  const value = useMemo(
    () => ({
      conversations,
      messages,
      myId,
      openConversation,
      sendMessage,
      sendImage,
      markRead,
      startDirect,
      createGroup,
      refresh,
      askNotifyPermission,
      totalUnread,
    }),
    [conversations, messages, myId, openConversation, sendMessage, sendImage, markRead, startDirect, createGroup, refresh, askNotifyPermission, totalUnread]
  );
  return <DmContext.Provider value={value}>{children}</DmContext.Provider>;
}

export function useDm() {
  const ctx = useContext(DmContext);
  if (!ctx) throw new Error('useDm은 DmProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
