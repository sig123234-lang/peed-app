import { AccessToken } from 'livekit-server-sdk';

// LiveKit 음성통화 — 서버는 방 입장 토큰만 발급(WebRTC 미디어는 LiveKit이 처리).
const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';
export const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

export function livekitConfigured(): boolean {
  return !!API_KEY && !!API_SECRET && !!LIVEKIT_URL;
}

// 대화방(conversation) → LiveKit 방 입장 토큰(음성 발행/구독 권한).
export async function mintVoiceToken(uid: string, room: string, name: string): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, { identity: uid, name, ttl: '2h' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  return await at.toJwt();
}
