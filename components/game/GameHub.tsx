import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { usePb } from '@/context/pb';
import { useShell } from '@/context/shell';
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

// 재대결(다시하기) 준비 현황 — 0/2 → 1/2 → 2/2.
type RematchInfo = {
  ready: number;
  needed: number;
  iReadied: boolean;
  oppReadied: boolean;
  insufficient: boolean;
};

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

type RpsChoice = 'rock' | 'paper' | 'scissors';
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
  rpsMine?: RpsChoice; // 가위바위보 리빌용
  rpsOpp?: RpsChoice;
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
  const { openOverlay, dropOverlay } = useShell();
  const [phase, setPhase] = useState<Phase>('lobby');
  const [game, setGame] = useState<GameKey | null>(null);
  const [match, setMatch] = useState<ServerMatch | null>(null);
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const [error, setError] = useState('');
  const [waitSec, setWaitSec] = useState(0);
  // 재대결(다시하기) 상태 — 결과 화면에서만 쓴다.
  const [wantRematch, setWantRematch] = useState(false);
  const [rematchInfo, setRematchInfo] = useState<RematchInfo | null>(null);
  const [showFindNew, setShowFindNew] = useState(false);

  const def = GAMES.find((g) => g.key === (match?.game || game)) || null;

  // 폴링 tick 이 항상 최신 값을 보도록 ref 로 들고 있는다(인터벌을 매번 다시 만들지 않으려고).
  const matchRef = useRef<ServerMatch | null>(null);
  const phaseRef = useRef<Phase>('lobby');
  const wantRef = useRef(false);
  matchRef.current = match;
  phaseRef.current = phase;
  wantRef.current = wantRematch;

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

  // 매칭 대기 · 대국 중 · 결과(재대결) 에서 서버 상태를 따라간다.
  // 폴은 항상 '지금 붙어 있는 판(matchId)' 을 함께 보내, 다른 게임의 옛 결과가
  // 끼어들지 않게 한다. 결과 화면에서 다시하기를 누른 동안엔 want=1 로 동의를 남긴다.
  useEffect(() => {
    if (!isWeb() || (phase !== 'waiting' && phase !== 'playing' && phase !== 'result')) return;
    let alive = true;
    const tick = async () => {
      try {
        const cur = matchRef.current;
        const wantNow = phaseRef.current === 'result' && wantRef.current;
        const d = await api(
          `gamePoll&matchId=${encodeURIComponent(cur?.id || '')}&want=${wantNow ? '1' : '0'}`
        );
        if (!alive) return;

        if (d?.status === 'match' && d.match) {
          const nm = d.match as ServerMatch;
          const prevId = matchRef.current?.id;
          if (nm.state === 'done') {
            // 끝난 판. 결과 화면을 이미 보고 있으면(재대결 대기 중) 그대로 둔다.
            if (phaseRef.current !== 'result') {
              setMatch(nm);
              setPhase('result');
              refreshPb();
            }
          } else {
            // 진행 중인 판. 새 판(초기 매칭/재대결)으로 바뀌었으면 상태를 초기화한다.
            if (nm.id !== prevId) {
              setWantRematch(false);
              setRematchInfo(null);
              setShowFindNew(false);
              refreshPb();
            }
            setMatch(nm);
            setPhase('playing');
          }
        } else if (d?.status === 'rematch') {
          setRematchInfo({
            ready: Number(d.ready) || 0,
            needed: Number(d.needed) || 2,
            iReadied: !!d.iReadied,
            oppReadied: !!d.oppReadied,
            insufficient: !!d.insufficient,
          });
        } else if (d?.status === 'waiting') {
          setPhase('waiting');
        } else if (d?.status === 'idle') {
          // 대기가 만료됐거나 취소됨. 결과 화면에선 그대로 둔다(옛 판이 정리돼도 결과는 유지).
          if (phaseRef.current !== 'result') {
            setPhase('lobby');
            setMatch(null);
          }
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

  // 다시하기를 눌렀는데 상대가 10초간 응답이 없으면 '새 상대 찾기' 를 함께 띄운다.
  useEffect(() => {
    if (phase !== 'result' || !wantRematch) {
      setShowFindNew(false);
      return;
    }
    const t = setTimeout(() => setShowFindNew(true), 10000);
    return () => clearTimeout(t);
  }, [phase, wantRematch]);

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
    setWantRematch(false);
    setRematchInfo(null);
    setShowFindNew(false);
  }, [refreshPb]);

  // 게임에 들어가면(로비가 아니면) 히스토리에 항목을 쌓아 '오버레이'로 등록한다.
  // 그래야 하드웨어/브라우저 뒤로가기를 눌러도 버닝 같은 이전 탭이 아니라
  // '게임 목록(로비)'으로 돌아온다(뒤로가기 = 오버레이 pop → quit → 로비).
  // quit 참조가 바뀌어도 히스토리 항목이 중복으로 쌓이지 않게 ref 로 감싼다.
  const quitRef = useRef(quit);
  quitRef.current = quit;
  const inGame = phase !== 'lobby';
  useEffect(() => {
    if (!isWeb() || !inGame) return;
    const close = () => {
      void quitRef.current();
    };
    openOverlay(close);
    return () => dropOverlay(close);
  }, [inGame, openOverlay, dropOverlay]);

  // 다시하기 = 같은 상대와 재대결 동의. 폴이 want=1 로 서버에 동의를 남기고,
  // 둘 다 동의하면 서버가 새 판을 열어 자동으로 대국 화면으로 넘어간다.
  const requestRematch = useCallback(() => {
    setWantRematch(true);
    setShowFindNew(false);
    // 낙관적으로 1/2(나만 동의) 표시 — 다음 폴이 서버 값으로 덮어쓴다.
    setRematchInfo((r) => ({
      ready: Math.max(1, r?.ready || 0),
      needed: 2,
      iReadied: true,
      oppReadied: !!r?.oppReadied,
      insufficient: !!r?.insufficient,
    }));
  }, []);

  // 새 상대 찾기 = 재대결 동의를 거두고 일반 대기열로 다시 들어간다.
  const findNewOpponent = useCallback(async () => {
    const k = match?.game || game;
    setWantRematch(false);
    setRematchInfo(null);
    setShowFindNew(false);
    setMatch(null);
    if (isWeb()) {
      try {
        await api('gameLeave', {}); // 재대결 동의 철회 + 대기열 정리
      } catch {
        // ignore
      }
    }
    if (k) join(k);
    else setPhase('lobby');
  }, [match, game, join]);

  let content: ReactNode;
  if (phase === 'lobby') {
    content = <Lobby pb={pb} stats={stats} error={error} onPick={join} />;
  } else if (phase === 'waiting') {
    content = <Waiting def={def!} seconds={waitSec} onCancel={quit} />;
  } else if (phase === 'result' && match) {
    content = (
      <Result
        def={def!}
        match={match}
        wantRematch={wantRematch}
        rematch={rematchInfo}
        showFindNew={showFindNew}
        onRematch={requestRematch}
        onFindNew={findNewOpponent}
        onLobby={quit}
      />
    );
  } else if (match) {
    // key={match.id} — 새 판(재대결)이 시작되면 게임 컴포넌트를 새로 마운트해
    // 이전 판의 내부 상태(선택·타이머·완료 플래그)가 남지 않게 한다.
    content = (
      <View key={match.id} style={styles.playWrap}>
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

const RPS_SEC = 5; // 고르는 데 주어지는 시간

function RockPaperScissors({
  opponent,
  onSubmit,
}: {
  opponent: string;
  onSubmit: (mv: any) => void;
}) {
  const [mine, setMine] = useState<string | null>(null);
  const [left, setLeft] = useState(RPS_SEC);
  const [timedOut, setTimedOut] = useState(false);
  const doneRef = useRef(false);
  const tickRef = useRef<any>(null);

  // 선택 확정(수동/자동 공통). doneRef 로 중복 제출을 막는다.
  const play = useCallback(
    (key: string, auto = false) => {
      if (doneRef.current) return;
      doneRef.current = true;
      clearInterval(tickRef.current);
      setMine(key);
      if (auto) setTimedOut(true);
      onSubmit({ choice: key });
    },
    [onSubmit]
  );

  // 5초 카운트다운. 다 흐르면 랜덤으로 자동 제출한다(기권 아님).
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(tickRef.current);
          const rand = RPS[Math.floor(Math.random() * RPS.length)].key;
          play(rand, true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [play]);

  const myEmoji = mine ? RPS.find((r) => r.key === mine)!.emoji : '❔';
  const hot = !mine && left <= 2;
  const prompt = mine ? (timedOut ? '시간 초과 — 랜덤 제출!' : '상대를 기다리는 중…') : '가위바위보!';

  return (
    <View style={styles.gameArea}>
      <View style={[styles.rpsRing, hot && styles.rpsRingHot, !!mine && styles.rpsRingDone]}>
        <Text style={[styles.rpsRingTxt, hot && styles.rpsRingTxtHot, !!mine && styles.rpsRingTxtDone]}>
          {mine ? '✓' : left}
        </Text>
      </View>
      <Text style={styles.gamePrompt}>{prompt}</Text>
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
      {!mine ? <Text style={styles.rpsHint}>{RPS_SEC}초 안에 하나를 고르세요</Text> : null}
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
  wantRematch,
  rematch,
  showFindNew,
  onRematch,
  onFindNew,
  onLobby,
}: {
  def: GameDef;
  match: ServerMatch;
  wantRematch: boolean;
  rematch: RematchInfo | null;
  showFindNew: boolean;
  onRematch: () => void;
  onFindNew: () => void;
  onLobby: () => void;
}) {
  const win = match.outcome === 'win';
  const draw = match.outcome === 'draw';
  const accent = win ? colors.success : draw ? colors.textSecondary : colors.danger;
  const delta = win ? `+${match.stake}` : draw ? '±0' : `-${match.stake}`;

  const ready = rematch?.ready ?? (wantRematch ? 1 : 0);
  const oppReadied = !!rematch?.oppReadied;
  const insufficient = !!rematch?.insufficient;

  // 가위바위보 리빌 — '가위·바위·보'를 외치고, '보' 뒤 1초쯤 뜸을 들였다가 손을
  // 낸다. 초반엔 주먹을 보이지 않고 낼 때 손이 '팡' 나타난다. 두 손은 서로 마주
  // 보게(상대 손을 좌우 반전) 놓아 진짜 상대와 마주 앉아 하는 느낌을 준다.
  const isRps = match.game === 'rps' && !!match.rpsMine && !!match.rpsOpp;
  const [reveal, setReveal] = useState(!isRps);
  const [beat, setBeat] = useState(0); // 0=가위,1=바위,2=보
  const [thrown, setThrown] = useState(false); // '보' 뒤 1초 → 손을 낸다
  useEffect(() => {
    if (reveal) return;
    if (!thrown) {
      if (beat < 2) {
        const t = setTimeout(() => setBeat((b) => b + 1), 500);
        return () => clearTimeout(t);
      }
      // '보'를 외친 뒤 1초 정도 뜸을 들였다가 손을 낸다.
      const t = setTimeout(() => setThrown(true), 1000);
      return () => clearTimeout(t);
    }
    // 낸 손을 잠깐 보여준 뒤 결과 페이지로 넘어간다.
    const t = setTimeout(() => setReveal(true), 950);
    return () => clearTimeout(t);
  }, [reveal, beat, thrown]);
  const emojiOf = (c?: RpsChoice) =>
    c === 'rock' ? '✊' : c === 'paper' ? '✋' : c === 'scissors' ? '✌️' : '❔';

  // '가위·바위·보'를 외칠 때마다 글자가 '툭' 튀는 박자.
  const chantPop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRps || reveal || thrown) return;
    chantPop.setValue(0.7);
    Animated.spring(chantPop, {
      toValue: 1,
      friction: 4,
      tension: 180,
      useNativeDriver: false,
    }).start();
  }, [beat, isRps, reveal, thrown, chantPop]);

  // 손은 낼 때 부드럽게 '페이드+살짝 확대'로 나타난다. scale 은 1.0 을 넘기지
  // 않게(overshootClamping) 잡아서 iOS 에서 손끝이 박스를 벗어나 잘리지 않게 한다.
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!thrown) {
      appear.setValue(0);
      return;
    }
    Animated.spring(appear, {
      toValue: 1,
      friction: 7,
      tension: 90,
      overshootClamping: true,
      useNativeDriver: false,
    }).start();
  }, [thrown, appear]);
  const appearScale = appear.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  if (isRps && !reveal) {
    // 가위·바위·보를 외치는 동안엔 손이 없다가, '보' 1초 뒤 두 손이 마주 보며 팡.
    return (
      <View style={styles.centerWrap}>
        <Text style={styles.matchGame}>{def.emoji} {def.name}</Text>
        <Animated.Text style={[styles.rpsBeat, { transform: [{ scale: chantPop }] }]}>
          {['가위', '바위', '보'][beat]}
        </Animated.Text>
        <View style={styles.handRow}>
          <View style={styles.handCol}>
            {/* 내 손 — 낼 때 부드럽게 나타난다 */}
            <Animated.Text
              style={[styles.handEmoji, { opacity: appear, transform: [{ scale: appearScale }] }]}
            >
              {emojiOf(match.rpsMine)}
            </Animated.Text>
            <Text style={styles.handName}>나</Text>
          </View>
          <Text style={styles.handVs}>VS</Text>
          <View style={styles.handCol}>
            {/* 상대 손 — 좌우 반전으로 나와 마주 보게 */}
            <Animated.Text
              style={[
                styles.handEmoji,
                { opacity: appear, transform: [{ scale: appearScale }, { scaleX: -1 }] },
              ]}
            >
              {emojiOf(match.rpsOpp)}
            </Animated.Text>
            <Text style={styles.handName} numberOfLines={1}>{match.opponent}</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.centerWrap}>
      {isRps ? (
        // 공개된 손 — 내 수 vs 상대 수.
        <View style={styles.rpsRevealRow}>
          <View style={styles.handCol}>
            <Text style={styles.handEmoji}>{emojiOf(match.rpsMine)}</Text>
            <Text style={styles.handName}>나</Text>
          </View>
          <Text style={styles.handVs}>VS</Text>
          <View style={styles.handCol}>
            <Text style={styles.handEmoji}>{emojiOf(match.rpsOpp)}</Text>
            <Text style={styles.handName} numberOfLines={1}>{match.opponent}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.resultEmoji}>{win ? '🏆' : draw ? '🤝' : '💦'}</Text>
      )}
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

      {wantRematch ? (
        // 내가 다시하기를 눌렀다 — 준비 현황(1/2 → 2/2)과 상대 응답을 보여준다.
        <View style={styles.rematchBox}>
          <View style={styles.readyRow}>
            <View style={[styles.readyPill, styles.readyPillOn]}>
              <Text style={[styles.readyPillTxt, styles.readyPillTxtOn]}>나 ✓</Text>
            </View>
            <View style={[styles.readyPill, oppReadied && styles.readyPillOn]}>
              {oppReadied ? (
                <Text style={[styles.readyPillTxt, styles.readyPillTxtOn]}>{match.opponent} ✓</Text>
              ) : (
                <>
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                  <Text style={styles.readyPillTxt} numberOfLines={1}>{match.opponent}</Text>
                </>
              )}
            </View>
          </View>
          <Text style={styles.readyCount}>{ready} / 2 준비됨</Text>
          <Text style={styles.readyHint}>
            {insufficient
              ? '상대의 PB가 부족해 다시할 수 없어요.'
              : oppReadied
                ? '곧 시작해요…'
                : `${match.opponent} 님의 수락을 기다리는 중…`}
          </Text>

          {showFindNew || insufficient ? (
            <TouchableOpacity activeOpacity={0.9} onPress={onFindNew} style={styles.findNewBtn}>
              <Text style={styles.findNewTxt}>새 상대 찾기</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        // 아직 안 눌렀다 — 다시하기 버튼. 상대가 먼저 눌렀으면 강조해서 알려준다.
        <>
          {oppReadied ? (
            <Text style={styles.oppWantsTxt}>🔥 {match.opponent} 님이 다시하기를 기다려요!</Text>
          ) : null}
          <TouchableOpacity activeOpacity={0.9} onPress={onRematch} style={styles.againBtn}>
            <LinearGradient colors={['#7C5CFF', '#4F6BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.againGrad}>
              <Text style={styles.againTxt}>
                다시하기{ready > 0 ? `  ${ready}/2` : ''}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={styles.againSub}>같은 상대와 한 판 더 · {match.stake} PB</Text>
        </>
      )}

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
  // 이모지는 글리프가 커서(특히 iOS) 줄 박스에 잘리기 쉽다 — lineHeight/height 를
  // 넉넉히 주고 가운데 정렬해, 확대·좌우반전 때도 손끝이 안 잘리게 한다.
  handEmoji: {
    fontSize: 54,
    lineHeight: 78,
    height: 78,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
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
  rpsBeat: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  rpsRevealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  resultTitle: { fontSize: 30, fontWeight: '900' },
  resultGame: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: 6 },
  deltaBox: { alignItems: 'center', borderWidth: 2, borderRadius: radius.xl, paddingVertical: spacing.lg, paddingHorizontal: spacing['2xl'], marginTop: spacing.xl, marginBottom: spacing.xl, minWidth: 180 },
  deltaTxt: { fontSize: 30, fontWeight: '900' },
  deltaSub: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary, marginTop: 4 },
  againBtn: { width: CARD_W },
  againGrad: { borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  againTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  againSub: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary, marginTop: spacing.sm },
  lobbyBtn: { marginTop: spacing.md, paddingVertical: 10 },
  lobbyBtnTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '700' },

  /* rps 카운트다운 */
  rpsRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  rpsRingHot: { borderColor: colors.coral },
  rpsRingDone: { borderColor: colors.success },
  rpsRingTxt: { fontSize: 30, fontWeight: '900', color: colors.primary },
  rpsRingTxtHot: { color: colors.coral },
  rpsRingTxtDone: { color: colors.success },
  rpsHint: { marginTop: spacing.lg, fontSize: 13, fontWeight: '700', color: colors.textTertiary },

  /* 재대결 준비 현황 */
  rematchBox: { width: CARD_W, alignItems: 'center', gap: spacing.sm },
  readyRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  readyPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: colors.line,
  },
  readyPillOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  readyPillTxt: { fontSize: 13.5, fontWeight: '800', color: colors.textSecondary, maxWidth: 110 },
  readyPillTxtOn: { color: colors.primary },
  readyCount: { fontSize: 16, fontWeight: '900', color: colors.textPrimary, marginTop: spacing.sm },
  readyHint: { fontSize: 13, fontWeight: '700', color: colors.textTertiary, textAlign: 'center' },
  findNewBtn: {
    marginTop: spacing.md,
    width: '100%',
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  findNewTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
  oppWantsTxt: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.coral,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
});
