// LiveKit 음성통화 — 서버는 방 입장 토큰만 발급(WebRTC 미디어는 LiveKit이 처리).
// 서버 독립 운영에서는 기본 비활성화다. LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
// 세 값을 .env 에 넣으면 그대로 다시 켜진다 — 코드는 손댈 필요 없다.
// SDK 는 실제로 켜졌을 때만 로드해서, 비활성 상태에서는 런타임 의존성이 0이 되게 한다.
const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';
export const LIVEKIT_URL = process.env.LIVEKIT_URL || '';

export function livekitConfigured(): boolean {
  return !!API_KEY && !!API_SECRET && !!LIVEKIT_URL;
}

// 대화방(conversation) → LiveKit 방 입장 토큰(음성 발행/구독 권한).
export async function mintVoiceToken(uid: string, room: string, name: string): Promise<string> {
  if (!livekitConfigured()) throw new Error('livekit_not_configured');
  const { AccessToken } = await import('livekit-server-sdk');
  const at = new AccessToken(API_KEY, API_SECRET, { identity: uid, name, ttl: '2h' });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  return await at.toJwt();
}
