import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';

import { BlurBackdrop } from '@/components/ui/BlurBackdrop';
import { AppButton, Badge } from '@/components/ui/kit';
import { useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import { APP_WIDTH, colors, gradients, radius, shadow, spacing } from '@/theme';

type ReviewScreenProps = {
  onBack?: () => void;
};

// 리뷰 인증 — 캡처 한 장으로 끝내는 흐름.
//
//   ① 일회용 인증 코드를 받아 네이버 리뷰 맨 앞에 붙인다
//   ② '리뷰 쓰기 완료!' 화면을 캡처해서 올린다
//   ③ 서버가 읽어 매장명·별점·본문을 자동으로 채운다 → 확인만 하고 제출
//
// 예전에는 매장명·인원·금액·메뉴·플랫폼·별점·본문을 손으로 다 입력하고,
// 버닝 매장인지도 유저가 직접 골라야 했다(모르고 일반으로 고르면 2PB만 들어갔다).
// 이제 버닝 판정은 서버가 매장명으로 하므로 유형을 고르는 단계 자체가 없다.

const CARD_W = Math.min(APP_WIDTH - spacing.lg * 2, 560);
const MODAL_MAX_H = Math.round(Dimensions.get('window').height * 0.92);
const INTRO_W = Math.min(CARD_W - spacing.lg * 2, 440);

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
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // 일회용 인증 코드
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');

  // 캡처 판독
  const [shotImage, setShotImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanId, setScanId] = useState('');
  const [scanDone, setScanDone] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [autoBurning, setAutoBurning] = useState(false);
  const [autoReward, setAutoReward] = useState(2);
  const [scannedStore, setScannedStore] = useState('');

  // 폼 (판독 결과로 자동 채워지고, 유저가 고칠 수 있다)
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [platform, setPlatform] = useState('');
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

  const loadCode = useCallback(async () => {
    setCodeErr('');
    try {
      const r = await fetch('/api/verify?action=code', { credentials: 'include' });
      const d = await r.json();
      if (d?.ok && d.code) setCode(String(d.code));
      else setCodeErr(d?.error === 'login_required' ? '로그인이 필요해요.' : '코드를 받지 못했어요.');
    } catch {
      setCodeErr('코드를 받지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, []);

  useEffect(() => {
    loadCode();
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
  }, [loadCode]);

  const toggleDontShow = async () => {
    const next = !dontShowAgain;
    setDontShowAgain(next);
    try {
      await AsyncStorage.setItem('HIDE_REVIEW_GUIDE', next ? 'true' : 'false');
    } catch {
      // 저장 실패는 무시 — 다음에 다시 보일 뿐이다
    }
  };

  const copyCode = async () => {
    if (!code || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const plain = `${code}) `;
    try {
      const W = window as any;
      const html = `<b style="color:#5B4DF5;font-weight:700">${code})</b>&nbsp;`;
      if (W?.ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new W.ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`「${code})」 복사됐어요!\n네이버 리뷰 맨 앞에 붙여넣어 주세요.`);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
      } catch {
        // 클립보드가 막혔으면 화면의 코드를 직접 옮겨 적게 둔다
      }
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
      quality: target === 'shot' ? 0.9 : 0.7, // 캡처는 글자를 읽어야 해서 덜 줄인다
      allowsMultipleSelection: target === 'photos',
      selectionLimit: target === 'photos' ? 5 : 1,
      base64: target === 'shot',
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
    if (dataUrl) scanShot(dataUrl);
    else setScanErr('사진을 읽지 못했어요. 아래에 직접 입력해 주세요.');
  };

  /** 캡처를 서버로 보내 판독한다. 실패해도 손으로 입력해서 계속 진행할 수 있다. */
  const scanShot = async (dataUrl: string) => {
    setScanning(true);
    setScanErr('');
    setWarnings([]);
    try {
      const r = await fetch('/api/verify?action=scan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot: dataUrl }),
      });
      const d = await r.json();
      if (!d?.ok) {
        setScanErr(
          d?.error === 'ocr_unavailable'
            ? '지금은 자동 입력을 쓸 수 없어요. 아래에 직접 입력해 주세요.'
            : d?.error === 'unreadable'
              ? '캡처가 흐려서 읽지 못했어요. 다시 찍거나 아래에 직접 입력해 주세요.'
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

      const f = d.fields || {};
      if (f.store) setStoreName(String(f.store));
      if (f.category) setCategory(String(f.category));
      if (f.region) setLocation(String(f.region));
      if (f.platform) setPlatform(String(f.platform));
      if (f.rating) setRating(Number(f.rating));
      if (f.body) setComment(String(f.body));
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

  const isFormValid =
    storeName.trim().length > 0 && rating !== null && comment.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    const reward = autoBurning ? autoReward : 2;
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
        platform,
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
                <InfoLine label="리뷰 플랫폼" value={platform || '-'} />
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
    return (
      <BlurBackdrop onPress={onBack}>
        <View style={styles.popupCard}>
          <StatusBar style="dark" />
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>리뷰 인증</Text>
            <CloseButton onPress={onBack} />
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.introScroll}>
            <View style={[styles.introCard, { width: INTRO_W }]}>
              <LinearGradient
                colors={gradients.dusk}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.prepHero}
              >
                <Text style={styles.prepHeroTag}>STEP 1 / 2</Text>
                <Text style={styles.prepHeroTitle}>
                  이 코드를{'\n'}리뷰 맨 앞에 붙여주세요
                </Text>

                <TouchableOpacity
                  style={styles.codeChip}
                  onPress={copyCode}
                  activeOpacity={0.85}
                  disabled={!code}
                >
                  <Text style={styles.codeChipText}>{code ? `${code})` : '코드 받는 중…'}</Text>
                  {!!code && <Ionicons name="copy-outline" size={17} color={colors.primary} />}
                </TouchableOpacity>

                {!!codeErr && (
                  <TouchableOpacity onPress={loadCode} activeOpacity={0.8}>
                    <Text style={styles.codeErr}>{codeErr} 다시 시도 ↻</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.prepHeroNote}>
                  나에게만 발급된 일회용 코드예요. 한 번 쓰면 사라져요.
                </Text>
              </LinearGradient>

              <View style={styles.prepSteps}>
                <PrepStep
                  n="1"
                  tint={colors.primary}
                  soft={colors.primarySoft}
                  title="네이버에 리뷰를 써요"
                  body={`맨 앞에 ${code ? `「${code})」` : '위 코드'}를 붙이고 평소처럼 쓰면 돼요.`}
                />
                <PrepStep
                  n="2"
                  tint={colors.grape}
                  soft={colors.grapeSoft}
                  title="완료 화면을 캡처해요"
                  body="'리뷰 쓰기 완료!' 화면 그대로 찍어주세요."
                />
                <PrepStep
                  n="3"
                  tint={colors.teal}
                  soft={colors.tealSoft}
                  title="여기에 올리면 끝"
                  body="매장명·별점·내용을 PEED가 읽어서 자동으로 채워요."
                  last
                />
              </View>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={toggleDontShow}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, dontShowAgain && styles.checkboxOn]}>
                  {dontShowAgain && <Ionicons name="checkmark" size={14} color={colors.white} />}
                </View>
                <Text style={styles.checkboxLabel}>다시 보지 않기</Text>
              </TouchableOpacity>

              <AppButton
                label="리뷰 다 썼어요 · 캡처 올리기"
                variant="gradient"
                onPress={() => setStage('form')}
                style={{ width: '100%' }}
              />
            </View>
          </ScrollView>
        </View>
      </BlurBackdrop>
    );
  }

  /* ------------------------------------------------------------ 입력 */

  return (
    <BlurBackdrop onPress={onBack}>
      <View style={styles.popupCard}>
        <StatusBar style="dark" />

        <ScrollView
          style={styles.modalScroll}
          contentContainerStyle={styles.formScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerWrap}>
            <View style={styles.topBarInline}>
              <Text style={styles.topBarTitle}>리뷰 인증</Text>
              <CloseButton onPress={onBack} />
            </View>

            {/* ── 캡처 업로드 ── */}
            <View style={styles.card}>
              <Badge label="STEP 2 · 캡처 올리기" variant="brand" />

              <TouchableOpacity
                style={[styles.shotBox, shotImage && styles.shotBoxFilled]}
                onPress={() => pickImage('shot')}
                activeOpacity={0.85}
                disabled={scanning}
              >
                {shotImage ? (
                  <Image source={{ uri: shotImage }} style={styles.shotPreview} />
                ) : (
                  <>
                    <View style={styles.shotIcon}>
                      <Ionicons name="scan-outline" size={26} color={colors.primary} />
                    </View>
                    <Text style={styles.shotTitle}>리뷰 완료 화면 캡처 올리기</Text>
                    <Text style={styles.shotDesc}>
                      올리면 매장명·별점·내용이 자동으로 채워져요
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {scanning && (
                <View style={styles.scanBar}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.scanBarText}>캡처를 읽고 있어요…</Text>
                </View>
              )}

              {!scanning && scanDone && !scanErr && (
                <View style={[styles.scanBar, styles.scanBarOk]}>
                  <Ionicons name="checkmark-circle" size={17} color={colors.success} />
                  <Text style={[styles.scanBarText, { color: colors.success }]}>
                    자동 입력 완료! 아래 내용만 확인해 주세요.
                  </Text>
                </View>
              )}

              {!!scanErr && (
                <View style={[styles.scanBar, styles.scanBarWarn]}>
                  <Ionicons name="alert-circle" size={17} color={colors.warning} />
                  <Text style={[styles.scanBarText, { color: colors.textSecondary }]}>
                    {scanErr}
                  </Text>
                </View>
              )}

              {warnings.map((w) => (
                <View key={w} style={[styles.scanBar, styles.scanBarWarn]}>
                  <Ionicons name="information-circle" size={17} color={colors.warning} />
                  <Text style={[styles.scanBarText, { color: colors.textSecondary }]}>{w}</Text>
                </View>
              ))}

              {!shotImage && (
                <TouchableOpacity onPress={() => setStage('prep')} activeOpacity={0.7}>
                  <Text style={styles.backToPrep}>← 인증 코드 다시 보기</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* ── 확인 ── */}
            <View style={styles.card}>
              <Badge label="STEP 3 · 확인하기" variant="coral" />

              <Text style={styles.label}>매장명</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 멘노아지 강남역신분당선점"
                placeholderTextColor={colors.textTertiary}
                value={storeName}
                onChangeText={setStoreName}
              />
              {autoBurning ? (
                <View style={styles.burnPill}>
                  <Text style={styles.burnPillText}>
                    🔥 버닝 매장이에요 · {autoReward}PB 적립
                  </Text>
                </View>
              ) : (
                <Text style={styles.helper}>
                  네이버플레이스 표기 그대로면 버닝 매장이 자동으로 인식돼요
                </Text>
              )}
              {!!scannedStore && scannedStore !== storeName && (
                <Text style={styles.helper}>캡처에서 읽은 이름: {scannedStore}</Text>
              )}

              <Text style={styles.label}>만족도</Text>
              <StarRating value={rating} onChange={setRating} />
              <Text style={styles.helper}>별을 드래그하면 소수점(예: 4.5)까지 조절돼요</Text>

              <Text style={styles.label}>리뷰 내용</Text>
              <TextInput
                style={styles.textarea}
                placeholder="예: 분위기 좋고 음식이 빨리 나왔어요!"
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                value={comment}
                onChangeText={setComment}
              />
              <Text style={styles.helper}>
                캡처에서 읽은 내용이에요. 글자가 깨졌으면 고쳐주세요.
              </Text>

              <Text style={styles.label}>태그 (선택)</Text>
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
                <Text style={styles.extraToggleText}>
                  인원 · 금액 · 메뉴 적기 (선택)
                </Text>
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
            </View>

            {/* ── 이용 사진 ── */}
            <View style={styles.card}>
              <Badge label="이용 사진 (선택)" variant="lime" />
              <TouchableOpacity
                style={styles.uploadBox}
                onPress={() => pickImage('photos')}
                activeOpacity={0.85}
              >
                <Ionicons name="images-outline" size={28} color={colors.tangerine} />
                <Text style={styles.uploadTitle}>이용 사진 올리기</Text>
                <Text style={styles.uploadDesc}>최대 5장</Text>
                {photos.length > 0 && (
                  <View style={styles.previewRow}>
                    {photos.map((uri, i) => (
                      <Image key={i} source={{ uri }} style={styles.smallPreview} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.feedNotice}>
                <Ionicons
                  name={photos.length > 0 ? 'checkmark-circle' : 'information-circle'}
                  size={15}
                  color={photos.length > 0 ? colors.success : colors.textTertiary}
                />
                <Text style={styles.feedNoticeText}>
                  {photos.length > 0
                    ? '홈 피드와 내 프로필에 모두 게시돼요.'
                    : '사진이 없어도 게시돼요. 다만 홈 피드엔 안 뜨고 내 프로필에서만 보여요.'}
                </Text>
              </View>
            </View>

            {/* ── 공개 설정 ── */}
            <View style={styles.card}>
              <Badge label="공개 설정" variant="brand" />
              <View style={styles.visRow}>
                <TouchableOpacity
                  style={[styles.visBtn, isPublic && styles.visBtnOn]}
                  onPress={() => setIsPublic(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="earth"
                    size={18}
                    color={isPublic ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.visBtnText, isPublic && styles.visBtnTextOn]}>공개</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.visBtn, !isPublic && styles.visBtnOn]}
                  onPress={() => setIsPublic(false)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="lock-closed"
                    size={18}
                    color={!isPublic ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.visBtnText, !isPublic && styles.visBtnTextOn]}>비공개</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helper}>
                {isPublic
                  ? photos.length > 0
                    ? '공개 — 홈 피드에 뜨고, 내 프로필에 놀러 온 사람도 볼 수 있어요.'
                    : '공개 — 홈 피드엔 안 뜨지만, 내 프로필에 놀러 온 사람은 볼 수 있어요.'
                  : '비공개 — 사진이 있어도 홈에도 안 뜨고, 내 프로필에 놀러 와도 남에겐 안 보여요.'}
              </Text>
            </View>

            <View style={styles.bottomRow}>
              <AppButton
                label="뒤로"
                variant="ghost"
                onPress={onBack}
                style={{ flex: 1 }}
              />
              <AppButton
                label="작성 완료"
                variant="gradient"
                disabled={!isFormValid}
                onPress={handleSubmit}
                style={{ flex: 1.8 }}
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

function PrepStep({
  n,
  title,
  body,
  tint,
  soft,
  last,
}: {
  n: string;
  title: string;
  body: string;
  tint: string;
  soft: string;
  last?: boolean;
}) {
  return (
    <View style={styles.prepStepRow}>
      <View style={styles.prepRail}>
        <View style={[styles.prepNum, { backgroundColor: soft }]}>
          <Text style={[styles.prepNumText, { color: tint }]}>{n}</Text>
        </View>
        {!last && <View style={styles.prepLine} />}
      </View>
      <View style={styles.prepStepBody}>
        <Text style={styles.prepStepTitle}>{title}</Text>
        <Text style={styles.prepStepText}>{body}</Text>
      </View>
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
    marginBottom: spacing.md,
  },
  topBarTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  introScroll: { padding: spacing.lg, alignItems: 'center' },
  introCard: { alignItems: 'stretch' },

  /* ---- 준비 화면 ---- */
  prepHero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  prepHeroTag: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  prepHeroTitle: {
    color: colors.white,
    fontSize: 23,
    lineHeight: 32,
    fontWeight: '900',
    marginBottom: spacing.lg,
  },
  codeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  codeChipText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.primary,
  },
  codeErr: {
    color: colors.lime,
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  prepHeroNote: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },

  prepSteps: { marginBottom: spacing.md },
  prepStepRow: { flexDirection: 'row', gap: spacing.md },
  prepRail: { alignItems: 'center', width: 32 },
  prepNum: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prepNumText: { fontSize: 14, fontWeight: '900' },
  prepLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.line,
    marginVertical: 3,
    borderRadius: 2,
  },
  prepStepBody: { flex: 1, paddingBottom: spacing.lg },
  prepStepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  prepStepText: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
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
    marginBottom: spacing.md,
    ...shadow.soft,
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
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },

  extraToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  extraToggleText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  /* ---- 캡처 ---- */
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
    backgroundColor: colors.white,
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
  shotPreview: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    resizeMode: 'contain',
  },
  scanBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  scanBarOk: { backgroundColor: '#E8F8EF' },
  scanBarWarn: { backgroundColor: colors.tangerineSoft },
  scanBarText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.textSecondary,
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
  uploadBox: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  uploadTitle: { fontSize: 14.5, fontWeight: '800', color: colors.textPrimary },
  uploadDesc: { fontSize: 12, color: colors.textTertiary },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  smallPreview: { width: 52, height: 52, borderRadius: radius.sm },
  feedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
  },
  feedNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  /* ---- 공개 설정 ---- */
  visRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  visBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  visBtnOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  visBtnText: { fontSize: 14.5, fontWeight: '800', color: colors.textSecondary },
  visBtnTextOn: { color: colors.primary },

  bottomRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },

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
