import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { BlurBackdrop } from '@/components/ui/BlurBackdrop';
import { AppButton } from '@/components/ui/kit';
import { useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import { APP_WIDTH, colors, gradients, radius, shadow, spacing, type } from '@/theme';

type ReviewScreenProps = {
  onBack?: () => void;
};

// 리뷰 인증 — 영수증 사진 한 장으로 끝내는 흐름.
//
//   ① 방문한 매장의 영수증을 찍어 올린다
//   ② 서버가 읽어 매장명·지역을 채운다 → 확인하고, 별점과 리뷰는 여기서 직접 쓴다
//
// 예전에는 다른 플랫폼의 '리뷰 쓰기 완료' 화면을 캡처하게 했다. 그건 "다른 데
// 리뷰를 썼다"는 증거지 "이 매장에 갔다"는 증거가 아니었고, 무엇보다 리뷰를 PEED
// 밖에서 쓰게 만들었다. 영수증은 사업자등록번호로 매장이 특정되고, 승인번호로
// 재제출이 걸리며, 주소에 구(區)까지 찍혀 있어 도장 지역까지 정확해진다.
//
// 별점·본문은 영수증에 없는 값이라 자동으로 채워지지 않는다. 그게 이 방식의 요지다 —
// 리뷰는 남의 플랫폼에서 옮겨 오는 게 아니라 PEED 안에서 쓰는 글이다.
//
// 그 전에는 매장명·인원·금액·메뉴·플랫폼·별점·본문을 손으로 다 입력하고,
// 버닝 매장인지도 유저가 직접 골라야 했다(모르고 일반으로 고르면 2PB만 들어갔다).
// 이제 버닝 판정은 서버가 매장명으로 하므로 유형을 고르는 단계 자체가 없다.

// 리뷰 인증 방법 안내 — 5장. 예전 키워드(「PEED)」)·일회용 코드·완료 화면 캡처
// 방식을 걷어내고 지금 흐름(영수증 한 장 + PEED 안에서 쓰는 리뷰)에 맞춰 다시 썼다.
// 장마다 그라디언트를 달리 준다. 차가운 색에서 따뜻한 색으로 흐르게 두면
// 다섯 장이 무작위가 아니라 하나의 순서로 읽힌다. 전부 흰 글씨가 얹히는
// 계열만 골랐다(lime 은 밝아서 히어로 바탕으로 못 쓴다).
const STEPS = [
  {
    emoji: '🧾',
    grad: gradients.brandDiagonal,
    title: '영수증을\n챙겨요',
    tip: '방문한 매장의 영수증이면 돼요. 다른 앱에 리뷰를 쓰거나 코드를 붙일 필요는 없어요.',
  },
  {
    emoji: '📸',
    grad: gradients.dusk,
    title: '영수증을\n찍어 올려요',
    tip: '상호·사업자번호·결제일시가 보이게 반듯하게 찍어주세요. 2주 안의 영수증이면 OK.',
  },
  {
    emoji: '💎',
    grad: gradients.teal,
    title: '매장명·지역은\n자동으로 채워져요',
    tip: 'PEED가 영수증을 읽어 매장명·지역을 채워요. 별점과 리뷰만 적으면 PB가 바로 적립돼요.',
  },
  {
    emoji: '📷',
    grad: gradients.sunset,
    title: '이용 사진도\n함께 올려요',
    tip: '이용 사진을 올리면 내 피드에도 게시돼요. 안 올리면 인증·PB 적립만 되고 피드엔 안 올라가요. (최대 5장)',
  },
  {
    emoji: '⚠️',
    grad: gradients.hot,
    title: '인증 전\n확인해 주세요',
    // 예전엔 이 장만 tip 이 비어 있어서 혼자 다른 화면처럼 보였다.
    // 메신저 이야기를 여기 적어 두는 이유: 카톡으로 받은 사진은 촬영 정보가 지워져서
    // 검수 대상이 되는데, 미리 말해 주지 않으면 왜 걸렸는지 알 길이 없다.
    tip: '같은 영수증은 한 번만 인증돼요. 메신저로 받은 사진은 촬영 정보가 지워지니 직접 찍어주세요.',
  },
] as const;

const CARD_W = Math.min(APP_WIDTH - spacing.lg * 2, 560);
const MODAL_MAX_H = Math.round(Dimensions.get('window').height * 0.92);
const INTRO_W = Math.min(CARD_W - spacing.lg * 2, 440);

/** 필수 칸. 비면 제출을 막고, 어느 칸이 비었는지 이름으로 알려준다. */
type FieldKey = 'store' | 'rating' | 'comment';

/** 사진에서 읽어 서버로 같이 보내는 촬영 정보 — 글자와 무관한 두 번째 증거. */
type ShotExif = { shotAt: number; hasGps: boolean };

// 별점 옆에 붙는 말. 숫자만 있으면 4.5 가 좋은 점수인지 감이 안 온다.
const RATING_WORDS = ['별로예요', '아쉬워요', '괜찮아요', '좋아요', '최고예요'];

/** 카드 색 계열 — 네 장이 각각 다른 색을 쓰도록 묶어 둔다. */
const TONES = {
  brand: {
    grad: gradients.brandDiagonal,
    soft: colors.primarySoft,
    ink: colors.primary,
    chipFg: colors.white,
  },
  coral: {
    grad: gradients.hot,
    soft: colors.coralSoft,
    ink: colors.coralDeep,
    chipFg: colors.white,
  },
  lime: {
    grad: gradients.lime,
    soft: colors.limeSoft,
    ink: colors.limeInk,
    chipFg: colors.limeInk,
  },
  teal: {
    grad: gradients.teal,
    soft: colors.tealSoft,
    ink: colors.teal,
    chipFg: colors.white,
  },
} as const;

type Tone = keyof typeof TONES;

const VIS_OPTIONS = [
  { pub: true, icon: 'earth', title: '공개' },
  { pub: false, icon: 'lock-closed', title: '비공개' },
] as const;

function CloseButton({ onPress }: { onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.closeBtn} onPress={onPress} hitSlop={8}>
      <Ionicons name="close" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------- 별점 */

// 드래그 가능한 별점 — 탭 또는 드래그로 0.5~5.0(소수점 1자리)을 고른다.
const STAR_SIZE = 38;

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number) => void;
}) {
  const rowWRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const setFromX = (x: number) => {
    const w = rowWRef.current;
    if (w <= 0) return;
    let r = (x / w) * 5;
    r = Math.round(r * 10) / 10;
    r = Math.max(0.5, Math.min(5, r));
    onChangeRef.current(r);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })
  ).current;

  const rating = value ?? 0;

  return (
    <View style={styles.starRow}>
      <View
        style={styles.starTrack}
        onLayout={(e) => {
          rowWRef.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, rating - i));
          return (
            <View key={i} style={styles.starCell} pointerEvents="none">
              <Ionicons name="star" size={STAR_SIZE} color={colors.lineStrong} />
              <View style={[styles.starFill, { width: STAR_SIZE * fill }]}>
                <Ionicons name="star" size={STAR_SIZE} color={colors.tangerine} />
              </View>
            </View>
          );
        })}
      </View>
      {value ? <Text style={styles.starLabel}>{value.toFixed(1)}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------- 화면 */

export default function ReviewScreen({ onBack }: ReviewScreenProps) {
  const { pb, earn, setBalance } = usePb();
  const { addPost, me, refreshPassport } = useFeed();

  const [stage, setStage] = useState<'prep' | 'form' | 'success'>('prep');
  const [step, setStep] = useState(1);
  // 안내 5장의 본문 높이를 맞추는 기준값. 가장 긴 5장(경고문 + 체크박스) 기준.
  const [bodyMinH, setBodyMinH] = useState(136);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // 영수증 판독
  const [shotImage, setShotImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState('');
  const [scanDone, setScanDone] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [autoBurning, setAutoBurning] = useState(false);
  const [autoReward, setAutoReward] = useState(2);
  const [scannedStore, setScannedStore] = useState('');
  // 영수증에서 읽은 결제 사실 — "이 영수증이 맞나"를 유저가 눈으로 확인하는 자리.
  const [receipt, setReceipt] = useState<{ at: number; total: number } | null>(null);

  // 폼 (판독 결과로 자동 채워지고, 유저가 고칠 수 있다)
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);

  // 선택 정보 — 접어 둔다. 필수였을 때 이탈 이유였던 칸들이다.
  const [extraOpen, setExtraOpen] = useState(false);
  const [peopleCount, setPeopleCount] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [menu, setMenu] = useState('');

  // 필수 칸 안내 — 제출을 한 번이라도 시도했는지, 그리고 빈 칸으로 스크롤·포커스
  // 하기 위한 좌표. 예전에는 버튼을 죽여만 뒀더니 유저가 이유를 알 수 없었다.
  const [attempted, setAttempted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const confirmCardY = useRef(0);
  const fieldY = useRef<Record<FieldKey, number>>({ store: 0, rating: 0, comment: 0 });
  const storeRef = useRef<TextInput>(null);
  const commentRef = useRef<TextInput>(null);

  // 결과
  const [earnedPb, setEarnedPb] = useState(0);
  const [awardedBurning, setAwardedBurning] = useState(false);
  const [stampResult, setStampResult] = useState<{
    region: string;
    count: number;
    goal: number;
    done: boolean;
    bonusPb: number;
  } | null>(null);

  /* ---------------------------------------------------------- 초기화 */

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('HIDE_REVIEW_GUIDE');
        if (v === 'true') {
          setDontShowAgain(true);
          setStage('form');
        }
      } catch {
        // 저장값을 못 읽으면 그냥 안내를 보여준다
      }
    })();
  }, []);

  const toggleDontShow = async () => {
    const next = !dontShowAgain;
    setDontShowAgain(next);
    try {
      await AsyncStorage.setItem('HIDE_REVIEW_GUIDE', next ? 'true' : 'false');
    } catch {
      // 저장 실패는 무시 — 다음에 다시 보일 뿐이다
    }
  };

  /* ---------------------------------------------------------- 사진 */

  const pickImage = async (target: 'shot' | 'photos') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('사진 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // 영수증은 줄이지 않는다. 감열지의 가는 획은 재압축·축소에 극도로 약해서,
      // 조금만 줄여도 사업자등록번호 줄이 통째로 사라진다(서버 실측).
      quality: target === 'shot' ? 1 : 0.7,
      allowsMultipleSelection: target === 'photos',
      selectionLimit: target === 'photos' ? 5 : 1,
      base64: target === 'shot',
      // 촬영 시각·위치는 글자와 무관한 두 번째 증거다. 원본을 쥔 이쪽에서 읽어 둔다.
      exif: target === 'shot',
    });
    if (result.canceled) return;

    if (target === 'photos') {
      setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
      return;
    }

    const asset = result.assets[0];
    setShotImage(asset.uri);
    const dataUrl = asset.base64
      ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      : await uriToDataUrl(asset.uri);
    if (dataUrl) scanShot(dataUrl, readAssetExif(asset.exif));
    else setScanErr('사진을 읽지 못했어요. 아래에 직접 입력해 주세요.');
  };

  // 잘못 고른 사진을 뺄 방법이 없어서, 지우려면 화면을 닫고 처음부터 다시
  // 해야 했다. 장수 제한(5장)이 있으니 더 답답한 자리였다.
  const removePhoto = (idx: number) =>
    setPhotos((prev) => prev.filter((_, i) => i !== idx));

  /** 영수증을 서버로 보내 판독한다. 실패해도 손으로 입력해서 계속 진행할 수 있다. */
  const scanShot = async (dataUrl: string, exif: ShotExif | null) => {
    setScanning(true);
    setScanErr('');
    setWarnings([]);
    // 앞서 읽은 결과를 먼저 지운다. 사진을 바꿔 다시 읽었는데 이번 판독이 실패하면
    // 예전 scanId 가 그대로 남아, 지금 리뷰에 **전에 올린 사진**이 증거로 붙는다.
    setReceipt(null);
    setScanId('');
    setScannedStore('');
    setAutoBurning(false);
    setAutoReward(2);
    try {
      const r = await fetch('/api/verify?action=scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot: dataUrl, exif }),
      });
      const d = await r.json();
      if (!d?.ok) {
        setScanErr(
          d?.error === 'ocr_unavailable'
            ? '지금은 자동 입력을 쓸 수 없어요. 아래에 직접 입력해 주세요.'
            : d?.error === 'login_required'
              ? '로그인하면 영수증 인증과 PB 적립을 할 수 있어요.'
              : '판독에 실패했어요. 아래에 직접 입력해 주세요.'
        );
        setScanDone(true);
        return;
      }
      setScanId(String(d.scanId || ''));
      setWarnings(Array.isArray(d.warnings) ? d.warnings : []);
      setAutoBurning(!!d.burning);
      setAutoReward(Number(d.reward) || 2);
      setScannedStore(String(d.scannedStore || ''));

      const rc = d.receipt || {};
      setReceipt({ at: Number(rc.at) || 0, total: Number(rc.total) || 0 });

      // 매장명·지역처럼 '옮겨 적기만 하는' 값만 자동으로 채운다.
      //
      // 별점·본문은 영수증에 없는 값이라 채울 것도 없다. 그게 이 방식으로 바꾼
      // 이유이기도 하다 — 예전 캡처 방식은 남의 플랫폼에 쓴 리뷰를 가져오는 흐름이라,
      // 판독한 본문을 얹어 주면 PEED 피드가 그 복사본이 되어 버렸다.
      const f = d.fields || {};
      if (f.store) setStoreName(String(f.store));
      if (f.category) setCategory(String(f.category));
      if (f.region) setLocation(String(f.region));
      setScanDone(true);
    } catch {
      setScanErr('판독에 실패했어요. 아래에 직접 입력해 주세요.');
      setScanDone(true);
    } finally {
      setScanning(false);
    }
  };

  /* ---------------------------------------------------------- 태그 */

  const addTag = (raw: string) => {
    const t = raw.replace(/[#\s]/g, '').replace(/[^0-9a-zA-Z가-힣]/g, '').trim();
    if (!t) {
      setTagDraft('');
      return;
    }
    setTags((prev) => (prev.includes(t) || prev.length >= 6 ? prev : [...prev, t]));
    setTagDraft('');
  };
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t));

  const suggestedTags = useMemo(() => {
    const out = [category.replace(/\s/g, ''), storeName.replace(/\s/g, '')];
    return Array.from(new Set(out)).filter((t) => t && !tags.includes(t)).slice(0, 4);
  }, [category, storeName, tags]);

  /* ---------------------------------------------------------- 제출 */

  // 필수 세 칸. 예전에는 이 조건이 버튼의 disabled 로만 쓰여서, 유저는 버튼이
  // 왜 안 눌리는지 알 수 없었다. 별점·리뷰 내용은 영수증에 없는 값이라 늘 비어
  // 있는 채로 시작하므로, 무엇이 비었는지 이름으로 알려 주고 눌러도 반응하게 둔다.
  const missing = useMemo(() => {
    const out: { key: FieldKey; label: string; msg: string }[] = [];
    if (!storeName.trim()) {
      out.push({ key: 'store', label: '매장명', msg: '매장명을 적어주세요' });
    }
    if (rating === null) {
      out.push({ key: 'rating', label: '만족도', msg: '별점을 골라주세요' });
    }
    if (!comment.trim()) {
      out.push({
        key: 'comment',
        label: '리뷰 내용',
        msg: '리뷰 내용을 적어주세요. 한 줄이면 충분해요.',
      });
    }
    return out;
  }, [storeName, rating, comment]);

  const isFormValid = missing.length === 0;
  const rewardPb = autoBurning ? autoReward : 2;

  /**
   * 영수증에서 읽은 결제 사실 한 줄 — "8월 12일 · 32,000원".
   * 엉뚱한 사진을 올렸는지 유저가 눈으로 바로 알 수 있는 유일한 자리다.
   * 감열지 판독은 절반쯤 무너지는 게 정상이라, 못 읽은 항목은 그냥 빼고 붙인다.
   */
  const receiptLine = useMemo(() => {
    if (!receipt) return '';
    const parts: string[] = [];
    if (receipt.at) {
      const d = new Date(receipt.at);
      parts.push(`${d.getMonth() + 1}월 ${d.getDate()}일`);
    }
    if (receipt.total) parts.push(`${receipt.total.toLocaleString()}원`);
    return parts.join(' · ');
  }, [receipt]);

  /** 제출을 시도한 뒤에만 빨갛게 — 처음부터 온통 빨간 폼은 겁을 준다. */
  const errAt = (k: FieldKey) => attempted && missing.some((m) => m.key === k);

  /** 빈 칸으로 데려간다. 카드가 접혀 있지 않아도 화면 밖이면 못 보기 때문이다. */
  const goToField = (k: FieldKey) => {
    const y = confirmCardY.current + fieldY.current[k] + spacing.lg - 24;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    if (k === 'store') storeRef.current?.focus();
    if (k === 'comment') commentRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!isFormValid) {
      setAttempted(true);
      goToField(missing[0].key);
      return;
    }
    const reward = rewardPb;
    setEarnedPb(reward);
    setAwardedBurning(autoBurning);
    earn(reward);

    const store = storeName.trim();
    const caption = comment.trim();

    // 게시물에 찍을 도장 지역. 리뷰를 먼저 보내야 알 수 있다.
    const makePost = (stampRegion: string) =>
      // 게시물은 항상 만든다(리뷰 저장이 실패해도). 이용 사진이 없으면 홈 피드에는
      // 안 뜨지만, 공개로 두면 다른 사람이 내 프로필에 놀러 왔을 때 볼 수 있다.
      addPost({
        store,
        category,
        image: photos.length > 0 ? { uri: photos[0] } : undefined,
        rating: rating ?? 5,
        caption,
        tags,
        location,
        people: Number(peopleCount.replace(/[^0-9]/g, '')) || 1,
        price: Number(String(totalPrice).replace(/[^0-9]/g, '')) || 0,
        isBurning: autoBurning,
        earnedPb: reward,
        isPrivate: !isPublic,
        stampRegion,
      });

    // 서버에 리뷰 저장 + PB 적립. 버닝 여부·적립액·도장은 서버가 판정한다.
    //
    // 게시물은 이 응답을 받은 뒤에 만든다 — 도장이 찍혔는지 알아야 게시물에도
    // 도장을 남길 수 있고, 서버가 패스포트와 대조하려면 도장이 이미 찍혀 있어야
    // 한다(순서가 반대면 대조에 실패해 도장이 빠진다).
    fetch('/api/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: me.name,
        handle: me.handle,
        store,
        rating: rating ?? 5,
        caption,
        location,
        scanId,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.balance === 'number') setBalance(d.balance);
        if (typeof d?.award === 'number' && d.award > 0) setEarnedPb(d.award);
        if (typeof d?.burning === 'boolean') setAwardedBurning(d.burning);
        const stampedRegion = d?.stampAdded ? String(d.region || '') : '';
        if (d?.stampAdded) {
          setStampResult({
            region: stampedRegion,
            count: Number(d.stampCount) || 0,
            goal: Number(d.goal) || 5,
            done: !!d.passportDone,
            bonusPb: Number(d.bonusPb) || 0,
          });
        }
        makePost(stampedRegion);
        refreshPassport();
      })
      .catch(() => {
        // 리뷰 저장이 실패해도 글은 남긴다(도장은 못 찍는다).
        makePost('');
      });

    setStampResult(null);
    setStage('success');
  };

  /* ------------------------------------------------------------ 완료 */

  if (stage === 'success') {
    return (
      <BlurBackdrop onPress={onBack}>
        <View style={styles.popupCard}>
          <StatusBar style="dark" />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.centerScroll}>
            <View style={[styles.centerWrap, { alignItems: 'center' }]}>
              <LinearGradient
                colors={awardedBurning ? gradients.hot : gradients.lime}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.successCoin}
              >
                <Text style={styles.successCoinText}>{awardedBurning ? '🔥' : '💎'}</Text>
              </LinearGradient>

              <Text style={styles.successTitle}>PB 적립 완료!</Text>
              <View style={styles.successRewardPill}>
                <Text style={styles.successRewardText}>+{earnedPb} PB 적립</Text>
              </View>
              <Text style={styles.successCurrentPb}>현재 보유 {pb} PB</Text>

              {awardedBurning && (
                <View style={styles.burnBanner}>
                  <Text style={styles.burnBannerText}>
                    🔥 버닝 매장이라 {earnedPb}PB로 적립됐어요!{'\n'}
                    따로 고르지 않아도 PEED가 알아서 챙겨드려요.
                  </Text>
                </View>
              )}

              {stampResult?.done ? (
                <View style={[styles.successStampBadge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.successStampText, { color: colors.primary }]}>
                    🗺️ {stampResult.region} 도장 {stampResult.goal}개 완주! 보너스 +
                    {stampResult.bonusPb} PB 🎉{'\n'}새 지역을 고를 수 있어요
                  </Text>
                </View>
              ) : stampResult ? (
                <View style={styles.successStampBadge}>
                  <Text style={styles.successStampText}>
                    🗺️ {stampResult.region} 도장 {stampResult.count}/{stampResult.goal} 획득!
                  </Text>
                </View>
              ) : null}

              <Text style={styles.successDesc}>
                {photos.length > 0
                  ? '이용 사진과 함께 홈 피드에 게시됐어요! 🎉'
                  : isPublic
                    ? '이용 사진이 없어 홈 피드엔 안 뜨지만,\n내 프로필에서는 누구나 볼 수 있어요.'
                    : '비공개로 저장했어요. 나만 볼 수 있어요.'}
              </Text>

              <View style={styles.successInfoCard}>
                <InfoLine label="매장명" value={storeName || '-'} />
                <InfoLine label="영수증" value={receiptLine || '-'} />
                <InfoLine
                  label="만족도"
                  value={rating ? `${rating.toFixed(1)}점` : '-'}
                  last
                />
              </View>

              <AppButton
                label="홈으로 돌아가기"
                variant="gradient"
                onPress={() => onBack?.()}
                style={{ width: '100%' }}
              />
            </View>
          </ScrollView>
        </View>
      </BlurBackdrop>
    );
  }

  /* ------------------------------------------------------------ 준비 */

  if (stage === 'prep') {
    const s = STEPS[step - 1];
    const last = step === STEPS.length;
    return (
      <BlurBackdrop onPress={onBack}>
        <View style={styles.popupCard}>
          <StatusBar style="dark" />
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>리뷰 인증 방법</Text>
            <View style={styles.topBarRight}>
              {/* 다섯 장을 다 넘겨야 시작할 수 있는 건 아니다. 이미 아는 사람은
                  바로 건너뛸 수 있어야 한다(5장 중 4장이 첫 방문용 설명이다). */}
              <TouchableOpacity onPress={() => setStage('form')} hitSlop={8}>
                <Text style={styles.skipText}>건너뛰기</Text>
              </TouchableOpacity>
              <CloseButton onPress={onBack} />
            </View>
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.introScroll}>
            <View style={[styles.introCard, { width: INTRO_W }]}>
              {/* 스텝퍼 — 지나온 장은 체크, 지금 장은 번호. 굵기만 다른 점 다섯
                  개였을 때는 몇 장 중 몇 번째인지, 되돌아갈 수 있는지 몰랐다. */}
              <View style={styles.stepper}>
                {STEPS.map((_, i) => {
                  const n = i + 1;
                  const done = n < step;
                  const cur = n === step;
                  return (
                    <Fragment key={n}>
                      {i > 0 && (
                        <View style={[styles.stepLine, n <= step && styles.stepLineOn]} />
                      )}
                      <TouchableOpacity
                        onPress={() => setStep(n)}
                        activeOpacity={0.8}
                        hitSlop={6}
                        style={[
                          styles.stepNode,
                          done && styles.stepNodeDone,
                          cur && styles.stepNodeCur,
                        ]}
                      >
                        {done ? (
                          <Ionicons name="checkmark" size={13} color={colors.white} />
                        ) : (
                          <Text
                            style={[styles.stepNodeText, cur && styles.stepNodeTextCur]}
                          >
                            {n}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </Fragment>
                  );
                })}
              </View>

              <LinearGradient
                colors={s.grad}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.introHero}
              >
                {/* 큰 번호를 워터마크로 깔아 장이 넘어간 게 한눈에 보이게 한다. */}
                <Text style={styles.heroWatermark}>{String(step).padStart(2, '0')}</Text>
                <Text style={styles.introStepTag}>
                  STEP {step} / {STEPS.length}
                </Text>
                <View style={styles.heroBadge}>
                  <Text style={styles.introEmoji}>{s.emoji}</Text>
                </View>
              </LinearGradient>

              <Text style={styles.introStepTitle}>{s.title}</Text>

              {/* 장마다 본문 길이가 달라 넘길 때 카드 크기가 튄다. 가장 긴 장(5장 —
                  경고문 + 다시 보지 않기)에 맞춰 최소 높이를 잡아 다섯 장을 같은
                  크기로 둔다. 폰트 실측이 예상과 다를 수 있어, 더 큰 장이 나오면
                  그 값으로 늘려 잡는다(줄이지는 않는다). */}
              <View
                style={{ minHeight: bodyMinH }}
                onLayout={(e) => {
                  const h = Math.ceil(e.nativeEvent.layout.height);
                  if (h > bodyMinH) setBodyMinH(h);
                }}
              >
                <View style={styles.tipBox}>
                  <View style={styles.tipEdge} />
                  <View style={styles.tipChip}>
                    <Text style={styles.tipChipText}>TIP</Text>
                  </View>
                  <Text style={styles.tipText}>{s.tip}</Text>
                </View>

                {last && (
                  <>
                    <View style={styles.warningBox}>
                      <View style={styles.warningEdge} />
                      <Ionicons name="alert-circle" size={16} color={colors.coralDeep} />
                      <Text style={styles.warningText}>
                        부정 인증·중복·허위 리뷰는 검토 후 지급 취소되거나 이용이
                        제한될 수 있어요.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={toggleDontShow}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.checkbox, dontShowAgain && styles.checkboxOn]}>
                        {dontShowAgain && (
                          <Ionicons name="checkmark" size={14} color={colors.white} />
                        )}
                      </View>
                      <Text style={styles.checkboxLabel}>다시 보지 않기</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              <View style={styles.introButtons}>
                {step > 1 && (
                  <AppButton
                    label="이전"
                    variant="ghost"
                    onPress={() => setStep((v) => Math.max(1, v - 1))}
                    style={{ flex: 1 }}
                  />
                )}
                <AppButton
                  label={last ? '시작하기' : '다음'}
                  variant="gradient"
                  onPress={() => (last ? setStage('form') : setStep((v) => v + 1))}
                  style={{ flex: 1.5 }}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </BlurBackdrop>
    );
  }

  /* ------------------------------------------------------------ 입력 */

  const shotStatus = scanning
    ? '읽는 중'
    : !shotImage
      ? '권장'
      : scanErr
        ? '직접 입력'
        : '자동 입력됨';
  const filled = 3 - missing.length;
  const ratingWord =
    rating === null
      ? ''
      : RATING_WORDS[Math.min(4, Math.max(0, Math.ceil(rating) - 1))];

  return (
    <BlurBackdrop onPress={onBack}>
      <View style={styles.popupCard}>
        <StatusBar style="dark" />

        <ScrollView
          ref={scrollRef}
          style={styles.modalScroll}
          contentContainerStyle={styles.formScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerWrap}>
            {/* ── 머리말 + 진행률 ──
                필수 세 칸이 얼마나 찼는지 맨 위에서 바로 보이게 한다. 스크롤을
                내리기 전에도 "무엇이 남았는지" 알 수 있어야 한다. */}
            <View style={styles.topBarInline}>
              <View style={styles.topBarTexts}>
                <Text style={styles.topBarTitle}>리뷰 인증</Text>
                <Text style={styles.topBarSub}>
                  {isFormValid
                    ? '다 채웠어요 · 바로 올릴 수 있어요'
                    : missing.length === 1
                      ? `${missing[0].label}만 채우면 끝!`
                      : `남은 항목 · ${missing.map((m) => m.label).join(', ')}`}
                </Text>
              </View>
              <CloseButton onPress={onBack} />
            </View>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={gradients.brandDiagonal}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.progressFill,
                  { width: `${Math.round((filled / 3) * 100)}%` as `${number}%` },
                ]}
              />
            </View>

            {/* ── 1. 영수증 올리기 ── */}
            <SectionCard
              tone="brand"
              step={1}
              title="영수증"
              desc="영수증을 올리면 매장명·지역이 채워져요"
              status={shotStatus}
              statusTone={shotImage && !scanErr && !scanning ? 'lime' : 'brand'}
            >
              <TouchableOpacity
                style={[styles.shotBox, !!shotImage && styles.shotBoxFilled]}
                onPress={() => pickImage('shot')}
                activeOpacity={0.85}
                disabled={scanning}
              >
                {shotImage ? (
                  <>
                    <Image source={{ uri: shotImage }} style={styles.shotPreview} />
                    {/* 사진을 잘못 골랐을 때 다시 고를 수 있다는 걸 몰라서
                        화면을 닫고 처음부터 하는 경우가 있었다. */}
                    <View style={styles.shotSwap}>
                      <Ionicons name="repeat" size={13} color={colors.white} />
                      <Text style={styles.shotSwapText}>다른 사진으로 바꾸기</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <LinearGradient
                      colors={gradients.brandDiagonal}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.shotIcon}
                    >
                      <Ionicons name="receipt-outline" size={26} color={colors.white} />
                    </LinearGradient>
                    <Text style={styles.shotTitle}>영수증 사진 올리기</Text>
                    <Text style={styles.shotDesc}>
                      상호·사업자번호·결제일시가 보이게 찍어주세요
                    </Text>
                    <View style={styles.autoFillRow}>
                      {['매장명', '지역', '방문 확인'].map((t) => (
                        <View key={t} style={styles.autoFillChip}>
                          <Ionicons name="sparkles" size={10} color={colors.primary} />
                          <Text style={styles.autoFillText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </TouchableOpacity>

              {scanning && <Notice tone="info" busy text="영수증을 읽고 있어요…" />}

              {!scanning && scanDone && !scanErr && (
                <Notice
                  tone="ok"
                  icon="checkmark-circle"
                  text={
                    receiptLine
                      ? `영수증을 읽었어요 · ${receiptLine}. 별점과 리뷰 내용만 적어주세요.`
                      : '영수증을 확인했어요. 별점과 리뷰 내용만 적어주세요.'
                  }
                />
              )}

              {!!scanErr && <Notice tone="warn" icon="alert-circle" text={scanErr} />}

              {warnings.map((w) => (
                <Notice key={w} tone="warn" icon="information-circle" text={w} />
              ))}

              {!shotImage && (
                <TouchableOpacity onPress={() => setStage('prep')} activeOpacity={0.7}>
                  <Text style={styles.backToPrep}>← 안내 다시 보기</Text>
                </TouchableOpacity>
              )}
            </SectionCard>

            {/* ── 2. 확인하기 ── */}
            <SectionCard
              tone="coral"
              step={2}
              title="내용 확인"
              desc="매장명은 확인만, 별점·리뷰 내용은 직접 적어주세요"
              status={isFormValid ? '확인 완료' : `필수 ${filled}/3`}
              statusTone={isFormValid ? 'lime' : 'coral'}
              onLayout={(e) => {
                confirmCardY.current = e.nativeEvent.layout.y;
              }}
            >
              <View
                onLayout={(e) => {
                  fieldY.current.store = e.nativeEvent.layout.y;
                }}
              >
                <FieldLabel text="매장명" required error={errAt('store')} />
                <TextInput
                  ref={storeRef}
                  style={[styles.input, errAt('store') && styles.inputErr]}
                  placeholder="예: 멘노아지 강남역신분당선점"
                  placeholderTextColor={colors.textTertiary}
                  value={storeName}
                  onChangeText={setStoreName}
                />
                {errAt('store') ? (
                  <ErrText text="매장명을 적어주세요" />
                ) : autoBurning ? (
                  <View style={styles.burnPill}>
                    <Text style={styles.burnPillText}>
                      🔥 버닝 매장이에요 · {autoReward}PB 적립
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.helper}>
                    간판에 적힌 이름 그대로 적으면 버닝 매장이 자동으로 인식돼요
                  </Text>
                )}
                {!!scannedStore && scannedStore !== storeName && (
                  <Text style={styles.helper}>영수증에서 읽은 상호: {scannedStore}</Text>
                )}
              </View>

              <View
                onLayout={(e) => {
                  fieldY.current.rating = e.nativeEvent.layout.y;
                }}
              >
                <FieldLabel
                  text="만족도"
                  required
                  error={errAt('rating')}
                  hint={ratingWord}
                />
                <View style={[styles.starWrap, errAt('rating') && styles.starWrapErr]}>
                  <StarRating value={rating} onChange={setRating} />
                </View>
                {errAt('rating') ? (
                  <ErrText text="별점을 골라주세요" />
                ) : (
                  <Text style={styles.helper}>드래그하면 4.5처럼 소수점까지 조절돼요</Text>
                )}
              </View>

              <View
                onLayout={(e) => {
                  fieldY.current.comment = e.nativeEvent.layout.y;
                }}
              >
                <FieldLabel
                  text="리뷰 내용"
                  required
                  error={errAt('comment')}
                  hint={`${comment.length}/500`}
                />
                <TextInput
                  ref={commentRef}
                  style={[styles.textarea, errAt('comment') && styles.inputErr]}
                  placeholder="예: 분위기 좋고 음식이 빨리 나왔어요!"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={500}
                  textAlignVertical="top"
                  value={comment}
                  onChangeText={setComment}
                />
                {errAt('comment') ? (
                  <ErrText text="리뷰 내용을 적어주세요. 한 줄이면 충분해요." />
                ) : (
                  /* 영수증에는 없는 값이라 채워지지 않는다는 걸 분명히 말해 준다.
                     전에는 자동으로 채워지는 칸이라 "고쳐주세요"라고 안내했는데,
                     비어 있으면 채울 게 없는 줄 알고 그냥 넘어가려 했다. */
                  <Text style={styles.helper}>
                    영수증에는 없는 칸이에요. 직접 한 줄만 적어주세요.
                  </Text>
                )}
              </View>

              <FieldLabel text="태그" />
              <View style={styles.tagInputWrap}>
                {tags.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={styles.tagChip}
                    onPress={() => removeTag(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.tagChipText}>#{t}</Text>
                    <Ionicons name="close" size={12} color={colors.primary} />
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={styles.tagInput}
                  placeholder={tags.length ? '태그 추가' : '예: #홍대이자카야 (스페이스로 추가)'}
                  placeholderTextColor={colors.textTertiary}
                  value={tagDraft}
                  onChangeText={(v) => (/\s/.test(v) ? addTag(v) : setTagDraft(v))}
                  onSubmitEditing={() => addTag(tagDraft)}
                  blurOnSubmit={false}
                  returnKeyType="done"
                />
              </View>
              {suggestedTags.length > 0 && (
                <View style={styles.tagSuggest}>
                  <Text style={styles.tagSuggestLabel}>추천</Text>
                  {suggestedTags.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={styles.tagSuggestChip}
                      onPress={() => addTag(t)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.tagSuggestText}>#{t}</Text>
                      <Ionicons name="add" size={12} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* 선택 정보 — 접어 둔다 */}
              <TouchableOpacity
                style={styles.extraToggle}
                onPress={() => setExtraOpen((v) => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.extraToggleText}>인원 · 금액 · 메뉴 적기 (선택)</Text>
                <Ionicons
                  name={extraOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              {extraOpen && (
                <View>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <Text style={styles.label}>인원</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="예: 2명"
                        placeholderTextColor={colors.textTertiary}
                        value={peopleCount}
                        onChangeText={setPeopleCount}
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={styles.label}>총 금액</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="예: 42,000원"
                        placeholderTextColor={colors.textTertiary}
                        value={totalPrice}
                        onChangeText={setTotalPrice}
                      />
                    </View>
                  </View>
                  <Text style={styles.label}>주문 메뉴</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: 파스타, 하이볼 2잔"
                    placeholderTextColor={colors.textTertiary}
                    value={menu}
                    onChangeText={setMenu}
                  />
                </View>
              )}
            </SectionCard>

            {/* ── 3. 이용 사진 ── */}
            <SectionCard
              tone="lime"
              step={3}
              title="이용 사진"
              desc="올리면 홈 피드까지 함께 올라가요"
              status={photos.length ? `${photos.length}/5` : '선택'}
              statusTone="lime"
            >
              <View style={styles.photoGrid}>
                {photos.map((uri, i) => (
                  <View key={`${uri}-${i}`} style={styles.photoTile}>
                    <Image source={{ uri }} style={styles.photoImg} />
                    <TouchableOpacity
                      style={styles.photoDel}
                      onPress={() => removePhoto(i)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={12} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < 5 && (
                  <TouchableOpacity
                    style={styles.photoAdd}
                    onPress={() => pickImage('photos')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add" size={20} color={colors.tangerine} />
                    <Text style={styles.photoAddText}>
                      {photos.length ? '추가' : '사진 고르기'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Notice
                tone={photos.length > 0 ? 'ok' : 'info'}
                icon={photos.length > 0 ? 'checkmark-circle' : 'information-circle'}
                text={
                  photos.length > 0
                    ? '홈 피드와 내 프로필에 모두 게시돼요.'
                    : '사진이 없어도 PB는 적립돼요. 다만 홈 피드엔 안 뜨고 내 프로필에서만 보여요.'
                }
              />
            </SectionCard>

            {/* ── 4. 공개 설정 ── */}
            <SectionCard
              tone="teal"
              step={4}
              title="공개 범위"
              desc="올린 뒤에도 바꿀 수 있어요"
              status={isPublic ? '공개' : '비공개'}
              statusTone="teal"
            >
              {VIS_OPTIONS.map((o) => {
                const on = isPublic === o.pub;
                const desc = o.pub
                  ? photos.length > 0
                    ? '홈 피드에 뜨고, 내 프로필에 놀러 온 사람도 볼 수 있어요'
                    : '홈 피드엔 안 뜨지만, 내 프로필에 놀러 온 사람은 볼 수 있어요'
                  : '사진이 있어도 홈에 안 뜨고, 남에겐 안 보여요';
                return (
                  <TouchableOpacity
                    key={o.title}
                    style={[styles.visOpt, on && styles.visOptOn]}
                    onPress={() => setIsPublic(o.pub)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.visIcon, on && styles.visIconOn]}>
                      <Ionicons
                        name={o.icon}
                        size={16}
                        color={on ? colors.white : colors.textSecondary}
                      />
                    </View>
                    <View style={styles.visTexts}>
                      <Text style={[styles.visTitle, on && styles.visTitleOn]}>
                        {o.title}
                      </Text>
                      <Text style={styles.visDesc}>{desc}</Text>
                    </View>
                    <View style={[styles.radio, on && styles.radioOn]}>
                      {on && <Ionicons name="checkmark" size={12} color={colors.white} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </SectionCard>

            {/* ── 제출 ──
                버튼을 죽이지 않고 무엇이 비었는지 말해 준다. 눌러 보고서야
                이유를 아는 편이, 눌리지도 않는 버튼을 노려보는 것보다 낫다. */}
            {!isFormValid && (
              <View style={[styles.missBar, attempted && styles.missBarHot]}>
                <Ionicons
                  name={attempted ? 'alert-circle' : 'ellipse-outline'}
                  size={15}
                  color={attempted ? colors.coralDeep : colors.textTertiary}
                />
                <Text style={[styles.missText, attempted && styles.missTextHot]}>
                  {attempted
                    ? missing[0].msg
                    : `남은 항목 · ${missing.map((m) => m.label).join(', ')}`}
                </Text>
              </View>
            )}

            <View style={styles.bottomRow}>
              <AppButton
                label="뒤로"
                variant="ghost"
                onPress={onBack}
                style={{ flex: 1 }}
              />
              <AppButton
                label={isFormValid ? `작성 완료 · +${rewardPb}PB` : '작성 완료'}
                variant="gradient"
                onPress={handleSubmit}
                style={[{ flex: 1.8 }, !isFormValid && styles.ctaDim]}
              />
            </View>

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </View>
    </BlurBackdrop>
  );
}

/* ------------------------------------------------------------- sub-parts */

/**
 * 카드 한 장 — 왼쪽 그라디언트 엣지 + 번호 칩 + 제목/설명 + 상태 알약.
 * 예전에는 카드마다 Badge 하나만 얹혀 있어서 네 장이 다 비슷해 보였고,
 * 각 카드가 지금 어떤 상태인지(자동 입력됐는지, 몇 개 남았는지)는 알 수 없었다.
 */
function SectionCard({
  tone,
  step,
  title,
  desc,
  status,
  statusTone,
  onLayout,
  children,
}: {
  tone: Tone;
  step: number;
  title: string;
  desc?: string;
  status?: string;
  statusTone?: Tone;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const t = TONES[tone];
  const s = TONES[statusTone ?? tone];
  return (
    <View style={styles.card} onLayout={onLayout}>
      <LinearGradient
        colors={t.grad}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardEdge}
      />
      <View style={styles.cardHead}>
        <LinearGradient
          colors={t.grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.stepChip}
        >
          <Text style={[styles.stepChipText, { color: t.chipFg }]}>{step}</Text>
        </LinearGradient>
        <View style={styles.cardHeadTexts}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!desc && <Text style={styles.cardDesc}>{desc}</Text>}
        </View>
        {!!status && (
          <View style={[styles.statusPill, { backgroundColor: s.soft }]}>
            <Text style={[styles.statusPillText, { color: s.ink }]}>{status}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

/**
 * 라벨 + 필수/선택 표시 + 오른쪽 보조값(글자 수·별점 말).
 * '필수' 를 라벨에 붙여 두지 않으면, 자동으로 채워지는 칸이 비었을 때
 * 유저가 그걸 자기가 채워야 하는 칸이라고 생각하지 못한다.
 */
function FieldLabel({
  text,
  required,
  error,
  hint,
}: {
  text: string;
  required?: boolean;
  error?: boolean;
  hint?: string;
}) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.labelText}>{text}</Text>
      {required ? (
        <View style={[styles.reqPill, error && styles.reqPillErr]}>
          <Text style={[styles.reqPillText, error && styles.reqPillTextErr]}>필수</Text>
        </View>
      ) : (
        <Text style={styles.optText}>선택</Text>
      )}
      <View style={{ flex: 1 }} />
      {!!hint && <Text style={styles.labelHint}>{hint}</Text>}
    </View>
  );
}

/** 빈 칸 바로 아래에 붙는 이유. */
function ErrText({ text }: { text: string }) {
  return (
    <View style={styles.errRow}>
      <Ionicons name="alert-circle" size={13} color={colors.coralDeep} />
      <Text style={styles.errText}>{text}</Text>
    </View>
  );
}

/** 상태 줄 — 왼쪽에 색 엣지를 세워 카드 안에서도 눈에 걸리게 한다. */
function Notice({
  tone,
  icon,
  text,
  busy,
}: {
  tone: 'info' | 'ok' | 'warn';
  icon?: keyof typeof Ionicons.glyphMap;
  text: string;
  busy?: boolean;
}) {
  const c =
    tone === 'ok'
      ? { bg: '#E8F8EF', fg: colors.success, edge: colors.success }
      : tone === 'warn'
        ? { bg: colors.tangerineSoft, fg: colors.textSecondary, edge: colors.tangerine }
        : { bg: colors.surface, fg: colors.textSecondary, edge: colors.lineStrong };
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }]}>
      <View style={[styles.noticeEdge, { backgroundColor: c.edge }]} />
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={icon ?? 'information-circle'} size={16} color={c.edge} />
      )}
      <Text style={[styles.noticeText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

function InfoLine({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoLine, !last && styles.infoLineBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/**
 * 사진에서 촬영 시각과 위치 유무만 뽑는다.
 *
 * 서버도 올라온 바이트에서 직접 EXIF 를 읽지만, 갤러리에서 고른 사진을 앱이 다시
 * 인코딩해 올리는 과정에서 메타데이터가 통째로 날아가는 경우가 있다. 그러면 직접
 * 찍은 영수증도 '촬영 정보 없는 사진'으로 걸린다. 원본을 쥐고 있는 이쪽에서 읽어
 * 함께 보내 그 오차를 메운다(서버는 자기가 읽어낸 값이 없을 때만 이걸 쓴다).
 *
 * 키 이름은 안드로이드(ExifInterface)와 iOS 가 조금씩 달라서 흔한 것을 모두 본다.
 */
function readAssetExif(exif: Record<string, any> | null | undefined): ShotExif | null {
  if (!exif) return null;
  const raw = String(exif.DateTimeOriginal || exif.DateTimeDigitized || exif.DateTime || '');
  const m = raw.match(/(\d{4})[:\-.](\d{2})[:\-.](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  const t = m
    ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime()
    : 0;
  const lat = exif.GPSLatitude ?? exif.GPSLatitudeRef;
  return {
    shotAt: isFinite(t) ? t : 0,
    hasGps: lat !== undefined && lat !== null && lat !== 0 && lat !== '',
  };
}

/** 웹에서 blob/file URI 를 data URL 로 — 판독 요청에 실어 보내려면 필요하다. */
async function uriToDataUrl(uri: string): Promise<string> {
  try {
    if (uri.startsWith('data:')) return uri;
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ''));
      fr.onerror = () => resolve('');
      fr.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/* ----------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  popupCard: {
    width: CARD_W,
    maxHeight: MODAL_MAX_H,
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    ...({ boxShadow: '0 24px 70px rgba(0,0,0,0.35)' } as object),
  },
  modalScroll: { flexGrow: 0 },
  centerScroll: { padding: spacing.lg },
  formScroll: { padding: spacing.lg },
  centerWrap: { width: '100%' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  topBarInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  skipText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  topBarTexts: { flex: 1 },
  topBarTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  topBarSub: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  progressTrack: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  introScroll: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
  },
  introCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    ...shadow.card,
  },

  /* ---- 스텝퍼 ---- */
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  stepLineOn: { backgroundColor: colors.primary },
  stepNode: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  stepNodeDone: { backgroundColor: colors.primary },
  // 지금 장은 링을 둘러 한 단계 도드라지게 — 크기를 키우면 줄이 흔들린다.
  stepNodeCur: {
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.primarySoft,
  },
  stepNodeText: { fontSize: 12, fontWeight: '900', color: colors.textTertiary },
  stepNodeTextCur: { color: colors.white },

  /* ---- 히어로 ---- */
  introHero: {
    height: 176,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  heroWatermark: {
    position: 'absolute',
    right: -8,
    bottom: -38,
    fontSize: 132,
    lineHeight: 140,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.17)',
  },
  introStepTag: {
    ...type.badge,
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 1.2,
  },
  heroBadge: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introEmoji: { fontSize: 46 },
  introStepTitle: {
    ...type.h2,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: spacing.lg,
  },

  /* ---- TIP / 경고 ---- */
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 3,
    overflow: 'hidden',
  },
  tipEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.primary,
  },
  tipChip: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 1,
  },
  tipChipText: { fontSize: 10, fontWeight: '900', color: colors.white, letterSpacing: 0.5 },
  tipText: { ...type.body, flex: 1, color: colors.textSecondary },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 3,
    overflow: 'hidden',
  },
  warningEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.coralDeep,
  },
  warningText: {
    ...type.body,
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.coralDeep,
    fontWeight: '600',
  },
  introButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },

  /* ---- 준비 화면 ---- */

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: { fontSize: 13.5, fontWeight: '600', color: colors.textSecondary },

  /* ---- 카드 ---- */
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 5, // 좌측 엣지 스트라이프 자리
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadow.soft,
  },
  cardEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepChipText: { fontSize: 14, fontWeight: '900' },
  cardHeadTexts: { flex: 1 },
  cardTitle: { fontSize: 15.5, fontWeight: '900', color: colors.textPrimary },
  cardDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: 10.5, fontWeight: '900' },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  labelText: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  reqPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reqPillErr: { backgroundColor: colors.coralDeep },
  reqPillText: { fontSize: 10, fontWeight: '900', color: colors.primary },
  reqPillTextErr: { color: colors.white },
  optText: { fontSize: 10.5, fontWeight: '800', color: colors.textTertiary },
  labelHint: { fontSize: 11.5, fontWeight: '800', color: colors.textTertiary },
  errRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 6,
  },
  errText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.coralDeep,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textTertiary,
    marginTop: 6,
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: 110,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  // 비어 있는 필수 칸 — 제출을 눌러 본 뒤에만 켜진다.
  inputErr: {
    borderWidth: 1.5,
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  starWrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginLeft: -spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  starWrapErr: { borderColor: colors.coral, backgroundColor: colors.coralSoft },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },

  extraToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  extraToggleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  /* ---- 영수증 ---- */
  shotBox: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  shotBoxFilled: {
    paddingVertical: spacing.md,
    borderStyle: 'solid',
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  shotIcon: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  shotTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  shotDesc: {
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // 영수증이 무엇을 대신 채워 주는지 미리 보여 준다.
  autoFillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.sm,
  },
  autoFillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  autoFillText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  shotPreview: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    resizeMode: 'contain',
  },
  shotSwap: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(27,21,38,0.72)',
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  shotSwapText: { fontSize: 11.5, fontWeight: '800', color: colors.white },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md + 3,
    paddingRight: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  noticeEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  backToPrep: {
    marginTop: spacing.md,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },

  burnPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  burnPillText: { fontSize: 12.5, fontWeight: '800', color: colors.coralDeep },

  /* ---- 별점 ---- */
  starRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  starTrack: { flexDirection: 'row', gap: 6 },
  starCell: { width: STAR_SIZE, height: STAR_SIZE },
  starFill: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  starLabel: { fontSize: 18, fontWeight: '900', color: colors.tangerine },

  /* ---- 태그 ---- */
  tagInputWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: { fontSize: 12.5, fontWeight: '800', color: colors.primary },
  tagInput: {
    flex: 1,
    minWidth: 110,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tagSuggest: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  tagSuggestLabel: { fontSize: 11.5, fontWeight: '800', color: colors.textTertiary },
  tagSuggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagSuggestText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  /* ---- 이용 사진 ---- */
  // 예전에는 큰 업로드 상자 하나에 썸네일이 딸려 있어서, 고른 사진을 뺄 수가
  // 없었다. 이제 타일 격자로 두고 타일마다 × 를 붙인다.
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  photoTile: { width: 72, height: 72 },
  photoImg: { width: 72, height: 72, borderRadius: radius.sm },
  photoDel: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.tangerine,
    backgroundColor: colors.tangerineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  photoAddText: { fontSize: 10.5, fontWeight: '800', color: colors.tangerine },

  /* ---- 공개 설정 ---- */
  // 아이콘 + 단어짜리 세그먼트였는데, 공개/비공개가 각각 어디까지 보이는지는
  // 아래 helper 한 줄에만 있었다. 옵션마다 설명을 붙여 고르면서 읽게 한다.
  visOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  visOptOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  visIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visIconOn: { backgroundColor: colors.primary },
  visTexts: { flex: 1 },
  visTitle: { fontSize: 14, fontWeight: '900', color: colors.textSecondary },
  visTitleOn: { color: colors.primary },
  visDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textTertiary,
    marginTop: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },

  /* ---- 제출 ---- */
  missBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  missBarHot: { backgroundColor: colors.coralSoft },
  missText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  missTextHot: { color: colors.coralDeep },
  ctaDim: { opacity: 0.55 },

  bottomRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },

  /* ---- 완료 ---- */
  successCoin: {
    width: 88,
    height: 88,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successCoinText: { fontSize: 40 },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  successRewardPill: {
    backgroundColor: colors.limeSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: 9,
  },
  successRewardText: { fontSize: 16, fontWeight: '900', color: colors.limeInk },
  successCurrentPb: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  burnBanner: {
    marginTop: spacing.lg,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  burnBannerText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.coralDeep,
    textAlign: 'center',
  },
  successStampBadge: {
    marginTop: spacing.lg,
    backgroundColor: colors.tealSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  successStampText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.teal,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  successInfoCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  infoLineBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  infoLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});
