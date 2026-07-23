import { getJSON, putJSON } from './_store';
import { getUserById } from './_users';
import * as wallet from './_wallet';

/* PvP 미니게임 — 매칭·판정·PB 정산을 모두 서버가 한다.
   예전에는 클라이언트가 상대 수를 즉석에서 랜덤 생성해 '혼자 하는 게임'이었다.
   PB가 걸리는 순간 클라이언트 판정은 그대로 조작 창구가 되므로, 승패는
   서버만 결정하고 클라이언트는 자기 수를 제출하기만 한다.

   전송은 폴링(1초)을 쓴다. WebSocket 없이도 이 규모에서는 충분하고,
   DM(2초 폴링)과 같은 방식이라 운영이 단순하다. */

export type GameKey = 'rps' | 'quiz' | 'lastman';
export type MatchState = 'playing' | 'done';

export type Match = {
  id: string;
  game: GameKey;
  players: string[]; // [uid, uid]
  names: Record<string, string>;
  config: any; // 두 사람이 같은 조건으로 겨루도록 서버가 정한다
  moves: Record<string, any>;
  state: MatchState;
  winner: string | null; // null = 무승부(또는 미정)
  detail: string;
  createdAt: number;
  resolvedAt: number | null;
};

const QUEUE = 'v2/game_queue.json';
const MATCHES = 'v2/matches.json';

export const STAKE = 1; // 한 판에 거는 PB
const QUEUE_TTL = 45_000; // 이 시간이 지난 대기는 버린다(탭을 닫고 간 사람)
const MOVE_TIMEOUT = 40_000; // 상대가 이 시간 안에 두지 않으면 기권 처리
const MATCH_TTL = 6 * 3600_000; // 오래된 기록 정리

const QUIZ_POOL: { q: string; options: string[]; answer: string }[] = [
  { q: '다음 중 가장 매운 음식은?', options: ['불닭볶음면', '바닐라아이스크림', '플레인요거트', '식빵'], answer: '불닭볶음면' },
  { q: '김치찌개에 보통 넣지 않는 재료는?', options: ['두부', '돼지고기', '초콜릿', '파'], answer: '초콜릿' },
  { q: '아메리카노의 기본 재료는?', options: ['에스프레소와 물', '우유와 시럽', '녹차와 물', '탄산수와 레몬'], answer: '에스프레소와 물' },
  { q: '떡볶이의 주재료는?', options: ['가래떡', '감자', '고구마', '당면'], answer: '가래떡' },
  { q: '초밥에 주로 쓰이는 밥은?', options: ['식초로 간한 밥', '볶음밥', '누룽지', '찰밥'], answer: '식초로 간한 밥' },
  { q: '삼겹살은 어느 부위인가요?', options: ['배쪽 살', '다리 살', '목살', '등심'], answer: '배쪽 살' },
  { q: '냉면 육수로 흔히 쓰이지 않는 것은?', options: ['동치미', '사골', '고기 육수', '오렌지주스'], answer: '오렌지주스' },
  { q: '피자의 기본 토핑은?', options: ['치즈', '김', '단무지', '미역'], answer: '치즈' },
];

const rid = (n = 5) => Math.random().toString(36).slice(2, 2 + n);
const now = () => Date.now();

async function readQueue(): Promise<{ game: GameKey; uid: string; ts: number }[]> {
  const q = await getJSON<any[]>(QUEUE, []);
  return Array.isArray(q) ? q : [];
}
async function readMatches(): Promise<Match[]> {
  const m = await getJSON<any[]>(MATCHES, []);
  return Array.isArray(m) ? m : [];
}

function shuffle<T>(a: T[]): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/** 게임마다 두 사람이 공유할 조건. 클라이언트가 정하면 유리하게 조작할 수 있다. */
function makeConfig(game: GameKey): any {
  if (game === 'quiz') return { questions: shuffle(QUIZ_POOL).slice(0, 3) };
  if (game === 'lastman') return { delayMs: 1800 + Math.floor(Math.random() * 3200) };
  return {};
}

/** 내가 참여 중인(아직 안 끝난) 매치. */
function myLiveMatch(matches: Match[], uid: string): Match | null {
  return matches.find((m) => m.state === 'playing' && m.players.includes(uid)) || null;
}

/** 오래된 대기열·기록 정리. */
function prune(queue: any[], matches: Match[]) {
  const t = now();
  return {
    queue: queue.filter((q) => q && t - (Number(q.ts) || 0) < QUEUE_TTL),
    matches: matches.filter((m) => t - (Number(m.createdAt) || 0) < MATCH_TTL),
  };
}

export type JoinResult =
  | { status: 'waiting'; game: GameKey }
  | { status: 'matched'; match: PublicMatch }
  | { status: 'error'; error: string };

/** 대기열에 들어가거나, 기다리던 상대와 즉시 매칭한다. */
export async function join(uid: string, game: GameKey): Promise<JoinResult> {
  const me = await getUserById(uid);
  if (!me) return { status: 'error', error: 'no_user' };
  if ((Number(me.pb) || 0) < STAKE) return { status: 'error', error: 'insufficient_pb' };

  let [queue, matches] = [await readQueue(), await readMatches()];
  ({ queue, matches } = prune(queue, matches) as any);

  // 이미 진행 중인 판이 있으면 그걸 돌려준다(새로고침·중복 진입 대비).
  const live = myLiveMatch(matches, uid);
  if (live) return { status: 'matched', match: toPublic(live, uid) };

  // 나보다 먼저 기다린 사람(자기 자신 제외)과 짝을 짓는다.
  const idx = queue.findIndex((q) => q.game === game && q.uid !== uid);
  if (idx >= 0) {
    const other = queue[idx];
    queue.splice(idx, 1);
    queue = queue.filter((q) => q.uid !== uid);

    const opp = await getUserById(other.uid);
    if (!opp || (Number(opp.pb) || 0) < STAKE) {
      // 상대가 그새 PB가 모자라졌다면 그 사람만 빼고 내가 대기한다.
      queue.push({ game, uid, ts: now() });
      await putJSON(QUEUE, queue);
      await putJSON(MATCHES, matches);
      return { status: 'waiting', game };
    }

    // 참가비는 매칭 시점에 양쪽에서 뺀다. 이겨야 돌려받는 구조.
    const a = await wallet.debit(uid, STAKE, '미니게임 참가');
    if (!a.ok) {
      await putJSON(QUEUE, queue);
      return { status: 'error', error: 'insufficient_pb' };
    }
    const b = await wallet.debit(other.uid, STAKE, '미니게임 참가');
    if (!b.ok) {
      // 상대 차감이 실패하면 내 참가비를 즉시 돌려준다.
      await wallet.credit(uid, STAKE, '미니게임 참가 취소');
      queue.push({ game, uid, ts: now() });
      await putJSON(QUEUE, queue);
      return { status: 'waiting', game };
    }

    const match: Match = {
      id: `mt_${now().toString(36)}_${rid(4)}`,
      game,
      players: [other.uid, uid],
      names: { [other.uid]: opp.name || '상대', [uid]: me.name || '나' },
      config: makeConfig(game),
      moves: {},
      state: 'playing',
      winner: null,
      detail: '',
      createdAt: now(),
      resolvedAt: null,
    };
    matches.unshift(match);
    await putJSON(QUEUE, queue);
    await putJSON(MATCHES, matches.slice(0, 5000));
    return { status: 'matched', match: toPublic(match, uid) };
  }

  // 기다리는 사람이 없으면 내가 대기열에 선다(중복 방지).
  queue = queue.filter((q) => q.uid !== uid);
  queue.push({ game, uid, ts: now() });
  await putJSON(QUEUE, queue);
  await putJSON(MATCHES, matches);
  return { status: 'waiting', game };
}

/** 대기 취소 / 진행 중이면 기권. */
export async function leave(uid: string): Promise<void> {
  const queue = (await readQueue()).filter((q) => q.uid !== uid);
  await putJSON(QUEUE, queue);
  const matches = await readMatches();
  const live = myLiveMatch(matches, uid);
  if (live) {
    const opp = live.players.find((p) => p !== uid) || null;
    await settle(matches, live, opp, '상대 기권');
  }
}

export type PublicMatch = {
  id: string;
  game: GameKey;
  config: any;
  opponent: string;
  state: MatchState;
  iMoved: boolean;
  oppMoved: boolean;
  outcome: 'win' | 'lose' | 'draw' | null;
  detail: string;
  stake: number;
};

function toPublic(m: Match, uid: string): PublicMatch {
  const oppId = m.players.find((p) => p !== uid) || '';
  return {
    id: m.id,
    game: m.game,
    config: m.config,
    opponent: m.names[oppId] || '상대',
    state: m.state,
    iMoved: m.moves[uid] !== undefined,
    oppMoved: m.moves[oppId] !== undefined,
    outcome:
      m.state !== 'done' ? null : m.winner === null ? 'draw' : m.winner === uid ? 'win' : 'lose',
    detail: m.detail,
    stake: STAKE,
  };
}

/** 매칭 대기 중이면 짝이 지어졌는지, 진행 중이면 상대가 뒀는지 확인한다. */
export async function poll(uid: string): Promise<
  { status: 'idle' } | { status: 'waiting'; game: GameKey } | { status: 'match'; match: PublicMatch }
> {
  let [queue, matches] = [await readQueue(), await readMatches()];
  ({ queue, matches } = prune(queue, matches) as any);

  const live = myLiveMatch(matches, uid);
  if (live) {
    // 한쪽만 두고 시간이 지나면 둔 사람의 승리로 끝낸다(방치 방지).
    const waited = now() - live.createdAt;
    const moved = live.players.filter((p) => live.moves[p] !== undefined);
    if (waited > MOVE_TIMEOUT && moved.length === 1) {
      await settle(matches, live, moved[0], '상대 시간 초과');
      return { status: 'match', match: toPublic(live, uid) };
    }
    return { status: 'match', match: toPublic(live, uid) };
  }

  // 방금 끝난 판(결과 화면에서 읽는다).
  const recent = matches.find(
    (m) => m.players.includes(uid) && m.state === 'done' && now() - (m.resolvedAt || 0) < 60_000
  );
  if (recent) return { status: 'match', match: toPublic(recent, uid) };

  const q = queue.find((x) => x.uid === uid);
  if (q) {
    // 대기 시간을 갱신해 TTL 로 떨어져 나가지 않게 한다.
    q.ts = now();
    await putJSON(QUEUE, queue);
    return { status: 'waiting', game: q.game };
  }
  return { status: 'idle' };
}

/** 내 수를 제출한다. 둘 다 냈으면 즉시 판정. */
export async function move(uid: string, matchId: string, mv: any): Promise<PublicMatch | null> {
  const matches = await readMatches();
  const m = matches.find((x) => x.id === matchId && x.players.includes(uid));
  if (!m) return null;
  if (m.state === 'done') return toPublic(m, uid);
  if (m.moves[uid] !== undefined) return toPublic(m, uid);

  m.moves[uid] = sanitize(m.game, mv);

  const both = m.players.every((p) => m.moves[p] !== undefined);
  if (!both) {
    await putJSON(MATCHES, matches);
    return toPublic(m, uid);
  }
  const { winner, detail } = judge(m);
  await settle(matches, m, winner, detail);
  return toPublic(m, uid);
}

/** 클라이언트가 보낸 값을 게임별로 정리한다(형 변환·범위 제한). */
function sanitize(game: GameKey, mv: any): any {
  if (game === 'rps') {
    const c = String(mv?.choice || '');
    return { choice: ['rock', 'paper', 'scissors'].includes(c) ? c : 'rock' };
  }
  if (game === 'quiz') {
    return {
      correct: Math.max(0, Math.min(3, Number(mv?.correct) || 0)),
      ms: Math.max(0, Math.min(600000, Number(mv?.ms) || 0)),
    };
  }
  // lastman: 반응 속도(ms). 0 이하는 부정 클릭으로 보고 실격 처리한다.
  const ms = Number(mv?.ms);
  return { ms: Number.isFinite(ms) && ms > 0 ? Math.min(ms, 600000) : -1 };
}

const BEATS: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const RPS_KO: Record<string, string> = { rock: '바위', paper: '보', scissors: '가위' };

function judge(m: Match): { winner: string | null; detail: string } {
  const [a, b] = m.players;
  const ma = m.moves[a];
  const mb = m.moves[b];

  if (m.game === 'rps') {
    if (ma.choice === mb.choice) return { winner: null, detail: `둘 다 ${RPS_KO[ma.choice]}` };
    const aWins = BEATS[ma.choice] === mb.choice;
    return {
      winner: aWins ? a : b,
      detail: `${RPS_KO[ma.choice]} vs ${RPS_KO[mb.choice]}`,
    };
  }

  if (m.game === 'quiz') {
    if (ma.correct !== mb.correct) {
      return {
        winner: ma.correct > mb.correct ? a : b,
        detail: `${Math.max(ma.correct, mb.correct)}문제 : ${Math.min(ma.correct, mb.correct)}문제`,
      };
    }
    // 정답 수가 같으면 더 빨리 푼 쪽이 이긴다.
    if (ma.ms === mb.ms) return { winner: null, detail: `${ma.correct}문제로 동점` };
    return {
      winner: ma.ms < mb.ms ? a : b,
      detail: `${ma.correct}문제 동점 · ${(Math.min(ma.ms, mb.ms) / 1000).toFixed(2)}초 차이로 결정`,
    };
  }

  // lastman — 신호가 뜬 뒤 더 빨리 누른 쪽이 이긴다. -1 은 실격(성급한 클릭).
  const va = ma.ms;
  const vb = mb.ms;
  if (va < 0 && vb < 0) return { winner: null, detail: '둘 다 성급했어요' };
  if (va < 0) return { winner: b, detail: '상대가 성급하게 눌렀어요' };
  if (vb < 0) return { winner: a, detail: '상대가 성급하게 눌렀어요' };
  if (va === vb) return { winner: null, detail: `${va}ms 동시` };
  return { winner: va < vb ? a : b, detail: `${Math.min(va, vb)}ms vs ${Math.max(va, vb)}ms` };
}

/** 결과 확정 + PB 정산. 이긴 쪽이 참가비 2배를 가져가고, 비기면 각자 환불. */
async function settle(
  matches: Match[],
  m: Match,
  winner: string | null,
  detail: string
): Promise<void> {
  if (m.state === 'done') return;
  m.state = 'done';
  m.winner = winner;
  m.detail = detail;
  m.resolvedAt = now();
  await putJSON(MATCHES, matches);

  if (winner) {
    await wallet.credit(winner, STAKE * 2, '미니게임 승리');
  } else {
    for (const p of m.players) await wallet.credit(p, STAKE, '미니게임 무승부 환불');
  }
}

/** 로비에 보여줄 실시간 현황 — 지어낸 숫자가 아니라 실제 대기·진행 수. */
export async function stats(): Promise<Record<GameKey, { waiting: number; playing: number }>> {
  let [queue, matches] = [await readQueue(), await readMatches()];
  ({ queue, matches } = prune(queue, matches) as any);
  const out: any = {
    rps: { waiting: 0, playing: 0 },
    quiz: { waiting: 0, playing: 0 },
    lastman: { waiting: 0, playing: 0 },
  };
  for (const q of queue) if (out[q.game]) out[q.game].waiting++;
  for (const m of matches) if (m.state === 'playing' && out[m.game]) out[m.game].playing += 2;
  return out;
}
