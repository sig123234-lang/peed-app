import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePb } from '@/context/pb';
import { APP_MAX_WIDTH, APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

// PB 미니게임 허브 — 랜덤 매칭으로 1 PB씩 걸고 대결.
// ※ 실시간 PvP 매칭 서버가 붙기 전까지는 상대가 시뮬레이션(봇)이며, 매칭 UX와
//   PB 정산(베팅/획득)은 실제와 동일하게 동작한다. 나중에 매칭부만 실서버로 교체.

const STAKE = 1; // 한 게임에 거는 PB

type GameKey = 'rps' | 'quiz' | 'lastman';
type Outcome = 'win' | 'lose' | 'draw';
type Phase = 'lobby' | 'matching' | 'playing' | 'result';

type GameDef = {
  key: GameKey;
  name: string;
  emoji: string;
  players: number; // 참가 인원(= 판돈 PB)
  tagline: string;
  colors: [string, string];
};

const GAMES: GameDef[] = [
  { key: 'rps', name: '가위바위보', emoji: '✊', players: 2, tagline: 'AI와 한 판 승부', colors: ['#7C5CFF', '#4F6BFF'] },
  { key: 'quiz', name: '스피드 퀴즈', emoji: '⚡', players: 2, tagline: '3문제 빨리 맞히기', colors: ['#22C3A6', '#0FB5C9'] },
  { key: 'lastman', name: '라스트맨', emoji: '👑', players: 4, tagline: '반응 속도 서바이벌', colors: ['#FF8A5B', '#FF5A7A'] },
];

const NICKS = [
  '매운떡볶이', '치킨은살안쪄', '혼밥고수', '3대500', '민초단', '부먹파', '존맛탱',
  '다이어트내일부터', '국물러버', '소식좌', '대식가', '겉바속촉', '불닭전사',
  '아아중독', '새벽감성', '치즈폭탄', '마라탕후루', '곱빼기', '해장의신', '디저트배',
];

function randInt(n: number) {
  return Math.floor(Math.random() * n);
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)];
}
function sampleNicks(count: number): string[] {
  const pool = [...NICKS];
  const out: string[] = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(randInt(pool.length), 1)[0]);
  }
  return out;
}

/* ---- 라이브 접속 인원(시뮬레이션) — 자연스럽게 드리프트 ---- */
type LiveStat = { waiting: number; playing: number };
type LiveStats = Record<GameKey, LiveStat>;
const LIVE_BASE: LiveStats = {
  rps: { waiting: 18, playing: 46 },
  quiz: { waiting: 9, playing: 21 },
  lastman: { waiting: 12, playing: 18 },
};
function driftStats(prev: LiveStats): LiveStats {
  const nudge = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v + (randInt(7) - 3)));
  return {
    rps: { waiting: nudge(prev.rps.waiting, 4, 44), playing: nudge(prev.rps.playing, 10, 90) },
    quiz: { waiting: nudge(prev.quiz.waiting, 3, 30), playing: nudge(prev.quiz.playing, 6, 60) },
    lastman: { waiting: nudge(prev.lastman.waiting, 4, 32), playing: nudge(prev.lastman.playing, 6, 56) },
  };
}
function useLiveStats(): LiveStats {
  const [stats, setStats] = useState<LiveStats>(LIVE_BASE);
  useEffect(() => {
    const t = setInterval(() => setStats((p) => driftStats(p)), 3500);
    return () => clearInterval(t);
  }, []);
  return stats;
}

/* ============================ 허브(상태 머신) ============================ */

export function GameHub() {
  const { pb } = usePb();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [game, setGame] = useState<GameKey | null>(null);
  const [opponent, setOpponent] = useState('');
  const [waiting, setWaiting] = useState(0);
  const [result, setResult] = useState<{ outcome: Outcome; delta: number; detail: string } | null>(null);

  const def = GAMES.find((g) => g.key === game) || null;

  // 연습 대결(AI 상대) — PB 스테이크 없음. 실제 PB 정산 PvP는 서버 매칭 이후에.
  const beginMatch = useCallback((key: GameKey) => {
    setGame(key);
    setWaiting(5 + randInt(26));
    setResult(null);
    setPhase('matching');
  }, []);

  // 매칭 연출 → 상대 확정 → 플레이
  useEffect(() => {
    if (phase !== 'matching') return;
    setOpponent(pick(NICKS));
    const t = setTimeout(() => setPhase('playing'), 1700);
    return () => clearTimeout(t);
  }, [phase]);

  const finish = useCallback((outcome: Outcome, detail = '') => {
    setResult({ outcome, delta: 0, detail });
    setPhase('result');
  }, []);

  const playAgain = useCallback(() => {
    if (!game) {
      setPhase('lobby');
      setResult(null);
      return;
    }
    setResult(null);
    setPhase('matching');
  }, [game]);

  const toLobby = useCallback(() => {
    setPhase('lobby');
    setGame(null);
    setResult(null);
  }, []);

  let content: ReactNode;
  if (phase === 'lobby') {
    content = <Lobby pb={pb} onPick={beginMatch} />;
  } else if (phase === 'matching') {
    content = <Matching def={def!} opponent={opponent} waiting={waiting} />;
  } else if (phase === 'result') {
    content = <Result def={def!} result={result!} pb={pb} onAgain={playAgain} onLobby={toLobby} />;
  } else {
    content = (
      <View style={styles.playWrap}>
        <MatchBar def={def!} opponent={opponent} onQuit={toLobby} />
        {game === 'rps' && <RockPaperScissors opponent={opponent} onFinish={finish} />}
        {game === 'quiz' && <SpeedQuiz opponent={opponent} onFinish={finish} />}
        {game === 'lastman' && <LastMan onFinish={finish} />}
      </View>
    );
  }

  // 데스크탑에선 넓은 영역 가운데로 폭 제한.
  return <View style={styles.hubRoot}>{content}</View>;
}

/* ================================ 로비 ================================ */

function Lobby({ pb, onPick }: { pb: number; onPick: (k: GameKey) => void }) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.lobbyContent} showsVerticalScrollIndicator={false}>
      <View style={styles.lobbyHead}>
        <Text style={styles.lobbyTitle}>미니게임 🎮</Text>
        <View style={styles.pbPill}>
          <View style={styles.pbCoin}><Text style={styles.pbCoinTxt}>P</Text></View>
          <Text style={styles.pbPillTxt}>{pb.toLocaleString()} PB</Text>
        </View>
      </View>
      <Text style={styles.lobbySub}>AI 상대와 가볍게 한 판. 연습 대결이라 PB는 걸지 않아요.</Text>

      <View style={styles.cardList}>
        {GAMES.map((g) => (
          <TouchableOpacity
            key={g.key}
            activeOpacity={0.9}
            onPress={() => onPick(g.key)}
            style={styles.gameCard}
          >
            <LinearGradient colors={g.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gameEmojiWrap}>
              <Text style={styles.gameEmoji}>{g.emoji}</Text>
            </LinearGradient>
            <View style={styles.gameInfo}>
              <Text style={styles.gameName}>{g.name}</Text>
              <Text style={styles.gameTag}>{g.tagline}</Text>
              <View style={styles.gameMeta}>
                <Text style={styles.gameMetaTxt}>{g.players === 2 ? '1:1' : `${g.players}인`} · AI 연습</Text>
              </View>
            </View>
            <View style={styles.playBtn}>
              <Ionicons name="play" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

/* =============================== 매칭 연출 =============================== */

function Avatar({ label, color, me }: { label: string; color: string; me?: boolean }) {
  return (
    <View style={styles.avatarCol}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarTxt}>{me ? '나' : label.slice(0, 2)}</Text>
      </View>
      <Text style={styles.avatarName} numberOfLines={1}>{me ? '나' : label}</Text>
    </View>
  );
}

function Matching({ def, opponent, waiting }: { def: GameDef; opponent: string; waiting: number }) {
  return (
    <View style={styles.centerWrap}>
      <Text style={styles.matchGame}>{def.emoji} {def.name}</Text>
      <View style={styles.vsRow}>
        <Avatar me label="나" color={colors.primary} />
        <Text style={styles.vsTxt}>VS</Text>
        <Avatar label={opponent} color={colors.coral} />
      </View>
      <View style={styles.matchStatus}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.matchStatusTxt}>AI 상대를 준비하는 중…</Text>
      </View>
      <View style={styles.onlineRow}>
        <View style={styles.liveDot} />
        <Text style={styles.onlineTxt}>{def.emoji} {def.name} · 연습 대결</Text>
      </View>
    </View>
  );
}

/* ============================ 플레이 상단 바 ============================ */

function MatchBar({ def, opponent, onQuit }: { def: GameDef; opponent: string; onQuit: () => void }) {
  return (
    <View style={styles.matchBar}>
      <Text style={styles.matchBarTxt} numberOfLines={1}>
        {def.emoji} 나 <Text style={styles.matchBarVs}>vs</Text> {def.players > 2 ? `${def.players - 1}인` : opponent}
      </Text>
      <TouchableOpacity onPress={onQuit} hitSlop={8}>
        <Ionicons name="close" size={20} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

/* ============================== 가위바위보 ============================== */

const RPS = [
  { key: 'rock', label: '바위', emoji: '✊' },
  { key: 'scissors', label: '가위', emoji: '✌️' },
  { key: 'paper', label: '보', emoji: '✋' },
] as const;
const BEATS: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

function RockPaperScissors({ opponent, onFinish }: { opponent: string; onFinish: (o: Outcome, d?: string) => void }) {
  const [mine, setMine] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const done = useRef(false);

  const play = (key: string) => {
    if (mine) return;
    const opp = pick(RPS).key;
    setMine(key);
    setTheirs(opp);
    const o: Outcome = key === opp ? 'draw' : BEATS[key] === opp ? 'win' : 'lose';
    setOutcome(o);
    const md = RPS.find((r) => r.key === key)!.emoji;
    const od = RPS.find((r) => r.key === opp)!.emoji;
    setTimeout(() => {
      if (done.current) return;
      done.current = true;
      onFinish(o, `${md} vs ${od}`);
    }, 1500);
  };

  const myEmoji = mine ? RPS.find((r) => r.key === mine)!.emoji : '❔';
  const opEmoji = theirs ? RPS.find((r) => r.key === theirs)!.emoji : '❔';

  return (
    <View style={styles.gameArea}>
      <Text style={styles.gamePrompt}>{mine ? (outcome === 'win' ? '이겼어요! 🎉' : outcome === 'lose' ? '졌어요 😢' : '비겼어요 🤝') : '가위바위보!'}</Text>
      <View style={styles.handRow}>
        <View style={styles.handCol}>
          <Text style={styles.handEmoji}>{myEmoji}</Text>
          <Text style={styles.handName}>나</Text>
        </View>
        <Text style={styles.handVs}>VS</Text>
        <View style={styles.handCol}>
          <Text style={styles.handEmoji}>{opEmoji}</Text>
          <Text style={styles.handName} numberOfLines={1}>{opponent}</Text>
        </View>
      </View>
      <View style={styles.rpsBtns}>
        {RPS.map((r) => (
          <TouchableOpacity
            key={r.key}
            activeOpacity={0.85}
            disabled={!!mine}
            onPress={() => play(r.key)}
            style={[styles.rpsBtn, mine === r.key && styles.rpsBtnSel, !!mine && mine !== r.key && styles.rpsBtnDim]}
          >
            <Text style={styles.rpsEmoji}>{r.emoji}</Text>
            <Text style={styles.rpsLabel}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/* ============================== 스피드 퀴즈 ============================== */

type QA = { q: string; options: string[]; answer: string };
const QUIZ_POOL: QA[] = [
  { q: '다음 중 가장 매운 음식은?', options: ['불닭볶음면', '바닐라아이스크림', '플레인요거트', '식빵'], answer: '불닭볶음면' },
  { q: '삼겹살은 무슨 고기일까?', options: ['돼지', '소', '닭', '양'], answer: '돼지' },
  { q: '아메리카노의 주재료는?', options: ['커피', '녹차', '우유', '코코아'], answer: '커피' },
  { q: '김밥에 보통 안 들어가는 것은?', options: ['초콜릿', '단무지', '시금치', '당근'], answer: '초콜릿' },
  { q: "탕수육 '부먹'의 뜻은?", options: ['부어 먹기', '볶아 먹기', '불에 먹기', '부셔 먹기'], answer: '부어 먹기' },
  { q: '회는 어떤 상태의 생선?', options: ['날것', '구운 것', '튀긴 것', '삶은 것'], answer: '날것' },
  { q: '비빔밥에 올라가는 대표 양념은?', options: ['고추장', '케첩', '마요네즈', '머스터드'], answer: '고추장' },
  { q: '라면을 끓일 때 꼭 필요한 것은?', options: ['물', '우유', '주스', '사이다'], answer: '물' },
  { q: '치킨의 부위가 아닌 것은?', options: ['지느러미', '다리', '날개', '가슴'], answer: '지느러미' },
  { q: '에스프레소에 물을 타면?', options: ['아메리카노', '카푸치노', '카페모카', '녹차라떼'], answer: '아메리카노' },
];
const Q_COUNT = 3;
const Q_TIME = 6; // 초

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function SpeedQuiz({ opponent, onFinish }: { opponent: string; onFinish: (o: Outcome, d?: string) => void }) {
  const [quiz] = useState(() => shuffle(QUIZ_POOL).slice(0, Q_COUNT).map((q) => ({ ...q, options: shuffle(q.options) })));
  const [idx, setIdx] = useState(0);
  const [my, setMy] = useState(0);
  const [opp, setOpp] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean; oppText: string } | null>(null);
  const [left, setLeft] = useState(Q_TIME);
  const startedRef = useRef(0);
  const tickRef = useRef<any>(null);

  const cur = quiz[idx];

  // 문제 타이머
  useEffect(() => {
    setPicked(null);
    setFeedback(null);
    setLeft(Q_TIME);
    startedRef.current = Date.now();
    tickRef.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(tickRef.current);
          resolve(null); // 시간 초과
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const resolve = (choice: string | null) => {
    if (picked !== null || feedback) return;
    clearInterval(tickRef.current);
    const userMs = choice ? Date.now() - startedRef.current : 999999;
    const userCorrect = choice === cur.answer;
    // 상대(봇) 시뮬레이션
    const botCorrect = Math.random() < 0.66;
    const botMs = 1200 + randInt(3600);
    let mePoint = 0;
    let oppPoint = 0;
    if (userCorrect && botCorrect) {
      if (userMs <= botMs) mePoint = 1; else oppPoint = 1;
    } else if (userCorrect) mePoint = 1;
    else if (botCorrect) oppPoint = 1;

    setPicked(choice ?? '');
    setMy((s) => s + mePoint);
    setOpp((s) => s + oppPoint);
    setFeedback({
      correct: userCorrect,
      oppText: botCorrect ? `${opponent} 정답 (${(botMs / 1000).toFixed(1)}s)` : `${opponent} 오답`,
    });

    setTimeout(() => {
      if (idx + 1 < quiz.length) {
        setIdx((i) => i + 1);
      } else {
        const fm = my + mePoint;
        const fo = opp + oppPoint;
        onFinish(fm > fo ? 'win' : fm < fo ? 'lose' : 'draw', `${fm} : ${fo}`);
      }
    }, 1500);
  };

  return (
    <View style={styles.gameArea}>
      <View style={styles.quizTop}>
        <Text style={styles.quizProgress}>Q{idx + 1} / {quiz.length}</Text>
        <View style={styles.quizScore}>
          <Text style={styles.quizScoreTxt}>나 {my}</Text>
          <Text style={styles.quizScoreVs}>:</Text>
          <Text style={styles.quizScoreTxt}>{opp} {opponent.slice(0, 4)}</Text>
        </View>
        <View style={[styles.timerPill, left <= 2 && styles.timerPillHot]}>
          <Text style={[styles.timerTxt, left <= 2 && styles.timerTxtHot]}>{left}s</Text>
        </View>
      </View>

      <Text style={styles.quizQ}>{cur.q}</Text>

      <View style={styles.quizOpts}>
        {cur.options.map((opt) => {
          const isPicked = picked === opt;
          const showAns = feedback && opt === cur.answer;
          const wrongPick = feedback && isPicked && opt !== cur.answer;
          return (
            <TouchableOpacity
              key={opt}
              activeOpacity={0.85}
              disabled={picked !== null || !!feedback}
              onPress={() => resolve(opt)}
              style={[styles.quizOpt, showAns && styles.quizOptRight, wrongPick && styles.quizOptWrong]}
            >
              <Text style={[styles.quizOptTxt, (showAns || wrongPick) && styles.quizOptTxtOn]}>{opt}</Text>
              {showAns && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
              {wrongPick && <Ionicons name="close-circle" size={18} color="#fff" />}
            </TouchableOpacity>
          );
        })}
      </View>

      {feedback && (
        <Text style={[styles.quizFeed, { color: feedback.correct ? colors.success : colors.danger }]}>
          {feedback.correct ? '정답! ' : '오답 · '}{feedback.oppText}
        </Text>
      )}
    </View>
  );
}

/* =============================== 라스트맨 =============================== */

type Player = { id: string; name: string; alive: boolean; ms: number | null; me?: boolean };

function LastMan({ onFinish }: { onFinish: (o: Outcome, d?: string) => void }) {
  const [players, setPlayers] = useState<Player[]>(() => [
    { id: 'me', name: '나', alive: true, ms: null, me: true },
    ...sampleNicks(3).map((n, i) => ({ id: `bot${i}`, name: n, alive: true, ms: null })),
  ]);
  const [round, setRound] = useState(1);
  const [light, setLight] = useState<'ready' | 'go' | 'result'>('ready');
  const [note, setNote] = useState('');
  const goAtRef = useRef(0);
  const greenTimer = useRef<any>(null);
  const doneRef = useRef(false);

  const aliveCount = players.filter((p) => p.alive).length;

  // 라운드 시작: 빨강 → 랜덤 후 초록
  useEffect(() => {
    if (doneRef.current) return;
    setLight('ready');
    setNote('초록불이 되면 탭!');
    const delay = 1200 + randInt(2600);
    greenTimer.current = setTimeout(() => {
      goAtRef.current = Date.now();
      setLight('go');
    }, delay);
    return () => clearTimeout(greenTimer.current);
  }, [round]);

  const tap = () => {
    if (light === 'result') return;
    if (light === 'ready') {
      // 부정출발 → 이번 라운드 탈락 후보(최악값)
      clearTimeout(greenTimer.current);
      finishRound(999999, true);
      return;
    }
    finishRound(Date.now() - goAtRef.current, false);
  };

  const finishRound = (myMs: number, falseStart: boolean) => {
    setLight('result');
    // 살아있는 봇들 반응속도 시뮬레이션
    const next = players.map((p) => {
      if (!p.alive) return p;
      if (p.me) return { ...p, ms: myMs };
      return { ...p, ms: 240 + randInt(520) };
    });
    // 살아있는 인원 중 가장 느린 1명 탈락
    const aliveNow = next.filter((p) => p.alive);
    const slowest = aliveNow.reduce((a, b) => ((b.ms ?? 0) > (a.ms ?? 0) ? b : a));
    const after = next.map((p) => (p.id === slowest.id ? { ...p, alive: false } : p));
    setPlayers(after);

    const meAlive = after.find((p) => p.me)!.alive;
    const remain = after.filter((p) => p.alive);

    if (!meAlive) {
      setNote(falseStart ? '부정출발! 탈락 😵' : `너무 느렸어요… ${slowest.name} 탈락`);
      doneRef.current = true;
      setTimeout(() => onFinish('lose', `${round}라운드 탈락`), 1600);
      return;
    }
    if (remain.length === 1) {
      setNote('최후의 1인! 👑');
      doneRef.current = true;
      setTimeout(() => onFinish('win', '최후의 1인'), 1600);
      return;
    }
    setNote(`${slowest.name} 탈락! 다음 라운드`);
    setTimeout(() => setRound((r) => r + 1), 1600);
  };

  return (
    <View style={styles.gameArea}>
      <Text style={styles.lmRound}>ROUND {round} · 생존 {aliveCount}명</Text>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={tap}
        disabled={light === 'result'}
        style={[
          styles.lmLight,
          light === 'ready' && styles.lmReady,
          light === 'go' && styles.lmGo,
          light === 'result' && styles.lmResult,
        ]}
      >
        <Text style={styles.lmLightTxt}>
          {light === 'ready' ? '준비…' : light === 'go' ? '탭!' : ''}
        </Text>
      </TouchableOpacity>

      <Text style={styles.lmNote}>{note}</Text>

      <View style={styles.lmPlayers}>
        {players.map((p) => (
          <View key={p.id} style={[styles.lmChip, !p.alive && styles.lmChipDead, p.me && styles.lmChipMe]}>
            <Text style={[styles.lmChipTxt, !p.alive && styles.lmChipTxtDead, p.me && styles.lmChipTxtMe]} numberOfLines={1}>
              {p.name}
            </Text>
            {light === 'result' && p.ms != null && (
              <Text style={styles.lmMs}>{p.ms >= 999999 ? '❌' : `${p.ms}ms`}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ================================ 결과 ================================ */

function Result({
  def,
  result,
  pb,
  onAgain,
  onLobby,
}: {
  def: GameDef;
  result: { outcome: Outcome; delta: number; detail: string };
  pb: number;
  onAgain: () => void;
  onLobby: () => void;
}) {
  const win = result.outcome === 'win';
  const draw = result.outcome === 'draw';
  const accent = win ? colors.success : draw ? colors.textSecondary : colors.danger;
  return (
    <View style={styles.centerWrap}>
      <Text style={styles.resultEmoji}>{win ? '🏆' : draw ? '🤝' : '💦'}</Text>
      <Text style={[styles.resultTitle, { color: accent }]}>
        {win ? '승리!' : draw ? '무승부' : '패배'}
      </Text>
      <Text style={styles.resultGame}>{def.emoji} {def.name}{result.detail ? ` · ${result.detail}` : ''}</Text>

      <View style={{ height: spacing.lg }} />

      <TouchableOpacity activeOpacity={0.9} onPress={onAgain} style={styles.againBtn}>
        <LinearGradient colors={['#7C5CFF', '#4F6BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.againGrad}>
          <Text style={styles.againTxt}>다시 대결</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity onPress={onLobby} style={styles.lobbyBtn}>
        <Text style={styles.lobbyBtnTxt}>게임 목록</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ================================ 스타일 ================================ */

const CARD_W = APP_WIDTH - spacing.lg * 2;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hubRoot: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' },
  playWrap: { flex: 1, backgroundColor: colors.surface },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveDotSm: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  onlineTxt: { fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.surface },
  gameArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  /* lobby */
  lobbyContent: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
  lobbyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lobbyTitle: { fontSize: 22, fontWeight: '900', color: colors.textPrimary },
  pbPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingLeft: 4, paddingRight: 12, paddingVertical: 4 },
  pbCoin: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pbCoinTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  pbPillTxt: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  lobbySub: { fontSize: 13.5, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.sm, fontWeight: '600' },
  lowPb: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.coralSoft, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  lowPbTxt: { flex: 1, color: colors.coral, fontSize: 12.5, fontWeight: '700' },

  cardList: { marginTop: spacing.lg, gap: spacing.md },
  gameCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.md, ...shadow.card },
  gameCardOff: { opacity: 0.55 },
  gameEmojiWrap: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  gameEmoji: { fontSize: 30 },
  gameInfo: { flex: 1 },
  gameName: { fontSize: 17, fontWeight: '900', color: colors.textPrimary },
  gameTag: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  gameMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  betChip: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  betChipTxt: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  gameMetaTxt: { color: colors.textTertiary, fontSize: 12, fontWeight: '700' },
  playBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },

  /* matching */
  matchGame: { fontSize: 18, fontWeight: '900', color: colors.textPrimary, marginBottom: spacing.xl },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  vsTxt: { fontSize: 18, fontWeight: '900', color: colors.textTertiary },
  avatarCol: { alignItems: 'center', width: 92, gap: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...shadow.soft },
  avatarTxt: { color: '#fff', fontSize: 18, fontWeight: '900' },
  avatarName: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  matchStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing['2xl'] },
  matchStatusTxt: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  matchStake: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary, marginTop: spacing.md },

  /* match bar */
  matchBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  matchBarTxt: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  matchBarVs: { color: colors.textTertiary, fontWeight: '700' },

  gamePrompt: { fontSize: 24, fontWeight: '900', color: colors.textPrimary, marginBottom: spacing.xl, textAlign: 'center' },

  /* rps */
  handRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginBottom: spacing['2xl'] },
  handCol: { alignItems: 'center', width: 110, gap: 6 },
  handEmoji: { fontSize: 56 },
  handName: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  handVs: { fontSize: 16, fontWeight: '900', color: colors.textTertiary },
  rpsBtns: { flexDirection: 'row', gap: spacing.md },
  rpsBtn: { width: (CARD_W - spacing.md * 2) / 3, aspectRatio: 0.92, borderRadius: radius.lg, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 2, borderColor: colors.line, ...shadow.soft },
  rpsBtnSel: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rpsBtnDim: { opacity: 0.4 },
  rpsEmoji: { fontSize: 34 },
  rpsLabel: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },

  /* quiz */
  quizTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: CARD_W, marginBottom: spacing.lg },
  quizProgress: { fontSize: 13, fontWeight: '800', color: colors.textTertiary },
  quizScore: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quizScoreTxt: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  quizScoreVs: { fontSize: 13, fontWeight: '800', color: colors.textTertiary },
  timerPill: { minWidth: 34, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  timerPillHot: { backgroundColor: colors.coralSoft },
  timerTxt: { fontSize: 12.5, fontWeight: '900', color: colors.textSecondary },
  timerTxtHot: { color: colors.coral },
  quizQ: { fontSize: 19, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', lineHeight: 27, marginBottom: spacing.lg, minHeight: 54 },
  quizOpts: { width: CARD_W, gap: spacing.sm },
  quizOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderWidth: 1.5, borderColor: colors.line, ...shadow.soft },
  quizOptRight: { backgroundColor: colors.success, borderColor: colors.success },
  quizOptWrong: { backgroundColor: colors.danger, borderColor: colors.danger },
  quizOptTxt: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  quizOptTxtOn: { color: '#fff' },
  quizFeed: { marginTop: spacing.lg, fontSize: 14, fontWeight: '800' },

  /* lastman */
  lmRound: { fontSize: 14, fontWeight: '900', color: colors.textTertiary, marginBottom: spacing.lg, letterSpacing: 0.5 },
  lmLight: { width: CARD_W, height: 190, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  lmReady: { backgroundColor: '#E23D4B' },
  lmGo: { backgroundColor: '#22C55E' },
  lmResult: { backgroundColor: colors.surfaceAlt },
  lmLightTxt: { fontSize: 34, fontWeight: '900', color: '#fff' },
  lmNote: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.lg, textAlign: 'center', minHeight: 22 },
  lmPlayers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: spacing.lg },
  lmChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: colors.line },
  lmChipMe: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  lmChipDead: { opacity: 0.35 },
  lmChipTxt: { fontSize: 12.5, fontWeight: '800', color: colors.textPrimary, maxWidth: 92 },
  lmChipTxtMe: { color: colors.primary },
  lmChipTxtDead: { textDecorationLine: 'line-through' },
  lmMs: { fontSize: 11, fontWeight: '800', color: colors.textTertiary },

  /* result */
  resultEmoji: { fontSize: 60, marginBottom: spacing.sm },
  resultTitle: { fontSize: 30, fontWeight: '900' },
  resultGame: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: 6 },
  deltaBox: { alignItems: 'center', borderWidth: 2, borderRadius: radius.xl, paddingVertical: spacing.lg, paddingHorizontal: spacing['2xl'], marginTop: spacing.xl, marginBottom: spacing.xl, minWidth: 180 },
  deltaTxt: { fontSize: 30, fontWeight: '900' },
  deltaSub: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary, marginTop: 4 },
  againBtn: { width: CARD_W },
  againGrad: { borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  againTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  lobbyBtn: { marginTop: spacing.md, paddingVertical: 10 },
  lobbyBtnTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
