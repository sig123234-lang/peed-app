// 회원 통합 마이그레이션 (1회성).
//   v2/members.json  → v2/users.json 으로 흡수
//   v2/pb_ledger.json → v2/pb_events.json 으로 흡수 (원장 단일화)
// 여러 번 돌려도 안전하다(id 기준 중복 제거). 실행 전 자동 백업.
import fs from 'fs';
import path from 'path';

const ROOT = process.env.PEED_DATA_DIR || '/home/ubuntu/peed-data';
const V2 = path.join(ROOT, 'v2');

const read = (f, fb) => {
  try {
    const raw = fs.readFileSync(path.join(V2, f), 'utf8');
    return raw.trim() ? JSON.parse(raw) : fb;
  } catch {
    return fb;
  }
};
const write = (f, data) => {
  const file = path.join(V2, f);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
  fs.renameSync(`${file}.tmp`, file);
};

function withDefaults(u) {
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
    pb: Number(u?.pb) || 0,
  };
}

// ── 백업 ──
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backup = path.join(ROOT, `backup-premerge-${stamp}`);
fs.mkdirSync(backup, { recursive: true });
for (const f of ['users.json', 'members.json', 'pb_events.json', 'pb_ledger.json']) {
  const src = path.join(V2, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(backup, f));
}
console.log(`백업 → ${backup}`);

// ── 1. 회원 병합 ──
const users = read('users.json', []);
const members = read('members.json', []);
const byId = new Map();
for (const u of users) byId.set(u.id, withDefaults(u));

let added = 0;
for (const m of members) {
  if (!m || !m.id) continue;
  if (byId.has(m.id)) {
    // 같은 id 가 이미 있으면 어드민 쪽 필드만 덧씌우고 앱 필드(provider 등)는 지킨다.
    byId.set(m.id, withDefaults({ ...m, ...byId.get(m.id) }));
    continue;
  }
  byId.set(m.id, withDefaults(m));
  added++;
}
const merged = Array.from(byId.values());
write('users.json', merged);
console.log(`회원: users ${users.length}명 + members ${members.length}명 → ${merged.length}명 (신규 편입 ${added}명)`);

// ── 2. PB 원장 병합 (pb_ledger → pb_events) ──
const events = read('pb_events.json', []);
const legacy = read('pb_ledger.json', []);
const haveIds = new Set(events.map((e) => e && e.id));
const converted = [];
for (const e of legacy) {
  if (!e || haveIds.has(e.id)) continue;
  const signed = Number(e.delta) || 0;
  converted.push({
    id: e.id,
    memberId: e.uid,
    memberName: (byId.get(e.uid) || {}).name || '',
    type: signed >= 0 ? 'issue' : 'spend',
    amount: Math.abs(signed),
    signed,
    reason: e.reason || '',
    storeId: '',
    ref: '',
    balanceAfter: Number(e.balanceAfter) || 0,
    date: new Date(Number(e.ts) || Date.now()).toISOString().slice(0, 10),
    createdAt: Number(e.ts) || Date.now(),
  });
}
if (converted.length) {
  const all = [...events, ...converted].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  write('pb_events.json', all.slice(0, 20000));
}
console.log(`PB 원장: 기존 ${events.length}건 + 앱 원장 ${legacy.length}건 → 편입 ${converted.length}건`);

// ── 3. 잔액 검증 ──
const bad = merged.filter((u) => !Number.isFinite(Number(u.pb)) || Number(u.pb) < 0);
console.log(bad.length ? `⚠ 잔액 이상 회원 ${bad.length}명` : '잔액 검증 통과');
console.log('완료.');
