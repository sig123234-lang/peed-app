import type { Room } from 'livekit-client';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

// 음성통화 — LiveKit(WebRTC). 대화방 = LiveKit 방(conv_{id}). 브라우저(웹) 전용.
type VoiceValue = {
  activeConvId: string | null;
  connecting: boolean;
  muted: boolean;
  participantIds: string[];
  startCall: (conversationId: string) => void;
  joinCall: (conversationId: string) => void;
  leave: () => void;
  toggleMute: () => void;
};

const VoiceContext = createContext<VoiceValue | undefined>(undefined);
const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<HTMLAudioElement[]>([]);
  const ringRef = useRef<{ ctx: any; timer: any } | null>(null);

  // 연결음(링백) — 상대가 받기 전까지 재생. 한국식: 440+480Hz, 1초 울림 / 2초 쉼 반복.
  const stopRingback = useCallback(() => {
    const r = ringRef.current;
    if (!r) return;
    try {
      clearInterval(r.timer);
    } catch {
      // ignore
    }
    try {
      r.ctx.close();
    } catch {
      // ignore
    }
    ringRef.current = null;
  }, []);

  const startRingback = useCallback(() => {
    if (!isWeb() || ringRef.current) return;
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx: any = new AC();
      ctx.resume?.();
      const ringOnce = () => {
        const t = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.13, t + 0.05);
        g.gain.setValueAtTime(0.13, t + 0.95);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
        g.connect(ctx.destination);
        [440, 480].forEach((f) => {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          o.connect(g);
          o.start(t);
          o.stop(t + 1.05);
        });
      };
      ringOnce();
      let count = 0;
      const timer = setInterval(() => {
        count += 1;
        if (count > 14) {
          stopRingback(); // 약 45초 후 자동 종료(응답 없음)
          return;
        }
        ringOnce();
      }, 3000);
      ringRef.current = { ctx, timer };
    } catch {
      // ignore
    }
  }, [stopRingback]);

  const cleanup = useCallback(() => {
    stopRingback();
    roomRef.current = null;
    audioEls.current.forEach((el) => el.remove());
    audioEls.current = [];
    setActiveConvId(null);
    setParticipantIds([]);
    setMuted(false);
  }, [stopRingback]);

  const leave = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.disconnect().catch(() => {});
    }
    cleanup();
  }, [cleanup]);

  const join = useCallback(
    async (conversationId: string, announce: boolean) => {
      if (!isWeb() || !conversationId) return;
      if (roomRef.current) leave();
      setConnecting(true);
      startRingback(); // 연결음 재생(상대 받으면 멈춤)
      try {
        const d = await fetch('/api/public?action=voiceToken', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, announce }),
        }).then((r) => r.json());
        if (!d?.ok || !d.token || !d.url) {
          setConnecting(false);
          if (typeof window !== 'undefined' && window.alert) window.alert('통화를 시작할 수 없어요.');
          return;
        }
        // livekit-client는 통화 시작 시에만 로드(초기 번들 가볍게).
        const { Room: RoomClass, RoomEvent, Track } = await import('livekit-client');
        const room = new RoomClass({ adaptiveStream: true });
        roomRef.current = room;

        const updateP = () => {
          if (room.remoteParticipants.size > 0) stopRingback(); // 상대 입장 → 연결음 중지
          setParticipantIds([
            room.localParticipant.identity,
            ...Array.from(room.remoteParticipants.values()).map((p: any) => p.identity),
          ]);
        };

        room.on(RoomEvent.TrackSubscribed, (track: any) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach() as HTMLAudioElement;
            el.style.display = 'none';
            (el as any).autoplay = true;
            document.body.appendChild(el);
            audioEls.current.push(el);
          }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
          try {
            (track.detach() as HTMLAudioElement[]).forEach((el) => el.remove());
          } catch {
            // ignore
          }
        });
        room.on(RoomEvent.ParticipantConnected, updateP);
        room.on(RoomEvent.ParticipantDisconnected, updateP);
        room.on(RoomEvent.Disconnected, () => cleanup());

        await room.connect(d.url, d.token);
        await room.localParticipant.setMicrophoneEnabled(true);
        try {
          await room.startAudio();
        } catch {
          // autoplay — 버튼 탭이 제스처라 보통 통과
        }
        setActiveConvId(conversationId);
        setMuted(false);
        updateP();
      } catch {
        cleanup();
        if (typeof window !== 'undefined' && window.alert) window.alert('통화 연결에 실패했어요.');
      } finally {
        setConnecting(false);
      }
    },
    [leave, cleanup, startRingback, stopRingback]
  );

  const startCall = useCallback((id: string) => void join(id, true), [join]);
  const joinCall = useCallback((id: string) => void join(id, false), [join]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    room.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
    setMuted(next);
  }, [muted]);

  const value = useMemo(
    () => ({ activeConvId, connecting, muted, participantIds, startCall, joinCall, leave, toggleMute }),
    [activeConvId, connecting, muted, participantIds, startCall, joinCall, leave, toggleMute]
  );
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice는 VoiceProvider 안에서만 사용할 수 있어요.');
  return ctx;
}
