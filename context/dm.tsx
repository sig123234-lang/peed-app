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

// 채팅 — 서버(로컬 저장소) + 폴링. 1:1 + 그룹(단체톡).
// 예전에는 Supabase Realtime(WebSocket)으로 서버가 새 메시지를 밀어줬는데, 지금은
// 클라이언트가 짧은 주기로 새 메시지를 물어본다(POLL_MS). 탭이 백그라운드면 주기를
// 늘려서 불필요한 요청을 줄인다.
const POLL_MS = 2000; // 화면을 보고 있을 때
const POLL_MS_HIDDEN = 15000; // 탭이 가려져 있을 때

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
// 서버 messages 행 → DmMessage.
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

const api = (qs: string) => `/api/public?action=${qs}`;
async function postJSON(action: string, body: any): Promise<any> {
  const r = await fetch(api(action), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await r.json();
}

export function DmProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [messages, setMessages] = useState<Record<string, DmMessage[]>>({});
  const [myId, setMyId] = useState('');
  const myIdRef = useRef('');
  const openConvRef = useRef<string | null>(null);
  const conversationsRef = useRef<DmConversation[]>([]);
  const sinceRef = useRef<string>('');
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // 서버 목록 새로고침(멤버 프로필·마지막메시지·안읽음).
  const refresh = useCallback(async () => {
    if (!isWeb()) return;
    try {
      const r = await fetch(api('chatList'), { credentials: 'include' });
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

  // 새 메시지 처리(폴링으로 받은 행). 실시간 구독 콜백과 동일한 역할.
  const onIncoming = useCallback(
    (row: any) => {
      const cid = row.conversation_id;
      const msg = rowToMsg(row, myIdRef.current);
      let isNew = false;
      setMessages((prev) => {
        const arr = prev[cid] || [];
        if (arr.some((m) => m.id === msg.id)) return prev; // dedup(재전달 대비)
        isNew = true;
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
      if (isWeb() && !msg.fromMe && isNew) {
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
  const onIncomingRef = useRef(onIncoming);
  useEffect(() => {
    onIncomingRef.current = onIncoming;
  }, [onIncoming]);

  // 세션 확인 후 폴링 시작. setTimeout 체인이라 응답이 늦어도 요청이 겹치지 않는다.
  useEffect(() => {
    if (!isWeb()) return;
    let alive = true;
    let timer: any = null;

    const tick = async () => {
      if (!alive) return;
      try {
        const r = await fetch(api(`chatPoll&since=${encodeURIComponent(sinceRef.current)}`), {
          credentials: 'include',
        });
        const d = await r.json();
        if (!alive) return;
        if (Array.isArray(d?.messages)) {
          for (const row of d.messages) onIncomingRef.current(row);
        }
        if (d?.now) sinceRef.current = d.now;
      } catch {
        // 네트워크 오류는 무시하고 다음 주기에 재시도.
      }
      if (!alive) return;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      timer = setTimeout(tick, hidden ? POLL_MS_HIDDEN : POLL_MS);
    };

    (async () => {
      try {
        const r = await fetch(api('chatAuth'), { credentials: 'include' });
        const d = await r.json();
        if (!alive || !d?.ok) return;
        myIdRef.current = d.me;
        setMyId(d.me);
        sinceRef.current = d.now || new Date().toISOString();
        await refresh();
        tick();
      } catch {
        // ignore
      }
    })();

    // 탭으로 돌아오면 곧바로 한 번 당겨온다(가려진 동안 주기가 길었으므로).
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!isWeb() || !id) return;
    try {
      const r = await fetch(api(`chatMessages&conversationId=${encodeURIComponent(id)}`), {
        credentials: 'include',
      });
      const d = await r.json();
      if (Array.isArray(d?.messages)) {
        setMessages((prev) => ({
          ...prev,
          [id]: d.messages.map((m: any) => rowToMsg(m, myIdRef.current)),
        }));
      }
      // 읽음 처리.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
      postJSON('chatRead', { conversationId: id }).catch(() => {});
    } catch {
      // ignore
    }
  }, []);

  const markRead = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    if (!isWeb() || !id) return;
    postJSON('chatRead', { conversationId: id }).catch(() => {});
  }, []);

  // 전송 후 상대 멤버 벨 알림.
  const notifyOthers = useCallback(
    (id: string, preview: string) => {
      const conv = conversationsRef.current.find((c) => c.id === id);
      if (!conv) return;
      postJSON('chatNotify', {
        members: conv.members.map((m) => m.id),
        preview,
        isGroup: conv.isGroup,
        title: conv.title,
      }).catch(() => {});
    },
    []
  );

  const insertMessage = useCallback(
    async (id: string, body: string, image: string | undefined, tmpId: string) => {
      try {
        const d = await postJSON('chatSend', { conversationId: id, text: body, image });
        if (d?.ok && d.message) {
          const real = rowToMsg(d.message, myIdRef.current);
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
          const up = await postJSON('upload', { dataUrl: dataUrl || uri });
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
        const d = await postJSON('chatStartDirect', { uid });
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
        const d = await postJSON('chatCreateGroup', { members: memberIds, title });
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
