import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/* 웹푸시 구독 훅 — 서비스워커 등록 → 권한 요청 → 구독 → 서버 저장.
   권한은 사용자가 버튼을 눌렀을 때만 요청한다. 페이지 로드 시 자동으로 물으면
   브라우저가 차단하고, 한번 거부되면 되돌리기 어렵다. */

type PushState = {
  supported: boolean;
  configured: boolean;
  permission: 'default' | 'granted' | 'denied';
  subscribed: boolean;
  busy: boolean;
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';
const canPush = () =>
  isWeb() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function usePush() {
  const [state, setState] = useState<PushState>({
    supported: false,
    configured: false,
    permission: 'default',
    subscribed: false,
    busy: false,
  });

  const refresh = useCallback(async () => {
    if (!canPush()) {
      setState((s) => ({ ...s, supported: false }));
      return;
    }
    try {
      const r = await fetch('/api/public?action=pushKey', { credentials: 'include' });
      const d = await r.json();
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState({
        supported: true,
        configured: !!d?.configured,
        permission: Notification.permission as PushState['permission'],
        // 서버에 저장돼 있고 브라우저에도 구독이 살아있어야 '켜짐'이다.
        subscribed: !!sub && !!d?.subscribed,
        busy: false,
      });
    } catch {
      setState((s) => ({ ...s, supported: true, busy: false }));
    }
  }, []);

  useEffect(() => {
    if (!canPush()) return;
    // 서비스워커는 미리 등록해둔다(구독은 사용자가 켤 때).
    navigator.serviceWorker.register('/sw.js').catch(() => {});
    refresh();
  }, [refresh]);

  const enable = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!canPush()) return { ok: false, reason: 'unsupported' };
    setState((s) => ({ ...s, busy: true }));
    try {
      const r = await fetch('/api/public?action=pushKey', { credentials: 'include' });
      const d = await r.json();
      if (!d?.configured || !d?.key) return { ok: false, reason: 'not_configured' };

      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return { ok: false, reason: perm };

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(d.key) as any,
        });
      }
      await fetch('/api/public?action=pushSubscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: String(e?.message || e) };
    } finally {
      setState((s) => ({ ...s, busy: false }));
      refresh();
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    if (!canPush()) return;
    setState((s) => ({ ...s, busy: true }));
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch('/api/public?action=pushUnsubscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } catch {
      // ignore
    } finally {
      setState((s) => ({ ...s, busy: false }));
      refresh();
    }
  }, [refresh]);

  return { ...state, enable, disable, refresh };
}
