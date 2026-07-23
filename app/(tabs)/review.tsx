import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { STAMP_DISTRICT, detectNeighborhood, useFeed } from '@/context/feed';
import { usePb } from '@/context/pb';
import {
  APP_WIDTH,
  colors,
  gradients,
  radius,
  shadow,
  spacing,
  type,
} from '@/theme';

type ReviewScreenProps = {
  onBack?: () => void;
};

// The review now renders as a popup card over a blurred backdrop (the feed
// stays mounted behind). Card sizes fit the column and the screen height.
const CARD_W = Math.min(APP_WIDTH - spacing.lg * 2, 560);
const MODAL_MAX_H = Math.round(Dimensions.get('window').height * 0.92);
const CONTENT_W = CARD_W - spacing.lg * 2;
const INTRO_W = Math.min(CARD_W - spacing.lg * 2, 440);

// 인증 키워드 — 외부 리뷰(네이버·카카오·구글) 맨 앞에 붙이는 표식.
// 'PEED)' 와 '피드)' 를 모두 허용(대소문자·공백 유연).
const KEYWORDS = ['PEED)', '피드)'] as const;
const KEYWORD_RE = /(?:peed|피드)\s*\)/i;
const hasKeyword = (t: string) => KEYWORD_RE.test(t);
const stripKeyword = (t: string) => t.replace(/^\s*(?:peed|피드)\s*\)\s*/i, '').trim();

const STEPS = [
  {
    emoji: '✍️',
    title: '외부 리뷰를 쓸 때\n인증 키워드를 붙여요',
    tip: '네이버·카카오·구글 리뷰 맨 앞에 「PEED)」 또는 「피드)」를 붙여주세요. 이게 인증 키워드예요!',
  },
  {
    emoji: '📸',
    title: '그 리뷰 화면을\n스크린샷으로 찍어요',
    tip: '키워드가 보이게 찍어주세요. 모바일·PC 어떤 플랫폼이든 OK.',
  },
  {
    emoji: '💎',
    title: '여기서 인증하면\nPB 즉시 지급!',
    tip: '리뷰 내용을 그대로 붙여넣고 스크린샷을 올리면 끝!',
  },
  {
    emoji: '📷',
    title: '이용 사진도\n함께 올려요',
    tip: '이용 사진을 올리면 내 피드에도 게시돼요. 안 올리면 인증·PB 적립만 되고 피드엔 안 올라가요. (최대 5장)',
  },
  {
    emoji: '⚠️',
    title: '인증 전\n확인해 주세요',
    tip: '',
  },
] as const;

function CloseButton({ onPress }: { onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.closeBtn} onPress={onPress} hitSlop={8}>
      <Ionicons name="close" size={22} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

// 드래그 가능한 별점 — 탭 또는 드래그로 0.5~5.0(소수점 1자리)을 고른다.
// 별 5개는 그대로 두되 부분 채움으로 소수점을 표현.
const STAR_SIZE = 38;
const STAR_GAP = 6;

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
    r = Math.round(r * 10) / 10; // 소수점 1자리
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
                <Ionicons name="star" size={STAR_SIZE} color={colors.coral} />
              </View>
            </View>
          );
        })}
      </View>
      {value ? <Text style={styles.starLabel}>{value.toFixed(1)}</Text> : null}
    </View>
  );
}

export default function ReviewScreen({ onBack }: ReviewScreenProps) {
  const { pb, earn, setBalance } = usePb();
  const { addPost, collectStamp, stamps, me } = useFeed();

  const [step, setStep] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // 인증 키워드 안내 카드 — X로 끄면 '다시 보지 않기'가 뜨고, 누르면 영구 숨김.
  const [kwHidden, setKwHidden] = useState(false);
  const [kwPrompt, setKwPrompt] = useState(false);

  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const [storeName, setStoreName] = useState('');
  const [peopleCount, setPeopleCount] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [menu, setMenu] = useState('');
  const [platform, setPlatform] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [earnedPb, setEarnedPb] = useState(0);
  const [earnedStamp, setEarnedStamp] = useState('');
  // 구(區) 도장 보너스(리뷰 5개 달성) — 성공 화면에 표시.
  const [districtBonus, setDistrictBonus] = useState<{ district: string; count: number } | null>(
    null
  );
  const [showBurningStoreModal, setShowBurningStoreModal] = useState(false);
  const [burningStoreSearch, setBurningStoreSearch] = useState('');
  const [isBurningReview, setIsBurningReview] = useState(false);
  const [selectedBurningStore, setSelectedBurningStore] = useState('');
  const [isPublic, setIsPublic] = useState(true); // 공개(피드 노출) / 비공개(내 프로필만)

  // Burning stores come from the live server (same active/paying stores that show
  // on the map), so the review picker only lists real registered stores.
  const [burningStores, setBurningStores] = useState<
    { id: string; name: string; reward: number; category: string; location: string }[]
  >([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d?.stores)) return;
        setBurningStores(
          d.stores.map((s: any) => ({
            id: s.id,
            name: s.name,
            reward: typeof s.reward === 'number' ? s.reward : 10,
            category: s.category || '버닝 매장',
            location: s.location || s.region || '',
          }))
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const getRewardPb = () => {
    if (isBurningReview && selectedBurningStore) {
      const matched = burningStores.find((s) => s.name === selectedBurningStore);
      if (matched) return matched.reward;
    }
    return 2;
  };

  const filteredBurningStores = burningStores.filter((s) =>
    s.name.toLowerCase().includes(burningStoreSearch.toLowerCase())
  );

  // 인증 키워드가 리뷰 내용에 포함됐는지(실시간).
  const keywordOk = hasKeyword(comment);

  const copyKeyword = (kw: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(kw);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`「${kw}」 복사됐어요! 외부 리뷰 맨 앞에 붙여넣어 주세요.`);
      }
    }
  };

  // 태그: 단어 입력 → 추가(공백·#·특수문자 정리), 최대 6개.
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

  // 추천 태그 — 매장·카테고리·동네에서 자동 생성.
  const suggestedTags = useMemo(() => {
    const store = (isBurningReview ? selectedBurningStore : storeName).trim();
    const hood = detectNeighborhood(`${store} ${comment}`);
    const cat = isBurningReview
      ? (burningStores.find((b) => b.name === selectedBurningStore)?.category || '').replace(/\s/g, '')
      : '';
    const out = [
      hood,
      cat,
      hood && cat ? `${hood}${cat}` : '',
      store.replace(/\s/g, ''),
    ];
    return Array.from(new Set(out)).filter((t) => t && !tags.includes(t)).slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBurningReview, selectedBurningStore, storeName, comment, tags]);

  useEffect(() => {
    (async () => {
      try {
        const value = await AsyncStorage.getItem('HIDE_REVIEW_GUIDE');
        if (value === 'true') {
          setDontShowAgain(true);
          setShowForm(true);
        }
        const kw = await AsyncStorage.getItem('HIDE_KEYWORD_GUIDE');
        if (kw === 'true') setKwHidden(true);
      } catch {
        console.log('저장값 불러오기 실패');
      }
    })();
  }, []);

  const dismissKeyword = () => {
    setKwHidden(true);
    setKwPrompt(true);
  };
  const neverShowKeyword = async () => {
    setKwPrompt(false);
    try {
      await AsyncStorage.setItem('HIDE_KEYWORD_GUIDE', 'true');
    } catch {
      console.log('저장 실패');
    }
  };

  const pickImage = async (target: 'receipt' | 'photos') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert('사진 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: target === 'photos',
      selectionLimit: target === 'photos' ? 5 : 1,
    });
    if (!result.canceled) {
      if (target === 'receipt') {
        setReceiptImage(result.assets[0].uri);
      } else {
        const uris = result.assets.map((a) => a.uri);
        setPhotos((prev) => [...prev, ...uris].slice(0, 5));
      }
    }
  };

  const isFormValid = useMemo(() => {
    const hasStore = isBurningReview
      ? selectedBurningStore.trim().length > 0
      : storeName.trim().length > 0;
    return (
      hasStore &&
      peopleCount.trim().length > 0 &&
      totalPrice.trim().length > 0 &&
      menu.trim().length > 0 &&
      platform.trim().length > 0 &&
      rating !== null &&
      comment.trim().length > 0 &&
      hasKeyword(comment) &&
      !!receiptImage
    );
  }, [
    isBurningReview,
    selectedBurningStore,
    storeName,
    peopleCount,
    totalPrice,
    menu,
    platform,
    rating,
    comment,
    receiptImage,
  ]);

  const toggleDontShow = async () => {
    try {
      const next = !dontShowAgain;
      setDontShowAgain(next);
      await AsyncStorage.setItem('HIDE_REVIEW_GUIDE', next ? 'true' : 'false');
    } catch {
      console.log('저장 실패');
    }
  };

  const nextStep = () => {
    if (step < 5) {
      setStep(step + 1);
      return;
    }
    setShowForm(true);
  };
  const prevStep = () => step > 1 && setStep(step - 1);

  const handleSubmit = async () => {
    if (!isFormValid) return;
    const reward = getRewardPb();
    setEarnedPb(reward);
    earn(reward);

    const store = isBurningReview ? selectedBurningStore : storeName;
    // 피드 캡션에선 인증 키워드를 떼어 깔끔하게 게시.
    const cleanCaption = stripKeyword(comment) || comment.trim();
    const hood = detectNeighborhood(`${store} ${cleanCaption}`);
    const isNewStamp = !!hood && !stamps.includes(hood);
    // 구(區) 판별용 위치 텍스트 — 버닝은 매장 위치, 일반은 매장명/내용.
    const storeLoc = isBurningReview
      ? burningStores.find((b) => b.name === selectedBurningStore)?.location || ''
      : '';
    const districtHint = (`${storeLoc} ${store} ${cleanCaption}`.match(/([가-힣]{2,4}구)(?=[\s·,]|$)/) || [])[1] || '';

    // 이용 사진을 올린 경우에만 내 피드에 게시(사진 없으면 인증·적립만).
    if (photos.length > 0) {
      addPost({
        store,
        image: { uri: photos[0] },
        rating: rating ?? 5,
        caption: cleanCaption,
        tags,
        location: hood ? `${hood} · ${STAMP_DISTRICT}` : '',
        people: Number(peopleCount) || 1,
        price: Number(String(totalPrice).replace(/[^0-9]/g, '')) || 0,
        isBurning: isBurningReview,
        earnedPb: reward,
        isPrivate: !isPublic,
      });
    }

    // 서버에 리뷰 저장 + PB 적립(매장당 하루 1회). 응답의 서버 잔액으로 정합.
    fetch('/api/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: me.name,
        handle: me.handle,
        store,
        rating: rating ?? 5,
        caption: cleanCaption,
        burning: isBurningReview,
        verified: hasKeyword(comment),
        platform,
        location: storeLoc,
        district: districtHint,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.balance === 'number') setBalance(d.balance);
        // 구 도장 5개 달성 보너스(+1 PB).
        if (d && d.bonusPb > 0 && d.district) {
          setDistrictBonus({ district: d.district, count: d.districtCount || 5 });
        }
      })
      .catch(() => {});

    setEarnedStamp(isNewStamp ? hood : '');
    setDistrictBonus(null);
    setShowSuccess(true);
  };

  /* ------------------------------------------------------------ success */

  if (showSuccess) {
    return (
      <BlurBackdrop onPress={onBack}>
        <View style={styles.popupCard}>
        <StatusBar style="dark" />
        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.centerScroll}>
          <View style={[styles.centerWrap, { alignItems: 'center' }]}>
            <LinearGradient
              colors={gradients.lime}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successCoin}
            >
              <Text style={styles.successCoinText}>💎</Text>
            </LinearGradient>

            <Text style={styles.successTitle}>PB 적립 완료!</Text>
            <View style={styles.successRewardPill}>
              <Text style={styles.successRewardText}>+{earnedPb} PB 적립</Text>
            </View>
            <Text style={styles.successCurrentPb}>현재 보유 {pb} PB</Text>

            {districtBonus ? (
              <View style={[styles.successStampBadge, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.successStampText, { color: colors.primary }]}>
                  🗺️ {districtBonus.district} 리뷰 {districtBonus.count}개 달성! 도장 보너스 +1 PB 🎉
                </Text>
              </View>
            ) : earnedStamp ? (
              <View style={styles.successStampBadge}>
                <Text style={styles.successStampText}>
                  🗺️ {earnedStamp} 첫 방문 도장 획득!
                </Text>
              </View>
            ) : null}

            <Text style={styles.successDesc}>
              리뷰 인증이 접수됐어요.{'\n'}
              {photos.length > 0
                ? '이용 사진과 함께 내 피드에도 게시됐어요! 🎉'
                : '이용 사진을 안 올려서 피드엔 게시되지 않았어요.'}
            </Text>

            <View style={styles.successInfoCard}>
              <InfoLine
                label="매장명"
                value={isBurningReview ? selectedBurningStore || '-' : storeName || '-'}
              />
              <InfoLine label="리뷰 플랫폼" value={platform || '-'} />
              <InfoLine label="만족도" value={rating ? `${rating.toFixed(1)}점` : '-'} last />
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

  /* --------------------------------------------------------------- intro */

  if (!showForm) {
    const cur = STEPS[step - 1];
    return (
      <BlurBackdrop onPress={onBack}>
        <View style={styles.popupCard}>
        <StatusBar style="dark" />
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>리뷰 인증 방법</Text>
          <CloseButton onPress={onBack} />
        </View>

        <ScrollView style={styles.modalScroll} contentContainerStyle={styles.introScroll}>
          <View style={[styles.introCard, { width: INTRO_W }]}>
            <View style={styles.dotsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={[styles.dot, step >= i && styles.dotActive]}
                />
              ))}
            </View>

            <LinearGradient
              colors={gradients.dusk}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.introHero}
            >
              <Text style={styles.introStepTag}>STEP {step} / 5</Text>
              <Text style={styles.introEmoji}>{cur.emoji}</Text>
            </LinearGradient>

            <Text style={styles.introStepTitle}>{cur.title}</Text>

            {cur.tip ? (
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  <Text style={styles.tipStrong}>TIP! </Text>
                  {cur.tip}
                </Text>
              </View>
            ) : null}

            {step === 5 && (
              <>
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠ 부정 인증·중복·허위 리뷰는 검토 후 지급 취소되거나 이용이
                    제한될 수 있어요.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={toggleDontShow}
                  activeOpacity={0.8}
                >
                  <View
                    style={[styles.checkbox, dontShowAgain && styles.checkboxOn]}
                  >
                    {dontShowAgain && (
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>다시 보지 않기</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.introButtons}>
              {step > 1 && (
                <AppButton
                  label="이전"
                  variant="ghost"
                  onPress={prevStep}
                  style={{ flex: 1 }}
                />
              )}
              <AppButton
                label={step < 5 ? '다음' : '시작하기'}
                variant="gradient"
                onPress={nextStep}
                style={{ flex: 1.5 }}
              />
            </View>
          </View>
        </ScrollView>
        </View>
      </BlurBackdrop>
    );
  }

  /* ---------------------------------------------------------------- form */

  return (
    <BlurBackdrop onPress={onBack}>
      <View style={styles.popupCard}>
      <StatusBar style="dark" />

      {showBurningStoreModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { width: INTRO_W }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>버닝 매장 선택</Text>
              <CloseButton
                onPress={() => {
                  setShowBurningStoreModal(false);
                  setBurningStoreSearch('');
                }}
              />
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={17} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="버닝 매장 검색"
                placeholderTextColor={colors.textTertiary}
                value={burningStoreSearch}
                onChangeText={setBurningStoreSearch}
              />
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {filteredBurningStores.length > 0 ? (
                filteredBurningStores.map((s) => {
                  const selected = selectedBurningStore === s.name;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.storeItem, selected && styles.storeItemOn]}
                      onPress={() => {
                        setSelectedBurningStore(s.name);
                        setShowBurningStoreModal(false);
                        setBurningStoreSearch('');
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.storeItemName,
                            selected && { color: colors.primary },
                          ]}
                        >
                          {s.name}
                        </Text>
                        <Text style={styles.storeItemMeta}>
                          🔥 버닝 · {s.category} · +{s.reward}PB
                        </Text>
                      </View>
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>검색 결과가 없어요</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}

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

          {/* hero */}
          <LinearGradient
            colors={gradients.dusk}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.heroEyebrow}>REVIEW → REWARD</Text>
              <Text style={styles.heroTitle}>
                리뷰 남기고{'\n'}PB 적립하기
              </Text>
            </View>
            <View style={styles.heroCoin}>
              <Text style={styles.heroCoinText}>💎</Text>
            </View>
          </LinearGradient>

          {/* 인증 키워드 — 핵심 안내 (X로 끌 수 있음) */}
          {!kwHidden && (
          <View style={styles.keywordCard}>
            <View style={styles.keywordHead}>
              <Text style={styles.keywordTitle}>🔑 인증 키워드</Text>
              <View style={styles.keywordHeadRight}>
                <View style={styles.keywordReq}>
                  <Text style={styles.keywordReqText}>필수</Text>
                </View>
                <TouchableOpacity onPress={dismissKeyword} hitSlop={8} style={styles.kwClose}>
                  <Ionicons name="close" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.keywordDesc}>
              네이버·카카오·구글 리뷰 <Text style={styles.keywordBold}>맨 앞</Text>에 아래 키워드 중 하나를
              붙여서 작성해 주세요. (둘 다 인정)
            </Text>
            <View style={styles.keywordChips}>
              {KEYWORDS.map((kw) => (
                <TouchableOpacity
                  key={kw}
                  style={styles.keywordChip}
                  onPress={() => copyKeyword(kw)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.keywordChipText}>{kw}</Text>
                  <Ionicons name="copy-outline" size={14} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keywordExample}>
              <Text style={styles.keywordExampleLabel}>예시</Text>
              <Text style={styles.keywordExampleText}>
                <Text style={styles.keywordBold}>PEED)</Text> 분위기 좋고 음식도 빨리 나와서 완전 만족했어요 🍶
              </Text>
            </View>
          </View>
          )}

          {/* 키워드 안내를 끈 뒤 뜨는 '다시 보지 않기' */}
          {kwHidden && kwPrompt && (
            <View style={styles.kwPromptBar}>
              <Text style={styles.kwPromptText}>인증 키워드 안내를 숨겼어요.</Text>
              <View style={styles.kwPromptActions}>
                <TouchableOpacity onPress={neverShowKeyword} activeOpacity={0.8}>
                  <Text style={styles.kwPromptNever}>다시 보지 않기</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setKwPrompt(false)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 기본 정보 */}
          <View style={styles.card}>
            <Badge label="기본 정보" variant="brand" />

            <Text style={styles.label}>리뷰 유형</Text>
            <View style={styles.typeRow}>
              <TypeButton
                active={!isBurningReview}
                label="일반 리뷰"
                onPress={() => {
                  setIsBurningReview(false);
                  setSelectedBurningStore('');
                  setBurningStoreSearch('');
                  setShowBurningStoreModal(false);
                }}
              />
              <TypeButton
                active={isBurningReview}
                label="🔥 버닝 매장"
                onPress={() => {
                  setIsBurningReview(true);
                  setStoreName('');
                  setBurningStoreSearch('');
                }}
              />
            </View>

            <Text style={styles.label}>
              {isBurningReview ? '버닝 매장 선택' : '매장명 / 상품명'}
            </Text>
            {isBurningReview ? (
              <>
                <TouchableOpacity
                  style={styles.selectButton}
                  onPress={() => setShowBurningStoreModal(true)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.selectPlaceholder,
                      selectedBurningStore && styles.selectValue,
                    ]}
                  >
                    {selectedBurningStore || '등록된 버닝 매장 선택하기'}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
                <Text style={styles.helper}>
                  버닝 매장은 등록된 매장만 선택할 수 있어요
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="예: 사케골목"
                  placeholderTextColor={colors.textTertiary}
                  value={storeName}
                  onChangeText={setStoreName}
                />
                <Text style={styles.helper}>
                  네이버플레이스 기준 매장명 + 지점명을 입력해 주세요
                </Text>
              </>
            )}

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

            <Text style={styles.label}>리뷰 플랫폼</Text>
            <TextInput
              style={styles.input}
              placeholder="예: 네이버 / 카카오맵 / 구글"
              placeholderTextColor={colors.textTertiary}
              value={platform}
              onChangeText={setPlatform}
            />
          </View>

          {/* 리뷰 내용 */}
          <View style={styles.card}>
            <Badge label="리뷰 내용" variant="coral" />

            <Text style={styles.label}>만족도</Text>
            <StarRating value={rating} onChange={setRating} />
            <Text style={styles.helper}>별을 드래그하면 소수점(예: 4.5)까지 조절돼요</Text>

            <Text style={styles.label}>리뷰 내용</Text>
            <TextInput
              style={[
                styles.textarea,
                comment.trim().length > 0 && (keywordOk ? styles.textareaOk : styles.textareaWarn),
              ]}
              placeholder="예: 분위기 좋고 음식이 빨리 나왔어요!"
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              value={comment}
              onChangeText={setComment}
            />
            {comment.trim().length > 0 &&
              (keywordOk ? (
                <View style={styles.kwStatus}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={[styles.kwStatusText, { color: colors.success }]}>
                    인증 키워드 확인됨
                  </Text>
                </View>
              ) : (
                <View style={styles.kwStatus}>
                  <Ionicons name="warning" size={16} color={colors.coralDeep} />
                  <Text style={[styles.kwStatusText, { color: colors.coralDeep }]}>
                    리뷰 맨 앞에 「PEED)」 또는 「피드)」를 넣어주세요
                  </Text>
                </View>
              ))}

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
          </View>

          {/* 공개 설정 */}
          <View style={styles.card}>
            <Badge label="공개 설정" variant="brand" />
            <View style={styles.visRow}>
              <TouchableOpacity
                style={[styles.visBtn, isPublic && styles.visBtnOn]}
                onPress={() => setIsPublic(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="earth" size={18} color={isPublic ? colors.primary : colors.textSecondary} />
                <Text style={[styles.visBtnText, isPublic && styles.visBtnTextOn]}>공개</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.visBtn, !isPublic && styles.visBtnOn]}
                onPress={() => setIsPublic(false)}
                activeOpacity={0.85}
              >
                <Ionicons name="lock-closed" size={18} color={!isPublic ? colors.primary : colors.textSecondary} />
                <Text style={[styles.visBtnText, !isPublic && styles.visBtnTextOn]}>비공개</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helper}>
              {isPublic
                ? '공개 — 홈 피드에 노출되고 다른 사람도 볼 수 있어요.'
                : '비공개 — 홈 피드엔 안 보이고 내 프로필에서만 볼 수 있어요.'}
            </Text>
          </View>

          {/* 인증 사진 */}
          <View style={styles.card}>
            <Badge label="인증 사진" variant="lime" />

            <Text style={styles.label}>영수증 · 리뷰 스크린샷 (필수)</Text>
            <TouchableOpacity
              style={styles.uploadBox}
              onPress={() => pickImage('receipt')}
              activeOpacity={0.85}
            >
              {receiptImage ? (
                <Image source={{ uri: receiptImage }} style={styles.previewImage} />
              ) : (
                <>
                  <Ionicons name="receipt-outline" size={30} color={colors.primary} />
                  <Text style={styles.uploadTitle}>영수증/리뷰 사진 올리기</Text>
                  <Text style={styles.uploadDesc}>1장 업로드</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>이용 사진 (피드 게시용)</Text>
            <TouchableOpacity
              style={styles.uploadBox}
              onPress={() => pickImage('photos')}
              activeOpacity={0.85}
            >
              <Ionicons name="images-outline" size={30} color={colors.primary} />
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
                  ? '리뷰 인증과 함께 내 피드에 게시돼요.'
                  : '사진을 올리지 않으면 인증·PB 적립만 되고 피드엔 게시되지 않아요.'}
              </Text>
            </View>
          </View>

          <View style={styles.bottomRow}>
            <AppButton
              label="뒤로가기"
              variant="ghost"
              onPress={onBack}
              style={{ flex: 1 }}
            />
            <AppButton
              label="작성 완료"
              variant="gradient"
              disabled={!isFormValid}
              onPress={handleSubmit}
              style={{ flex: 1.6 }}
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

function TypeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.typeButton, active && styles.typeButtonOn]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.typeButtonText, active && styles.typeButtonTextOn]}>
        {label}
      </Text>
    </TouchableOpacity>
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
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
    maxHeight: MODAL_MAX_H,
  },
  centerScroll: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    padding: spacing.lg,
  },
  formScroll: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  centerWrap: {
    width: CONTENT_W,
    gap: spacing.lg,
  },

  /* top bar */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topBarInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  topBarTitle: {
    ...type.h2,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* intro */
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
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  introHero: {
    height: 168,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  introStepTag: {
    ...type.badge,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 1,
  },
  introEmoji: {
    fontSize: 64,
  },
  introStepTitle: {
    ...type.h1,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  tipBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  tipText: {
    ...type.body,
    color: colors.textSecondary,
  },
  tipStrong: {
    color: colors.primary,
    fontWeight: '800',
  },
  warningBox: {
    marginTop: spacing.md,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  warningText: {
    ...type.body,
    color: colors.coralDeep,
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
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
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    ...type.label,
    color: colors.textSecondary,
  },
  introButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },

  /* form */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  heroEyebrow: {
    ...type.badge,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    ...type.h1,
    color: colors.white,
  },
  heroCoin: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCoinText: {
    fontSize: 30,
  },

  /* 인증 키워드 카드 */
  keywordCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  keywordHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  keywordHeadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kwClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keywordTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
  },
  kwPromptBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  kwPromptText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  kwPromptActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  kwPromptNever: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  keywordReq: {
    backgroundColor: colors.coral,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  keywordReqText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.white,
  },
  keywordDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  keywordBold: {
    color: colors.primary,
    fontWeight: '900',
  },
  keywordChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  keywordChipText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  keywordExample: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  keywordExampleLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  keywordExampleText: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  /* 리뷰 내용 검증 상태 */
  textareaOk: {
    borderColor: colors.success,
    backgroundColor: '#F1FBF4',
  },
  textareaWarn: {
    borderColor: colors.coral,
    backgroundColor: colors.coralSoft,
  },
  kwStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: -spacing.xs,
  },
  kwStatusText: {
    fontSize: 12.5,
    fontWeight: '800',
  },

  /* 태그 입력 */
  tagInputWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  tagInput: {
    flex: 1,
    minWidth: 120,
    height: 34,
    color: colors.textPrimary,
    fontSize: 14,
    ...({ outlineStyle: 'none' } as object),
  },
  tagSuggest: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: -spacing.xs,
  },
  tagSuggestLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textTertiary,
  },
  tagSuggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  tagSuggestText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.soft,
  },
  label: {
    ...type.label,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  helper: {
    ...type.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    marginTop: -spacing.xs,
  },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    color: colors.textPrimary,
    fontSize: 15,
    ...({ outlineStyle: 'none' } as object),
  },
  textarea: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 15,
    ...({ outlineStyle: 'none' } as object),
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
    gap: spacing.md,
  },

  typeRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  typeButton: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  typeButtonText: {
    ...type.label,
    color: colors.textSecondary,
  },
  typeButtonTextOn: {
    color: colors.primary,
  },
  visRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  visBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  visBtnOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  visBtnText: {
    ...type.label,
    color: colors.textSecondary,
  },
  visBtnTextOn: {
    color: colors.primary,
  },

  selectButton: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectPlaceholder: {
    color: colors.textTertiary,
    fontSize: 15,
    fontWeight: '600',
  },
  selectValue: {
    color: colors.textPrimary,
    fontWeight: '800',
  },

  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  starTrack: {
    flexDirection: 'row',
    gap: STAR_GAP,
    paddingVertical: 4,
    ...({ cursor: 'pointer', touchAction: 'none' } as object),
  },
  starCell: {
    width: STAR_SIZE,
    height: STAR_SIZE,
  },
  starFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: STAR_SIZE,
    overflow: 'hidden',
  },
  starLabel: {
    ...type.title,
    color: colors.coral,
    marginLeft: spacing.md,
  },

  uploadBox: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    backgroundColor: colors.primarySoft,
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  uploadTitle: {
    ...type.label,
    color: colors.textPrimary,
    fontSize: 15,
  },
  uploadDesc: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 170,
    borderRadius: radius.md,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  smallPreview: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
  },

  feedNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: -spacing.xs,
  },
  feedNoticeText: {
    flex: 1,
    ...type.caption,
    color: colors.textTertiary,
    fontWeight: '600',
    lineHeight: 17,
  },

  bottomRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  /* burning modal */
  modalOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    zIndex: 30,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '80%',
    ...shadow.lifted,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...type.title,
    color: colors.textPrimary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    ...({ outlineStyle: 'none' } as object),
  },
  storeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  storeItemOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  storeItemName: {
    ...type.label,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 2,
  },
  storeItemMeta: {
    ...type.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  emptyBox: {
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    ...type.body,
    color: colors.textSecondary,
  },

  /* success */
  successCoin: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadow.card,
  },
  successCoinText: {
    fontSize: 48,
  },
  successTitle: {
    ...type.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  successRewardPill: {
    backgroundColor: colors.limeSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  successRewardText: {
    ...type.title,
    color: colors.limeInk,
  },
  successCurrentPb: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  successStampBadge: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  successStampText: {
    ...type.label,
    color: colors.coralDeep,
    textAlign: 'center',
  },
  successDesc: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  successInfoCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    ...shadow.soft,
  },
  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  infoLineBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  infoLabel: {
    ...type.label,
    color: colors.textSecondary,
  },
  infoValue: {
    ...type.label,
    color: colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});
