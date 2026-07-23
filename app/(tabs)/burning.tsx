import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BurningMap } from '@/components/burning/BurningMap';
import { AppButton } from '@/components/ui/kit';
import { BlurBackdrop } from '@/components/ui/BlurBackdrop';
import { useReservations } from '@/context/reservations';
import { useShell } from '@/context/shell';
import { ReservableStore, STORES, STORE_MARKERS } from '@/data/stores';
import { APP_WIDTH, colors, gradients, radius, shadow, spacing } from '@/theme';

type BurningScreenProps = {
  onOpenStore?: () => void;
  onPressReview?: () => void;
};

const DEFAULT_STORE_IMG = {
  uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80&auto=format&fit=crop',
};

type LatLng = { lat: number; lng: number };

// Straight-line distance (km) — good enough for "가까운 순" sorting.
function distKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function StoreCard({
  store,
  onReserve,
  onReview,
  onOpen,
  distanceKm,
}: {
  store: ReservableStore;
  onReserve: () => void;
  onReview: () => void;
  onOpen: () => void;
  distanceKm?: number;
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardTop} onPress={onOpen} activeOpacity={0.8}>
        <Image source={store.image} style={styles.thumb} contentFit="cover" />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {store.name}
            </Text>
            <View style={styles.burnBadge}>
              <Text style={styles.burnBadgeText}>🔥 +{store.reward}PB</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            ★ {store.rating} · {store.category}
          </Text>
          <Text style={styles.sub}>
            📍 {store.location} · {store.priceRange}
            {distanceKm != null ? `  ·  ${distanceKm.toFixed(1)}km` : ''}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <AppButton
          label="예약하기"
          variant="coral"
          size="sm"
          onPress={onReserve}
          style={{ flex: 1 }}
        />
        <AppButton
          label="리뷰 쓰기"
          variant="outline"
          size="sm"
          onPress={onReview}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

export default function BurningScreen({ onPressReview }: BurningScreenProps) {
  const { openReserve } = useReservations();
  const { openStoreDetail } = useShell();
  const [search, setSearch] = useState('');
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [areaBounds, setAreaBounds] = useState<{
    north: number;
    south: number;
    east: number;
    west: number;
  } | null>(null);

  // Ask for the user's location so we can show nearby stores first.
  useEffect(() => {
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as any;
    if (!nav?.geolocation) return;
    nav.geolocation.getCurrentPosition(
      (pos: any) =>
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  // 버닝 매장 신청 (public → /api/apply → admin approval).
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({
    storeName: '',
    category: '',
    region: '',
    address: '',
    contact: '',
    applicant: '',
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const updForm = (k: keyof typeof form) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const openApply = () => {
    setForm({ storeName: '', category: '', region: '', address: '', contact: '', applicant: '', note: '' });
    setSubmitted(false);
    setSubmitErr('');
    setApplyOpen(true);
  };

  const submitApply = async () => {
    if (!form.storeName.trim() || !form.region.trim() || !form.contact.trim()) {
      setSubmitErr('매장명 · 지역 · 연락처는 필수예요.');
      return;
    }
    setSubmitting(true);
    setSubmitErr('');
    try {
      const r = await fetch('/api/public?action=apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.ok) setSubmitted(true);
      else setSubmitErr('신청 접수에 실패했어요. 잠시 후 다시 시도해주세요.');
    } catch {
      setSubmitErr('신청 요청에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  // Real (admin-approved) active burning stores from the backend.
  const [remote, setRemote] = useState<ReservableStore[]>([]);
  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => {
        const items: ReservableStore[] = (d.stores || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          category: s.category || '버닝 매장',
          location: s.location || s.region || '',
          lat: typeof s.lat === 'number' ? s.lat : 0,
          lng: typeof s.lng === 'number' ? s.lng : 0,
          reward: 10,
          rating: 0,
          priceRange: '-',
          image: s.image ? { uri: s.image } : DEFAULT_STORE_IMG,
          reservable: true,
          times: Array.isArray(s.times) ? s.times : [],
          photos: Array.isArray(s.photos) ? s.photos : [],
          menus: Array.isArray(s.menus) ? s.menus : [],
          phone: s.phone || '',
        }));
        setRemote(items);
      })
      .catch(() => {});
  }, []);

  // Merge real stores (priority) with the demo seed (deduped by name).
  const allStores = useMemo(() => {
    const names = new Set(remote.map((s) => s.name));
    return [...remote, ...STORES.filter((s) => !names.has(s.name))];
  }, [remote]);


  const markers = useMemo(() => {
    const names = new Set(remote.map((s) => s.name));
    const remoteMarkers = remote
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        category: s.category,
        reward: s.reward,
        image: typeof s.image === 'object' && s.image?.uri ? String(s.image.uri) : '',
        location: s.location,
        rating: s.rating,
      }));
    const staticMarkers = STORE_MARKERS.filter((m) => !names.has(m.name));
    const all = [...remoteMarkers, ...staticMarkers];
    return all;
  }, [remote]);

  const inBounds = (s: ReservableStore) =>
    !areaBounds ||
    (s.lat <= areaBounds.north &&
      s.lat >= areaBounds.south &&
      s.lng <= areaBounds.east &&
      s.lng >= areaBounds.west);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = allStores.filter((s) => inBounds(s));
    if (q) {
      base = base.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.location.toLowerCase().includes(q)
      );
    }
    if (!userLoc) return base;
    // Nearest first.
    return [...base].sort((a, b) => distKm(userLoc, a) - distKm(userLoc, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, userLoc, allStores, areaBounds]);

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.centerWrap}>
          {/* hero */}
          <LinearGradient
            colors={gradients.dusk}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroKicker}>🔥 BURNING MAP</Text>
            <Text style={styles.heroTitle}>지금 뜨는{'\n'}버닝 매장</Text>
            <Text style={styles.heroSub}>
              리뷰하면 보너스 PB를 받아요
            </Text>
          </LinearGradient>

          {/* map — only PEED-registered burning stores show as pins;
              tapping a pin opens that store's detail page */}
          <BurningMap
            markers={markers}
            height={320}
            onMarkerPress={(mk) => {
              const store = allStores.find((s) => s.id === mk.id);
              if (store) openStoreDetail(store);
            }}
            onSearchArea={(b) => setAreaBounds(b)}
          />
          <View style={{ height: spacing.md }} />

          {/* search */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textTertiary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="매장 · 지역 · 카테고리 검색"
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.listHead}>
            <Text style={styles.sectionTitle}>
              {areaBounds ? '이 지역' : userLoc ? '가까운 버닝 매장' : '버닝 매장'} {filtered.length}곳
            </Text>
            {areaBounds && (
              <TouchableOpacity onPress={() => setAreaBounds(null)} hitSlop={8}>
                <Text style={styles.clearArea}>전체 보기 ✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {filtered.map((store) => (
            <StoreCard
              key={store.id}
              store={store}
              onReserve={() => openReserve(store)}
              onReview={() => onPressReview?.()}
              onOpen={() => openStoreDetail(store)}
              distanceKm={userLoc ? distKm(userLoc, store) : undefined}
            />
          ))}

          {filtered.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{search.trim() ? '🔍' : '🔥'}</Text>
              <Text style={styles.emptyText}>
                {search.trim() ? '검색 결과가 없어요' : '아직 등록된 버닝 매장이 없어요'}
              </Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {applyOpen && (
        <BlurBackdrop onPress={() => setApplyOpen(false)}>
          <View style={styles.applyCard}>
            <View style={styles.applyHead}>
              <Text style={styles.applyTitle}>버닝 매장 신청</Text>
              <TouchableOpacity onPress={() => setApplyOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {submitted ? (
              <View style={styles.applyDone}>
                <Text style={styles.applyDoneEmoji}>🎉</Text>
                <Text style={styles.applyDoneTitle}>신청이 접수됐어요!</Text>
                <Text style={styles.applyDoneSub}>
                  검토 후 승인되면 버닝맵에 등록돼요.{'\n'}보통 1~2영업일 소요돼요.
                </Text>
                <AppButton label="닫기" variant="gradient" onPress={() => setApplyOpen(false)} style={{ marginTop: spacing.lg }} />
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <ApplyField label="매장명 *" value={form.storeName} onChangeText={updForm('storeName')} placeholder="예: 사케골목 홍대점" />
                <View style={styles.applyRow}>
                  <View style={{ flex: 1 }}>
                    <ApplyField label="지역(시/도) *" value={form.region} onChangeText={updForm('region')} placeholder="예: 서울" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ApplyField label="카테고리" value={form.category} onChangeText={updForm('category')} placeholder="예: 이자카야" />
                  </View>
                </View>
                <ApplyField label="상세 주소" value={form.address} onChangeText={updForm('address')} placeholder="예: 마포구 어울마당로 00" />
                <ApplyField label="연락처 *" value={form.contact} onChangeText={updForm('contact')} placeholder="예: 010-0000-0000" />
                <ApplyField label="신청자/담당자" value={form.applicant} onChangeText={updForm('applicant')} placeholder="예: 홍길동 사장" />
                <ApplyField label="한마디" value={form.note} onChangeText={updForm('note')} placeholder="매장 소개나 요청사항" multiline />

                {submitErr ? <Text style={styles.applyErr}>⚠ {submitErr}</Text> : null}

                <AppButton
                  label={submitting ? '접수 중…' : '신청하기'}
                  variant="gradient"
                  disabled={submitting}
                  onPress={submitApply}
                  style={{ marginTop: spacing.md }}
                />
                <Text style={styles.applyNote}>* 표시는 필수 항목이에요.</Text>
              </ScrollView>
            )}
          </View>
        </BlurBackdrop>
      )}
    </View>
  );
}

function ApplyField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.applyLabel}>{label}</Text>
      <TextInput
        style={[styles.applyInput, multiline && { height: 76, paddingTop: 12 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  centerWrap: {
    width: APP_WIDTH,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 26,
    lineHeight: 33,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13.5,
    fontWeight: '600',
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.soft,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    paddingLeft: 2,
  },

  chipRow: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  chipTextOn: { color: colors.primary },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clearArea: { fontSize: 13, fontWeight: '800', color: colors.primary, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.soft,
  },
  cardTop: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  thumb: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  burnBadge: {
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  burnBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.coralDeep,
  },
  meta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  sub: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.md,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  /* 매장 신청 CTA + 모달 */
  applyCta: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  applyCtaText: {
    color: colors.white,
    fontSize: 13.5,
    fontWeight: '800',
  },
  applyCard: {
    width: Math.min(APP_WIDTH - spacing.lg * 2, 460),
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lifted,
  },
  applyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  applyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  applyRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  applyLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 5,
  },
  applyInput: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 14.5,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  applyErr: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 13,
    marginTop: spacing.sm,
  },
  applyNote: {
    fontSize: 11.5,
    color: colors.textTertiary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  applyDone: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  applyDoneEmoji: { fontSize: 44, marginBottom: spacing.sm },
  applyDoneTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  applyDoneSub: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
});
