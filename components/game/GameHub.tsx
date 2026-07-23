import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePb } from '@/context/pb';
import { APP_MAX_WIDTH, APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

/* PB 미니게임 허브 — 진짜 1:1 PvP.
   매칭·판정·PB 정산은 전부 서버(api/_games.ts)가 한다. 화면은 내 수를 올리고
   상대가 둘 때까지 기다릴 뿐이다. PB가 걸린 승부라 클라이언트가 이겼다고
   주장하는 구조여서는 안 된다.
   전송은 1초 폴링 — DM 과 같은 방식이라 별도 실시간 서버가 필요 없다. */

const STAKE = 1; // 한 판에 거는 PB (서버 값과 동일)
const POLL_MS = 1000;

type GameKey = 'rps' | 'quiz' | 'lastman';
type Outcome = 'win' | 'lose' | 'draw';
type Phase = 'lobby' | 'waiting' | 'playing' | 'result';

type GameDef = {
  key: GameKey;
  name: string;
  emoji: string;
  tagline: string;
  colors: readonly [string, string];
};

const GAMES: GameDef[] = [
  { key: 'rps', name: '가위바위보', emoji: '✌️', tagline: '한 판 승부, 3초면 끝', colors: ['#7C5CFF', '#4F6BFF'] },
  { key: 'quiz', name: '스피드 퀴즈', emoji: '⚡', tagline: '3문제, 빨리 맞히면 이긴다', colors: ['#FF9A5A', '#FF5A5A'] },
  { key: 'lastman', name: '반응속도 대결', emoji: '🎯', tagline: '초록불에 먼저 누르기', colors: ['#22C55E', '#0EA5E9'] },
];

type ServerMatch = {
  id: string;
  game: GameKey;
  config: any;
  opponent: string;
  state: 'playing' | 'done';
  iMoved: boolean;
  oppMoved: boolean;
  outcome: Outcome | null;
  detail: string;
  stake: number;
};

type LiveStat = { waiting: number; playing: number };
type LiveStats = Record<GameKey, LiveStat>;
const EMPTY_STATS: LiveStats = {
  rps: { waiting: 0, playing: 0 },
  quiz: { waiting: 0, playing: 0 },
  lastman: { waiting: 0, playing: 0 },
};

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';

async function api(action: string, body?: any): Promise<any> {
  const url = `/api/public?action=${action}`;
  const res = await fetch(
    url,
    body
      ? {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { credentials: 'include' }
  );
  return res.json();
}

/* ================================ 허브 ================================ */

export function GameHub() {
  const { pb, refreshPb } = usePb();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [game, setGame] = useState<GameKey | null>(null);
  const [match, setMatch] = useState<ServerMatch | null>(null);
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const [error, setError] = useState('');
  const [waitSec, setWaitSec] = useState(0);

  const def = GAMES.find((g) => g.key === (match?.game || game)) || null;

  // 로비 현황 — 지어낸 숫자가 아니라 실제 대기·진행 인원.
  useEffect(() => {
    if (!isWeb() || phase !== 'lobby') return;
    let alive = true;
    const load = () =>
      api('gameStats')
        .then((d) => alive && d?.stats && setStats(d.stats))
        .catch(() => {});
    load();
    const iv = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase]);

  // 매칭 대기 · 대국 중에는 서버 상태를 따라간다.
  useEffect(() => {
    if (!isWeb() || (phase !== 'waiting' && phase !== 'playing')) return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await api('gamePoll');
        if (!alive) return;
        if (d?.status === 'match' && d.match) {
          setMatch(d.match);
          if (d.match.state === 'done') {
            setPhase('result');
            refreshPb();
          } else {
            setPhase('playing');
          }
        } else if (d?.status === 'waiting') {
          setPhase('waiting');
        } else if (d?.status === 'idle') {
          // 대기가 만료됐거나 취소됨.
          setPhase('lobby');
          setMatch(null);
        }
      } catch {
        // 네트워크가 잠깐 끊겨도 폴링은 계속한다.
      }
    };
    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase, refreshPb]);

  // 대기 시간 표시
  useEffect(() => {
    if (phase !== 'waiting') {
      setWaitSec(0);
      return;
    }
    const iv = setInterval(() => setWaitSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  const join = useCallback(
    async (key: GameKey) => {
      setError('');
      setGame(key);
      setMatch(null);
      if (!isWeb()) return;
      try {
        const d = await api('gameJoin', { game: key });
        if (d?.status === 'matched' && d.match) {
          setMatch(d.match);
          setPhase('playing');
          refreshPb();
        } else if (d?.status === 'waiting') {
          setPhase('waiting');
        } else {
          setError(
            d?.error === 'insufficient_pb'
              ? `PB가 부족해요. 한 판에 ${STAKE} PB가 필요해요.`
              : d?.error === 'unauthorized'
                ? '로그인이 필요해요.'
                : '지금은 참가할 수 없어요.'
          );
          setPhase('lobby');
        }
      } catch {
        setError('연결에 실패했어요.');
        setPhase('lobby');
      }
    },
    [refreshPb]
  );

  const submit = useCallback(
    async (mv: any) => {
      if (!match) return;
      try {
        const d = await api('gameMove', { matchId: match.id, move: mv });
        if (d?.match) {
          setMatch(d.match);
          if (d.match.state === 'done') {
            setPhase('result');
            refreshPb();
          }
        }
      } catch {
        // 폴링이 곧 상태를 따라잡는다.
      }
    },
    [match, refreshPb]
  );

  const quit = useCallback(async () => {
    if (isWeb()) {
      try {
        await api('gameLeave', {});
      } catch {
        // ignore
      }
    }
    refreshPb();
    setPhase('lobby');
    setGame(null);
    setMatch(null);
  }, [refreshPb]);

  const again = useCallback(() => {
    const k = match?.game || game;
    setMatch(null);
    if (k) join(k);
    else setPhase('lobby');
  }, [match, game, join]);

  let content: ReactNode;
  if (phase === 'lobby') {
    content = <Lobby pb={pb} stats={stats} error={error} onPick={join} />;
  } else if (phase === 'waiting') {
    content = <Waiting def={def!} seconds={waitSec} onCancel={quit} />;
  } else if (phase === 'result' && match) {
    content = <Result def={def!} match={match} onAgain={again} onLobby={quit} />;
  } else if (match) {
    content = (
      <View style={styles.playWrap}>
        <MatchBar def={def!} opponent={match.opponent} onQuit={quit} />
        {match.iMoved ? (
          <WaitingOpponent opponent={match.opponent} />
        ) : match.game === 'rps' ? (
          <RockPaperScissors opponent={match.opponent} onSubmit={submit} />
        ) : match.game === 'quiz' ? (
          <SpeedQuiz questions={match.config?.questions || []} onSubmit={submit} />
        ) : (
          <LastMan delayMs={Number(match.config?.delayMs) || 2500} onSubmit={submit} />
        )}
      </View>
    );
  } else {
    content = (
      <View style={styles.centerWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <View style={styles.hubRoot}>{content}</View>;
}

/* ================================ 로비 ================================ */

function Lobby({
  pb,
  stats,
  error,
  onPick,
}: {
  pb: number;
  stats: LiveStats;
  error: string;
  onPick: (k: GameKey) => void;
}) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.lobbyContent} showsVerticalScrollIndicator={false}>
      <View style={styles.lobbyHead}>
        <Text style={styles.lobbyTitle}>미니게임 🎮</Text>
        <View style={styles.pbPill}>
          <View style={styles.pbCoin}><Text style={styles.pbCoinTxt}>P</Text></View>
          <Text style={styles.pbPillTxt}>{pb.toLocaleString()} PB</Text>
        </View>
      </View>
      <Text style={styles.lobbySub}>
        실제 유저와 1:1 대결. 한 판에 {STAKE} PB를 걸고, 이기면 {STAKE * 2} PB를 가져가요.
      </Text>

      {error ? <Text style={styles.lobbyErr}>{error}</Text> : null}

      <View style={styles.cardList}>
        {GAMES.map((g) => {
          const s = stats[g.key] || { waiting: 0, playing: 0 };
          const live = s.waiting + s.playing;
          return (
            <TouchableOpacity
              key={g.key}
              activeOpacity={0.9}
              onPress={() => onPick(g.key)}
              disabled={pb < STAKE}
              style={[styles.gameCard, pb < STAKE && styles.gameCardOff]}
            >
              <LinearGradient colors={g.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gameEmojiWrap}>
                <Text style={styles.gameEmoji}>{g.emoji}</Text>
              </LinearGradient>
              <View style={styles.gameInfo}>
                <Text style={styles.gameName}>{g.name}</Text>
                <Text style={styles.gameTag}>{g.tagline}</Text>
                <View style={styles.gameMeta}>
                  {live > 0 ? <View style={styles.liveDot} /> : null}
                  <Text style={styles.gameMetaTxt}>
                    {live > 0 ? `지금 ${live}명 참여 중` : '1:1 · 대기 없음'} · {STAKE} PB
                  </Text>
                </View>
              </View>
              <View style={styles.playBtn}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {pb < STAKE ? (
        <Text style={styles.lobbyHint}>리뷰를 쓰면 PB를 모을 수 있어요.</Text>
      ) : null}
    </ScrollView>
  );
}

/* =============================== 매칭 대기 =============================== */

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

function Waiting({ def, seconds, onCancel }: { def: GameDef; seconds: number; onCancel: () => void }) {
  return (
    <View style={styles.centerWrap}>
      <Text style={styles.matchGame}>{def.emoji} {def.name}</Text>
      <View style={styles.vsRow}>
        <Avatar me label="나" color={colors.primary} />
        <Text style={styles.vsTxt}>VS</Text>
        <View style={styles.avatarCol}>
          <View style={[styles.avatar, styles.avatarWait]}>
            <Text style={styles.avatarTxt}>?</Text>
          </View>
          <Text style={styles.avatarName}>???</Text>
        </View>
      </View>
      <View style={styles.matchStatus}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.matchStatusTxt}>상대를 찾는 중… {seconds}초</Text>
      </View>
      <Text style={styles.waitHint}>
        먼저 들어온 사람과 자동으로 짝이 맞춰져요.{'\n'}상대가 없으면 잠시 기다려 주세요.
      </Text>
      <TouchableOpacity onPress={onCancel} style={styles.lobbyBtn}>
        <Text style={styles.lobbyBtnTxt}>취소</Text>
      </TouchableOpacity>
    </View>
  );
}

/** 내 수를 냈고 상대를 기다리는 상태. */
function WaitingOpponent({ opponent }: { opponent: string }) {
  return (
    <View style={styles.gameArea}>
      <View style={styles.matchStatus}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.matchStatusTxt}>{opponent} 님을 기다리는 중…</Text>
      </View>
      <Text style={styles.waitHint}>상대가 두면 바로 결과가 나와요.</Text>
    </View>
  );
}

/* ============================ 플레이 상단 바 ============================ */

function MatchBar({ def, opponent, onQuit }: { def: GameDef; opponent: string; onQuit: () => void }) {
  return (
    <View style={styles.matchBar}>
      <Text style={styles.matchBarTxt} numberOfLines={1}>
        {def.emoji} {def.name} · vs {opponent}
      </Text>
      <TouchableOpacity onPress={onQuit} hitSlop={8}>
        <Text style={styles.quitTxt}>기권</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ============================== 가위바위보 ============================== */

const RPS = [
  { key: 'rock', emoji: '✊', label: '바위' },
  { key: 'paper', emoji: '✋', label: '보' },
  { key: 'scissors', emoji: '✌️', label: '가위' },
] as const;

function RockPaperScissors({
  opponent,
  onSubmit,
}: {
  opponent: string;
  onSubmit: (mv: any) => void;
}) {
  const [mine, setMine] = useState<string | null>(null);

  const play = (key: string) => {
    if (mine) return;
    setMine(key);
    onSubmit({ choice: key });
  };

  const myEmoji = mine ? RPS.find((r) => r.key === mine)!.emoji : '❔';

  return (
    <View style={styles.gameArea}>
      <Text style={styles.gamePrompt}>{mine ? '상대를 기다리는 중…' : '가위바위보!'}</Text>
      <View style={styles.handRow}>
        <View style={styles.handCol}>
          <Text style={styles.handEmoji}>{myEmoji}</Text>
          <Text style={styles.handName}>나</Text>
        </View>
        <Text style={styles.handVs}>VS</Text>
        <View style={styles.handCol}>
          <Text style={styles.handEmoji}>❔</Text>
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
const Q_TIME = 6; // 초

function SpeedQuiz({ questions, onSubmit }: { questions: QA[]; onSubmit: (mv: any) => void }) {
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [left, setLeft] = useState(Q_TIME);
  const startedRef = useRef(0);
  const elapsedRef = useRef(0);
  const tickRef = useRef<any>(null);
  const doneRef = useRef(false);

  const cur = questions[idx];

  useEffect(() => {
    if (!cur) return;
    setPicked(null);
    setLeft(Q_TIME);
    startedRef.current = Date.now();
    tickRef.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(tickRef.current);
          answer(null);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cur]);

  const answer = (choice: string | null) => {
    if (picked !== null || doneRef.current) return;
    clearInterval(tickRef.current);
    // 시간 초과는 최대 시간을 쓴 것으로 계산한다(빨리 푼 사람이 유리해야 하므로).
    elapsedRef.current += choice ? Date.now() - startedRef.current : Q_TIME * 1000;
    const isRight = !!choice && choice === cur.answer;
    const nextCorrect = correct + (isRight ? 1 : 0);
    setPicked(choice ?? '');
    setCorrect(nextCorrect);

    setTimeout(() => {
      if (idx + 1 < questions.length) {
        setIdx((i) => i + 1);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onSubmit({ correct: nextCorrect, ms: Math.round(elapsedRef.current) });
      }
    }, 900);
  };

  if (!cur) return <View style={styles.gameArea}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.gameArea}>
      <View style={styles.quizTop}>
        <Text style={styles.quizProgress}>Q{idx + 1} / {questions.length}</Text>
        <View style={styles.quizScore}>
          <Text style={styles.quizScoreTxt}>맞힌 문제 {correct}</Text>
        </View>
        <View style={[styles.timerPill, left <= 2 && styles.timerPillHot]}>
          <Text style={[styles.timerTxt, left <= 2 && styles.timerTxtHot]}>{left}s</Text>
        </View>
      </View>

      <Text style={styles.quizQ}>{cur.q}</Text>

      <View style={styles.quizOpts}>
        {cur.options.map((opt) => {
          const isPicked = picked === opt;
          const showAns = picked !== null && opt === cur.answer;
          const wrongPick = picked !== null && isPicked && opt !== cur.answer;
          return (
            <TouchableOpacity
              key={opt}
              activeOpacity={0.85}
              disabled={picked !== null}
              onPress={() => answer(opt)}
              style={[styles.quizOpt, showAns && styles.quizOptRight, wrongPick && styles.quizOptWrong]}
            >
              <Text style={[styles.quizOptTxt, (showAns || wrongPick) && styles.quizOptTxtOn]}>{opt}</Text>
              {showAns && <Ionicons name="checkmark-circle" size={18} color="#fff" />}
              {wrongPick && <Ionicons name="close-circle" size={18} color="#fff" />}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.quizFeed}>정답 수가 같으면 더 빨리 푼 쪽이 이겨요.</Text>
    </View>
  );
}

/* ============================ 반응속도 대결 ============================ */

function LastMan({ delayMs, onSubmit }: { delayMs: number; onSubmit: (mv: any) => void }) {
  const [light, setLight] = useState<'ready' | 'go' | 'done'>('ready');
  const [note, setNote] = useState('초록불이 되면 바로 누르세요');
  const [myMs, setMyMs] = useState<number | null>(null);
  const goAtRef = useRef(0);
  const timerRef = useRef<any>(null);
  const doneRef = useRef(false);

  // 신호가 뜨는 시점은 서버가 정한다 — 두 사람이 똑같은 조건에서 겨룬다.
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      goAtRef.current = Date.now();
      setLight('go');
    }, delayMs);
    return () => clearTimeout(timerRef.current);
  }, [delayMs]);

  const tap = () => {
    if (doneRef.current || light === 'done') return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    if (light === 'ready') {
      // 성급한 클릭 = 실격. 서버가 -1 을 패배로 처리한다.
      setLight('done');
      setNote('너무 빨랐어요! 실격 😵');
      setMyMs(-1);
      onSubmit({ ms: -1 });
      return;
    }
    const ms = Date.now() - goAtRef.current;
    setLight('done');
    setMyMs(ms);
    setNote(`${ms}ms — 상대 기록을 기다리는 중…`);
    onSubmit({ ms });
  };

  return (
    <View style={styles.gameArea}>
      <Text style={styles.lmRound}>초록불에 먼저 누르는 사람이 이깁니다</Text>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={tap}
        disabled={light === 'done'}
        style={[
          styles.lmLight,
          light === 'ready' && styles.lmReady,
          light === 'go' && styles.lmGo,
          light === 'done' && styles.lmResult,
        ]}
      >
        <Text style={styles.lmLightTxt}>
          {light === 'ready' ? '준비…' : light === 'go' ? '탭!' : myMs === -1 ? '❌' : `${myMs}ms`}
        </Text>
      </TouchableOpacity>

      <Text style={styles.lmNote}>{note}</Text>
    </View>
  );
}

/* ================================ 결과 ================================ */

function Result({
  def,
  match,
  onAgain,
  onLobby,
}: {
  def: GameDef;
  match: ServerMatch;
  onAgain: () => void;
  onLobby: () => void;
}) {
  const win = match.outcome === 'win';
  const draw = match.outcome === 'draw';
  const accent = win ? colors.success : draw ? colors.textSecondary : colors.danger;
  const delta = win ? `+${match.stake}` : draw ? '±0' : `-${match.stake}`;
  return (
    <View style={styles.centerWrap}>
      <Text style={styles.resultEmoji}>{win ? '🏆' : draw ? '🤝' : '💦'}</Text>
      <Text style={[styles.resultTitle, { color: accent }]}>
        {win ? '승리!' : draw ? '무승부' : '패배'}
      </Text>
      <Text style={styles.resultGame}>
        {def.emoji} {def.name} · vs {match.opponent}
        {match.detail ? ` · ${match.detail}` : ''}
      </Text>
      <View style={[styles.deltaBox, { borderColor: accent }]}>
        <Text style={[styles.deltaTxt, { color: accent }]}>{delta} PB</Text>
      </View>

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
  quitTxt: { fontSize: 13, fontWeight: '800', color: colors.textTertiary },
  lobbyErr: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  lobbyHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  avatarWait: { backgroundColor: colors.surfaceAlt },
  waitHint: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
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
