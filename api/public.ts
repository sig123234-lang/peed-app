import { put } from '@vercel/blob';

import { SEEDS } from './admin/data';
import { addBite, allBites } from './_bites';
import * as districts from './_districts';
import * as entries from './_entries';
import * as notifs from './_notifs';
import { recordPbEvent } from './_pb';
import * as lk from './_livekit';
import * as reservations from './_reservations';
import * as stamps from './_stamps';
import * as sb from './_supabase';
import {
  addComment as addPostComment,
  allPosts,
  createPost,
  incSaveCount,
  removePost,
  ServerPost,
  updatePost,
} from './_posts';
import * as saves from './_saves';
import { readUid, readUserCookie } from './_session';
import * as social from './_social';
import { getJSON, putJSON, storeConfigured } from './_store';
import { getUserById, User } from './_users';
import * as wallet from './_wallet';

// 공개 액션 라우터 — 여러 소비자 엔드포인트를 하나의 함수로 묶어 함수 수를 아낀다.
//   GET  /api/public?action=feed                        공개 피드(전체 유저의 공개 게시물)
//   GET  /api/public?action=userPosts&uid=..            특정 유저 게시물(본인이면 비공개 포함)
//   POST /api/public?action=createPost { ...post }      게시물 작성(로그인 필요, 이미지 업로드 포함)
//   POST /api/public?action=editPost   { id, caption?, isPrivate? }
//   POST /api/public?action=deletePost { id }
//   POST /api/public?action=comment    { id, text }
//   POST /api/public?action=upload     { dataUrl }      이미지 업로드 → URL
//   POST /api/public?action=apply   { storeName, region, contact, ... }  버닝 매장 신청(리드)
//   POST /api/public?action=invite  { code, newHandle? }                 초대코드 → 초대자 PB 지급
const norm = (s: any) => String(s || '').trim().replace(/^@/, '').toLowerCase();
const WELCOME_PB = 10;
const REFERRAL_BONUS = 10;

function parseBody(req: any): any {
  let b = req.body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = {};
    }
  }
  return b || {};
}

async function handleApply(b: any, res: any) {
  const storeName = String(b?.storeName || '').trim();
  const region = String(b?.region || '').trim();
  const contact = String(b?.contact || '').trim();
  if (!storeName || !region || !contact) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const lead = {
    id: `st_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    storeName,
    category: String(b?.category || '').trim(),
    region,
    address: String(b?.address || '').trim(),
    contact,
    ownerName: String(b?.applicant || '').trim(),
    salesRep: '',
    stage: '리드',
    monthlyFee: 200000,
    paymentStatus: '미결제',
    source: '앱신청',
    nextAction: '첫 컨택',
    nextActionDate: '',
    activities: [{ id: `act_${now.toString(36)}`, date: today, note: '앱으로 매장 신청 접수' }],
    note: String(b?.note || '').trim(),
    createdAt: now,
  };
  const stores = await getJSON<any[]>('v2/stores.json', []);
  stores.unshift(lead);
  await putJSON('v2/stores.json', stores);
  res.status(200).json({ ok: true, id: lead.id });
}

async function handleInvite(b: any, res: any) {
  const code = norm(b?.code);
  const newHandle = norm(b?.newHandle);
  if (!code) {
    res.status(400).json({ ok: false, error: 'no_code' });
    return;
  }
  let members = await getJSON<any[]>('v2/members.json', []);
  if (!members.length && Array.isArray(SEEDS.members)) {
    members = SEEDS.members;
    await putJSON('v2/members.json', members);
  }
  const inviter = members.find(
    (m) => (m.referralCode && norm(m.referralCode) === code) || norm(m.handle) === code
  );
  if (!inviter) {
    res.status(200).json({ ok: false, error: 'invalid_code' });
    return;
  }
  if (newHandle && norm(inviter.handle) === newHandle) {
    res.status(200).json({ ok: false, error: 'self' });
    return;
  }
  const refs = await getJSON<any[]>('v2/referrals.json', []);
  if (newHandle && refs.some((r) => r.inviterId === inviter.id && norm(r.newHandle) === newHandle)) {
    res.status(200).json({ ok: false, error: 'already_used' });
    return;
  }
  await recordPbEvent({
    memberId: inviter.id,
    memberName: inviter.name,
    type: 'issue',
    amount: REFERRAL_BONUS,
    reason: `친구 초대 보상${newHandle ? ` (@${newHandle})` : ''}`,
  });
  refs.unshift({
    id: `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    inviterId: inviter.id,
    inviter: inviter.referralCode || inviter.handle || '',
    newHandle: newHandle || '',
    at: new Date().toISOString(),
  });
  await putJSON('v2/referrals.json', refs.slice(0, 2000));
  const mem2 = await getJSON<any[]>('v2/members.json', []);
  const idx = mem2.findIndex((m) => m.id === inviter.id);
  if (idx >= 0) {
    mem2[idx].referralCount = (Number(mem2[idx].referralCount) || 0) + 1;
    await putJSON('v2/members.json', mem2);
  }
  res.status(200).json({
    ok: true,
    inviterName: inviter.name,
    inviterHandle: inviter.handle,
    welcomePb: WELCOME_PB,
    referralBonus: REFERRAL_BONUS,
  });
}

// ── 게시물(SNS) ──────────────────────────────────────────────────────────────
function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return '어제';
  if (d < 7) return `${d}일 전`;
  return new Date(ts).toISOString().slice(0, 10).replace(/-/g, '.');
}

// 서버 게시물 → 클라이언트 피드 형태(작성자 공개 프로필 임베드).
function toClientPost(p: ServerPost, authorMap: Record<string, User>, savedSet?: Set<string>) {
  const u = authorMap[p.authorId];
  return {
    id: p.id,
    author: {
      id: p.authorId,
      name: u?.name || 'PEED 유저',
      handle: u?.handle || '@peed',
      avatar: u?.avatar || '',
    },
    kind: p.kind,
    store: p.store,
    category: p.category,
    location: p.location,
    image: p.image,
    images: p.images || [],
    rating: p.rating,
    caption: p.caption,
    tags: p.tags || [],
    people: p.people,
    price: p.price,
    saved: savedSet ? savedSet.has(p.id) : false,
    saveCount: p.saveCount || 0,
    comments: p.comments || [],
    timeLabel: relTime(p.createdAt),
    createdAt: p.createdAt,
    isBurning: p.isBurning,
    earnedPb: p.earnedPb,
    isPrivate: p.isPrivate,
  };
}

async function authorMapFor(posts: ServerPost[]): Promise<Record<string, User>> {
  const ids = Array.from(new Set(posts.map((p) => p.authorId)));
  const users = await getJSON<User[]>('v2/users.json', []);
  const map: Record<string, User> = {};
  for (const u of users) if (ids.includes(u.id)) map[u.id] = u;
  return map;
}

// data URL 이미지를 Blob(v2/img/)에 저장하고 프록시 URL 반환.
async function uploadDataUrl(dataUrl: string): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return '';
  const m = String(dataUrl).match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return '';
  const contentType = m[1];
  const buf = Buffer.from(m[2], 'base64');
  const ext = contentType.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const key = `v2/img/${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  await put(key, buf, {
    access: 'private',
    token,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  } as any);
  return `/api/blob?k=${encodeURIComponent(key)}`;
}

// 이미지 입력(데이터URL 또는 기존 URL 혼합) → 저장된 URL 배열.
async function resolveImages(raw: any): Promise<string[]> {
  const arr: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: string[] = [];
  for (const im of arr.slice(0, 5)) {
    if (typeof im !== 'string' || !im) continue;
    if (im.startsWith('data:')) {
      const u = await uploadDataUrl(im);
      if (u) out.push(u);
    } else if (im.startsWith('/api/blob') || im.startsWith('http')) {
      out.push(im);
    }
  }
  return out;
}

// 인스타그램식 추천 피드 — 팔로우(친구) > 친구의 친구 > 인기계정 > 랜덤 발견을
// 점수로 섞는다. 랜덤 가중이 커서 새로고침마다 다양하게(완전 모르는 사람도) 뜬다.
async function handleFeed(uid: string, res: any) {
  const [posts, edges, users, mySaves] = await Promise.all([
    allPosts(),
    social.allEdges(),
    getJSON<User[]>('v2/users.json', []),
    uid ? saves.savedIds(uid) : Promise.resolve([] as string[]),
  ]);
  const savedSet = new Set(mySaves);
  const pub = posts.filter((p) => !p.isPrivate);
  const userMap: Record<string, User> = {};
  for (const u of users) userMap[u.id] = u;

  const myFollowing = new Set<string>(uid ? social.followingIds(edges, uid) : []);
  // 친구의 친구(2촌) 집합
  const fof = new Set<string>();
  if (uid) {
    for (const f of myFollowing) {
      for (const g of social.followingIds(edges, f)) {
        if (g !== uid && !myFollowing.has(g)) fof.add(g);
      }
    }
  }
  const followerCountOf: Record<string, number> = {};
  for (const e of edges) followerCountOf[e.b] = (followerCountOf[e.b] || 0) + 1;

  const now = Date.now();
  const scored = pub.map((p) => {
    const a = p.authorId;
    let affinity = 1; // 모르는 사람(발견)
    if (uid && a === uid) affinity = 3; // 내 글도 가끔
    else if (myFollowing.has(a)) affinity = 4; // 팔로우(친구)
    else if (fof.has(a)) affinity = 2.5; // 친구의 친구
    const popularity = Math.min(followerCountOf[a] || 0, 50) / 50; // 0..1 (팔로워 많은 사람 가끔)
    const ageH = (now - p.createdAt) / 3600000;
    const recency = Math.max(0, 1 - ageH / 168); // 최근 1주 가중
    const rnd = Math.random();
    const score = affinity * 2 + popularity * 1.2 + recency * 1.5 + rnd * 3;
    return { p, score };
  });
  scored.sort((x, y) => y.score - x.score);
  res.status(200).json({ ok: true, posts: scored.map((s) => toClientPost(s.p, userMap, savedSet)) });
}

// ── 팔로우 ──
async function handleFollowInfo(uid: string, targetId: string, res: any) {
  const edges = await social.allEdges();
  const target = targetId || uid;
  res.status(200).json({
    ok: true,
    followingIds: uid ? social.followingIds(edges, uid) : [],
    counts: {
      following: target ? social.followingIds(edges, target).length : 0,
      followers: target ? social.followerIds(edges, target).length : 0,
    },
    isFollowing: uid && target ? edges.some((e) => e.a === uid && e.b === target) : false,
  });
}

// 팔로워/팔로잉 목록 — 상대 프로필 임베드 + 내 팔로잉 상태(버튼용).
async function handleFollowList(uid: string, targetId: string, mode: 'followers' | 'following', res: any) {
  if (!targetId) {
    res.status(200).json({ ok: true, users: [] });
    return;
  }
  const [users, edges] = await Promise.all([
    getJSON<User[]>('v2/users.json', []),
    social.allEdges(),
  ]);
  const ids =
    mode === 'followers' ? social.followerIds(edges, targetId) : social.followingIds(edges, targetId);
  const myFollowing = new Set<string>(uid ? social.followingIds(edges, uid) : []);
  const map: Record<string, User> = {};
  for (const u of users) map[u.id] = u;
  const list = ids
    .map((id) => map[id])
    .filter(Boolean)
    .map((u) => ({
      id: u.id,
      name: u.name,
      handle: u.handle,
      avatar: u.avatar,
      isFollowing: myFollowing.has(u.id),
      isMe: uid === u.id,
    }));
  res.status(200).json({ ok: true, users: list });
}

async function handleFollow(uid: string, b: any, on: boolean, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const t = String(b.targetId || '');
  if (!t || t === uid) {
    res.status(400).json({ ok: false, error: 'bad_target' });
    return;
  }
  if (on) {
    await social.follow(uid, t);
    const me = await getUserById(uid);
    await notifs.notify(t, {
      type: 'follow',
      title: '새 팔로워',
      body: `${me?.name || '누군가'}님이 회원님을 팔로우하기 시작했어요.`,
      actorId: uid,
    });
  } else {
    await social.unfollow(uid, t);
  }
  res.status(200).json({ ok: true });
}

// ── DM ──
function toPartner(id: string, map: Record<string, User>) {
  const u = map[id];
  return {
    id,
    name: u?.name || 'PEED 유저',
    handle: u?.handle || '@peed',
    avatar: u?.avatar || '',
  };
}

// Supabase 실시간 채팅 브리지: 클라가 이 토큰으로 Supabase에 직접 연결(구독/전송).
async function handleChatAuth(uid: string, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!sb.supabaseConfigured()) {
    res.status(500).json({ ok: false, error: 'supabase_not_configured' });
    return;
  }
  res.status(200).json({
    ok: true,
    me: uid,
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    token: sb.signSupabaseJWT(uid),
  });
}

// 내 대화방 목록(멤버 프로필 + 마지막 메시지 + 안읽음).
async function handleChatList(uid: string, res: any) {
  if (!uid || !sb.supabaseConfigured()) {
    res.status(200).json({ ok: true, me: uid || null, conversations: [] });
    return;
  }
  const [{ convs, members, messages }, users] = await Promise.all([
    sb.listForUser(uid),
    getJSON<User[]>('v2/users.json', []),
  ]);
  const umap: Record<string, User> = {};
  for (const u of users) umap[u.id] = u;
  const membersByConv: Record<string, string[]> = {};
  const myLastRead: Record<string, string> = {};
  for (const m of members) {
    (membersByConv[m.conversation_id] ||= []).push(m.user_id);
    if (m.user_id === uid) myLastRead[m.conversation_id] = m.last_read_at;
  }
  const lastByConv: Record<string, any> = {};
  const unreadByConv: Record<string, number> = {};
  for (const m of messages) {
    // messages are ordered created_at desc → first seen is latest.
    if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
    const lr = myLastRead[m.conversation_id] || '';
    if (m.from_user !== uid && (!lr || m.created_at > lr)) {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1;
    }
  }
  const out = convs.map((c: any) => {
    const lm = lastByConv[c.id];
    return {
      id: c.id,
      isGroup: !!c.is_group,
      title: c.title || '',
      members: (membersByConv[c.id] || []).map((id) => toPartner(id, umap)),
      last: lm
        ? { id: lm.id, from: lm.from_user, text: lm.body, image: lm.image, ts: new Date(lm.created_at).getTime() }
        : null,
      unread: unreadByConv[c.id] || 0,
      createdAt: new Date(c.created_at).getTime(),
    };
  });
  // 같은 멤버 구성의 중복 대화방(더블탭·재전송으로 생긴)을 하나로 합친다.
  // 1:1은 멤버쌍, 그룹은 멤버쌍+제목을 키로 → 활동이 최근인 방을 대표로, 안읽음 합산.
  const byKey: Record<string, any> = {};
  for (const c of out) {
    const memberKey = c.members.map((m: any) => m.id).sort().join(',');
    const key = c.isGroup ? `g:${c.title || ''}|${memberKey}` : `d:${memberKey}`;
    const prev = byKey[key];
    if (!prev) {
      byKey[key] = c;
      continue;
    }
    const act = c.last?.ts || c.createdAt;
    const prevAct = prev.last?.ts || prev.createdAt;
    const keep = act >= prevAct ? c : prev;
    const drop = keep === c ? prev : c;
    keep.unread = (keep.unread || 0) + (drop.unread || 0);
    byKey[key] = keep;
  }
  const deduped = Object.values(byKey);
  deduped.sort((a: any, b: any) => (b.last?.ts || b.createdAt) - (a.last?.ts || a.createdAt));
  res.status(200).json({ ok: true, me: uid, conversations: deduped });
}

// 1:1 대화 시작(중복 방지) → conversationId.
async function handleChatStartDirect(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const other = String(b.uid || '');
  if (!other || other === uid) {
    res.status(400).json({ ok: false, error: 'bad_target' });
    return;
  }
  let id = await sb.findDirect(uid, other);
  if (!id) id = await sb.createConversation(uid, false, '', [uid, other]);
  res.status(200).json({ ok: !!id, conversationId: id });
}

// 그룹(단체톡) 생성 → conversationId.
async function handleChatCreateGroup(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const members = Array.isArray(b.members) ? b.members.map((x: any) => String(x)).filter(Boolean) : [];
  if (members.length < 2) {
    res.status(400).json({ ok: false, error: 'need_members' });
    return;
  }
  const id = await sb.createConversation(uid, true, String(b.title || ''), [uid, ...members]);
  res.status(200).json({ ok: !!id, conversationId: id });
}

// 음성통화 입장 토큰 — 대화방 멤버만. announce=true면 통화 시작 메시지 삽입(상대 알림).
async function handleVoiceToken(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!lk.livekitConfigured()) {
    res.status(500).json({ ok: false, error: 'livekit_not_configured' });
    return;
  }
  const convId = String(b.conversationId || '');
  if (!convId || !(await sb.isMember(uid, convId))) {
    res.status(403).json({ ok: false, error: 'not_a_member' });
    return;
  }
  const room = `conv_${convId}`;
  const me = await getUserById(uid);
  const token = await lk.mintVoiceToken(uid, room, me?.name || 'PEED 유저');
  if (b.announce) {
    // 통화 시작 신호 — 대화에 통화 메시지(실시간 전달) + 상대 벨 알림.
    await sb.insertMessage(convId, uid, '[VOICE_CALL]');
    const members = await sb.membersOf(convId);
    for (const m of members) {
      if (m === uid) continue;
      await notifs.notify(m, {
        type: 'call',
        title: '음성 통화',
        body: `${me?.name || '누군가'}님이 음성 통화를 시작했어요.`,
        actorId: uid,
      });
    }
  }
  res.status(200).json({ ok: true, token, url: lk.LIVEKIT_URL, room, identity: uid });
}

// 새 메시지 알림 — 클라가 전송 후 호출(상대 멤버 벨 알림).
async function handleChatNotify(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(200).json({ ok: true });
    return;
  }
  const memberIds = Array.isArray(b.members) ? b.members.map((x: any) => String(x)) : [];
  const preview = String(b.preview || '새 메시지').slice(0, 40);
  const isGroup = !!b.isGroup;
  const title = String(b.title || '');
  const me = await getUserById(uid);
  for (const m of memberIds) {
    if (!m || m === uid) continue;
    await notifs.notify(m, {
      type: 'dm',
      title: isGroup ? `${title || '그룹'} 새 메시지` : '새 메시지',
      body: `${me?.name || '누군가'}: ${preview}`,
      actorId: uid,
    });
  }
  res.status(200).json({ ok: true });
}

async function handleUserPosts(uid: string, targetId: string, res: any) {
  const owner = !!uid && uid === targetId;
  const [posts, target, edges] = await Promise.all([
    allPosts(),
    getUserById(targetId),
    social.allEdges(),
  ]);
  const mine = posts.filter((p) => p.authorId === targetId && (owner || !p.isPrivate));
  const map = await authorMapFor(mine);
  res.status(200).json({
    ok: true,
    posts: mine.map((p) => toClientPost(p, map)),
    user: target
      ? {
          id: target.id,
          name: target.name,
          handle: target.handle,
          avatar: target.avatar,
          bio: target.bio,
          followers: social.followerIds(edges, target.id).length,
          following: social.followingIds(edges, target.id).length,
          isFollowing: uid ? edges.some((e) => e.a === uid && e.b === target.id) : false,
          isMe: uid === target.id,
        }
      : null,
  });
}

// 통합 검색 — 사람(이름/아이디) + 매장(이름/카테고리/지역) 부분일치.
async function handleSearchUsers(uid: string, q: string, res: any) {
  const query = String(q || '').trim().toLowerCase();
  const qh = query.replace(/^@/, '');
  if (!query) {
    res.status(200).json({ ok: true, users: [], stores: [] });
    return;
  }
  const [users, edges, stores] = await Promise.all([
    getJSON<User[]>('v2/users.json', []),
    social.allEdges(),
    getJSON<any[]>('v2/stores.json', []),
  ]);
  const following = new Set<string>(uid ? social.followingIds(edges, uid) : []);
  const matchedUsers = users
    .filter(
      (u) =>
        u.id !== uid &&
        ((u.name || '').toLowerCase().includes(qh) ||
          (u.handle || '').toLowerCase().replace(/^@/, '').includes(qh))
    )
    .slice(0, 25)
    .map((u) => ({
      id: u.id,
      name: u.name,
      handle: u.handle,
      avatar: u.avatar,
      bio: u.bio,
      isFollowing: following.has(u.id),
      followers: social.followerCount(edges, u.id),
    }));
  const matchedStores = (Array.isArray(stores) ? stores : [])
    .filter((s) => s.stage === '활성')
    .filter(
      (s) =>
        (s.storeName || '').toLowerCase().includes(query) ||
        (s.category || '').toLowerCase().includes(query) ||
        (s.address || '').toLowerCase().includes(query) ||
        (s.region || '').toLowerCase().includes(query)
    )
    .slice(0, 15)
    .map((s) => ({
      id: s.id,
      name: s.storeName,
      category: s.category || '버닝 매장',
      location: s.address ? `${s.address} · ${s.region}` : s.region || '',
      region: s.region || '',
      lat: s.lat,
      lng: s.lng,
      image: s.image || (Array.isArray(s.photos) ? s.photos[0] : '') || '',
      photos: Array.isArray(s.photos) ? s.photos.slice(0, 8) : [],
      phone: s.contact || '',
      menus: Array.isArray(s.menus) ? s.menus.slice(0, 40) : [],
    }));
  res.status(200).json({ ok: true, users: matchedUsers, stores: matchedStores });
}

// 친구 추천 — 친구의 친구(2촌) > 인기 계정 > 신규. 이미 팔로우/본인은 제외.
async function handleSuggested(uid: string, res: any) {
  const [users, edges] = await Promise.all([
    getJSON<User[]>('v2/users.json', []),
    social.allEdges(),
  ]);
  const myFollowing = new Set<string>(uid ? social.followingIds(edges, uid) : []);
  const fofCount: Record<string, number> = {};
  if (uid) {
    for (const f of myFollowing) {
      for (const g of social.followingIds(edges, f)) {
        if (g !== uid && !myFollowing.has(g)) fofCount[g] = (fofCount[g] || 0) + 1;
      }
    }
  }
  const followerCountOf: Record<string, number> = {};
  for (const e of edges) followerCountOf[e.b] = (followerCountOf[e.b] || 0) + 1;

  const scored = users
    .filter((u) => u.id !== uid && !myFollowing.has(u.id))
    .map((u) => {
      const fof = fofCount[u.id] || 0;
      const pop = followerCountOf[u.id] || 0;
      return { u, fof, pop, score: fof * 10 + Math.min(pop, 50) + Math.random() * 3 };
    });
  scored.sort((a, b) => b.score - a.score);
  res.status(200).json({
    ok: true,
    users: scored.slice(0, 20).map(({ u, fof, pop }) => ({
      id: u.id,
      name: u.name,
      handle: u.handle,
      avatar: u.avatar,
      bio: u.bio,
      isFollowing: false,
      followers: pop,
      reason: fof > 0 ? `회원님이 팔로우하는 ${fof}명이 팔로우` : pop > 0 ? '인기 미식가' : '새로 가입한 미식가',
    })),
  });
}

async function handleCreatePost(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const images = await resolveImages(b.images || b.image);
  // 표시용 적립 라벨(실제 PB 적립은 /api/review 가 매장당 1회로 처리 — 중복 방지).
  const post = await createPost(uid, {
    kind: b.kind,
    store: b.store,
    category: b.category,
    location: b.location,
    images,
    rating: b.rating,
    caption: b.caption,
    tags: b.tags,
    people: b.people,
    price: b.price,
    isBurning: b.isBurning,
    earnedPb: b.isBurning ? 10 : 2,
    isPrivate: b.isPrivate,
  });
  const author = await getUserById(uid);
  const map: Record<string, User> = author ? { [uid]: author } : {};
  res.status(200).json({ ok: true, post: toClientPost(post, map) });
}

// ── 경품 응모 (서버 PB 차감 + 응모 기록) ──
async function handleEnterRaffle(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const productId = String(b.productId || '');
  const count = Math.max(1, Math.min(50, Math.round(Number(b.count) || 1)));
  const products = await getJSON<any[]>('v2/products.json', []);
  const product = products.find((p) => p.id === productId);
  if (!product) {
    res.status(404).json({ ok: false, error: 'no_product' });
    return;
  }
  const cost = (Number(product.pbCost) || 0) * count;
  const d = await wallet.debit(uid, cost, `경품 응모 · ${product.name}`);
  if (!d.ok) {
    res.status(200).json({ ok: false, error: 'insufficient_pb', balance: d.balance });
    return;
  }
  await entries.addEntry(uid, productId, count);
  const [my, tot] = await Promise.all([entries.myCounts(uid), entries.totals()]);
  res.status(200).json({
    ok: true,
    balance: d.balance,
    myEntries: my[productId] || 0,
    totalEntries: tot[productId] || 0,
  });
}

// 경품별 내 응모 수 + 전체 응모 수.
async function handleRaffleState(uid: string, res: any) {
  const [my, tot] = await Promise.all([
    uid ? entries.myCounts(uid) : Promise.resolve({} as Record<string, number>),
    entries.totals(),
  ]);
  res.status(200).json({ ok: true, myEntries: my, totals: tot });
}

// ── 저장(찜) ──
async function handleSavePost(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const postId = String(b.postId || '');
  const on = !!b.on;
  const before = await saves.savedIds(uid);
  const already = before.includes(postId);
  await saves.setSaved(uid, postId, on);
  if (on && !already) await incSaveCount(postId, 1);
  if (!on && already) await incSaveCount(postId, -1);
  res.status(200).json({ ok: true, saved: on });
}

async function handleSavedPosts(uid: string, res: any) {
  if (!uid) {
    res.status(200).json({ ok: true, posts: [] });
    return;
  }
  const ids = new Set(await saves.savedIds(uid));
  const posts = (await allPosts()).filter((p) => ids.has(p.id));
  const map = await authorMapFor(posts);
  res.status(200).json({ ok: true, posts: posts.map((p) => toClientPost(p, map, ids)) });
}

// ── PB 원장 ──
async function handlePbLedger(uid: string, res: any) {
  if (!uid) {
    res.status(200).json({ ok: true, balance: 0, events: [] });
    return;
  }
  const [balance, events] = await Promise.all([wallet.getBalance(uid), wallet.ledgerFor(uid, 50)]);
  res.status(200).json({ ok: true, balance, events });
}

async function handleEditPost(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const updated = await updatePost(String(b.id), uid, {
    caption: typeof b.caption === 'string' ? b.caption : undefined,
    isPrivate: typeof b.isPrivate === 'boolean' ? b.isPrivate : undefined,
  });
  res.status(200).json({ ok: !!updated });
}

async function handleDeletePost(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const ok = await removePost(String(b.id), uid);
  res.status(200).json({ ok });
}

async function handleComment(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const text = String(b.text || '').trim();
  if (!text) {
    res.status(400).json({ ok: false, error: 'empty' });
    return;
  }
  const author = await getUserById(uid);
  const comment = {
    id: `uc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    userId: uid,
    userName: author?.name || 'PEED 유저',
    text: text.slice(0, 500),
    ts: Date.now(),
  };
  const post = await addPostComment(String(b.id), comment);
  // 게시물 작성자에게 댓글 알림.
  if (post && post.authorId) {
    await notifs.notify(post.authorId, {
      type: 'comment',
      title: '새 댓글',
      body: `${comment.userName}: ${comment.text.slice(0, 40)}`,
      actorId: uid,
      postId: post.id,
    });
  }
  res.status(200).json({ ok: !!post, comment });
}

async function handleUpload(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const url = await uploadDataUrl(String(b.dataUrl || ''));
  if (!url) {
    res.status(400).json({ ok: false, error: 'bad_image' });
    return;
  }
  res.status(200).json({ ok: true, url });
}

// ── 매장 리뷰(특정 매장의 전체 공개 게시물) ──
async function handleStorePosts(store: string, res: any) {
  const name = String(store || '').trim();
  if (!name) {
    res.status(200).json({ ok: true, posts: [] });
    return;
  }
  const posts = (await allPosts()).filter((p) => !p.isPrivate && p.store === name);
  const map = await authorMapFor(posts);
  res.status(200).json({ ok: true, posts: posts.map((p) => toClientPost(p, map)) });
}

// ── 예약 ──
async function handleReserve(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const rec = await reservations.addReservation({
    uid,
    storeId: String(b.storeId || ''),
    storeName: String(b.storeName || ''),
    storeImage: String(b.storeImage || ''),
    location: String(b.location || ''),
    date: String(b.date || ''),
    time: String(b.time || ''),
    people: Math.max(1, Math.round(Number(b.people) || 1)),
  });
  await notifs.notify(uid, {
    type: 'reserve',
    title: '예약 완료',
    body: `${rec.storeName} · ${rec.date} ${rec.time} · ${rec.people}인 예약이 접수됐어요.`,
  });
  res.status(200).json({ ok: true, reservation: rec });
}

async function handleMyReservations(uid: string, res: any) {
  if (!uid) {
    res.status(200).json({ ok: true, reservations: [] });
    return;
  }
  res.status(200).json({ ok: true, reservations: await reservations.myReservations(uid) });
}

async function handleReservationStatus(
  uid: string,
  b: any,
  status: reservations.Reservation['status'],
  res: any
) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const ok = await reservations.setStatus(String(b.id || ''), uid, status);
  res.status(200).json({ ok });
}

// ── 바이트(스토리) ──
async function handleCreateBite(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  let image = '';
  const raw = String(b.image || '');
  if (raw.startsWith('data:')) image = await uploadDataUrl(raw);
  else if (raw) image = raw;
  const bite = await addBite(uid, {
    image,
    caption: String(b.caption || '').slice(0, 500),
    overlays: Array.isArray(b.overlays) ? b.overlays.slice(0, 40) : [],
    filter: b.filter,
    bg: Array.isArray(b.bg) ? b.bg : undefined,
    audience: b.audience === 'close' ? 'close' : 'all',
  });
  res.status(200).json({ ok: true, bite });
}

async function handleBites(uid: string, res: any) {
  const [bites, users, edges] = await Promise.all([
    allBites(),
    getJSON<User[]>('v2/users.json', []),
    social.allEdges(),
  ]);
  const myFollowing = new Set<string>(uid ? social.followingIds(edges, uid) : []);
  const map: Record<string, User> = {};
  for (const u of users) map[u.id] = u;
  const visible = bites.filter(
    (bt) =>
      bt.authorId === uid ||
      bt.audience === 'all' ||
      (bt.audience === 'close' && myFollowing.has(bt.authorId))
  );
  res.status(200).json({
    ok: true,
    bites: visible.map((bt) => ({
      id: bt.id,
      author: toPartner(bt.authorId, map),
      image: bt.image,
      caption: bt.caption,
      overlays: bt.overlays || [],
      filter: bt.filter,
      bg: bt.bg,
      audience: bt.audience,
      createdAt: bt.createdAt,
      isMe: !!uid && bt.authorId === uid,
    })),
  });
}

// ── 도장(패스포트) ──
async function handleStamps(uid: string, res: any) {
  res.status(200).json({ ok: true, stamps: uid ? await stamps.stampsFor(uid) : [] });
}
// 구(區)별 리뷰 진행도 — {구이름: 카운트}. 5개마다 +1 PB.
async function handleDistrictStats(uid: string, res: any) {
  res.status(200).json({
    ok: true,
    districts: uid ? await districts.statsFor(uid) : {},
    goal: districts.DISTRICT_GOAL,
  });
}
async function handleCollectStamp(uid: string, b: any, res: any) {
  if (!uid) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  const list = await stamps.addStamp(uid, String(b.name || ''));
  res.status(200).json({ ok: true, stamps: list });
}

// ── 알림 ──
async function handleNotifs(uid: string, res: any) {
  if (!uid) {
    res.status(200).json({ ok: true, notifs: [], unread: 0 });
    return;
  }
  const [list, unread] = await Promise.all([notifs.listFor(uid, 50), notifs.unreadCount(uid)]);
  res.status(200).json({ ok: true, notifs: list, unread });
}
async function handleNotifsRead(uid: string, res: any) {
  if (uid) await notifs.markAllRead(uid);
  res.status(200).json({ ok: true });
}

export default async function handler(req: any, res: any) {
  const action = String((req.query && req.query.action) || '');
  const uid = readUid(readUserCookie(req.headers?.cookie));

  // ── GET (읽기) — store 미연결이어도 빈 값 반환 ──
  if (req.method === 'GET') {
    // 유저별 동적 응답 — 브라우저/CDN 캐시 금지(캐시되면 새 데이터가 안 보임).
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    // 채팅 인증/목록은 Blob(store)와 무관 — Supabase 사용.
    if (action === 'chatAuth') return await handleChatAuth(uid, res);
    if (action === 'chatList') return await handleChatList(uid, res);
    if (action === 'voiceHealth') {
      let mintOk = false;
      let err = '';
      try {
        if (lk.livekitConfigured()) {
          const t = await lk.mintVoiceToken('healthtest', 'health', 'health');
          mintOk = typeof t === 'string' && t.split('.').length === 3;
        }
      } catch (e: any) {
        err = String(e?.message || e).slice(0, 140);
      }
      res.status(200).json({ ok: true, configured: lk.livekitConfigured(), mintOk, err });
      return;
    }
    if (!storeConfigured()) {
      res.status(200).json({ ok: true, posts: [] });
      return;
    }
    try {
      if (action === 'feed') return await handleFeed(uid, res);
      if (action === 'userPosts') return await handleUserPosts(uid, String(req.query.uid || ''), res);
      if (action === 'searchUsers') return await handleSearchUsers(uid, String(req.query.q || ''), res);
      if (action === 'suggestedUsers') return await handleSuggested(uid, res);
      if (action === 'followInfo') return await handleFollowInfo(uid, String(req.query.uid || ''), res);
      if (action === 'followers') return await handleFollowList(uid, String(req.query.uid || ''), 'followers', res);
      if (action === 'following') return await handleFollowList(uid, String(req.query.uid || ''), 'following', res);
      if (action === 'raffleState') return await handleRaffleState(uid, res);
      if (action === 'savedPosts') return await handleSavedPosts(uid, res);
      if (action === 'pbLedger') return await handlePbLedger(uid, res);
      if (action === 'storePosts') return await handleStorePosts(String(req.query.store || ''), res);
      if (action === 'myReservations') return await handleMyReservations(uid, res);
      if (action === 'bites') return await handleBites(uid, res);
      if (action === 'stamps') return await handleStamps(uid, res);
      if (action === 'districtStats') return await handleDistrictStats(uid, res);
      if (action === 'notifs') return await handleNotifs(uid, res);
      res.status(400).json({ ok: false, error: 'bad_action' });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: 'failed', detail: String(e?.message || e) });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  if (!storeConfigured()) {
    res.status(200).json({ ok: false, error: 'store_not_connected' });
    return;
  }
  const b = parseBody(req);
  try {
    if (action === 'createPost') return await handleCreatePost(uid, b, res);
    if (action === 'editPost') return await handleEditPost(uid, b, res);
    if (action === 'deletePost') return await handleDeletePost(uid, b, res);
    if (action === 'comment') return await handleComment(uid, b, res);
    if (action === 'upload') return await handleUpload(uid, b, res);
    if (action === 'follow') return await handleFollow(uid, b, true, res);
    if (action === 'unfollow') return await handleFollow(uid, b, false, res);
    if (action === 'chatStartDirect') return await handleChatStartDirect(uid, b, res);
    if (action === 'chatCreateGroup') return await handleChatCreateGroup(uid, b, res);
    if (action === 'chatNotify') return await handleChatNotify(uid, b, res);
    if (action === 'voiceToken') return await handleVoiceToken(uid, b, res);
    if (action === 'enterRaffle') return await handleEnterRaffle(uid, b, res);
    if (action === 'savePost') return await handleSavePost(uid, b, res);
    if (action === 'reserve') return await handleReserve(uid, b, res);
    if (action === 'cancelReservation') return await handleReservationStatus(uid, b, '취소', res);
    if (action === 'visitReservation') return await handleReservationStatus(uid, b, '방문완료', res);
    if (action === 'createBite') return await handleCreateBite(uid, b, res);
    if (action === 'collectStamp') return await handleCollectStamp(uid, b, res);
    if (action === 'notifsRead') return await handleNotifsRead(uid, res);
    if (action === 'apply') return await handleApply(b, res);
    if (action === 'invite') return await handleInvite(b, res);
    res.status(400).json({ ok: false, error: 'bad_action' });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'failed', detail: String(e?.message || e) });
  }
}
