import React, { useMemo } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BRAND_BLUE = '#4F6BFF';

type StoreData = {
  id?: string;
  name?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  phone?: string;
  businessHours?: string;
  description?: string;
  pbReward?: number;
  naverPlaceUrl?: string;
  imageUrls?: string[];
  isBurning?: boolean;
  burningStartAt?: string | null;
  burningEndAt?: string | null;
};

type StoreDetailProps = {
  onClose?: () => void;
  store?: StoreData;
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function StoreDetail({ onClose, store }: StoreDetailProps) {
  const imageUrls = useMemo(() => {
    if (!Array.isArray(store?.imageUrls)) return [];
    return store.imageUrls.filter(Boolean).slice(0, 10);
  }, [store?.imageUrls]);

  const displayAddress = store?.roadAddress || store?.address || '-';
  const displayPb = store?.pbReward ?? 0;

  const burningPeriod =
    store?.burningStartAt || store?.burningEndAt
      ? `${formatDateTime(store?.burningStartAt)} ~ ${formatDateTime(
        store?.burningEndAt
      )}`
      : '-';

  const openNaverPlace = async () => {
    if (!store?.naverPlaceUrl) {
      Alert.alert('안내', '네이버 플레이스 URL이 없습니다.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(store.naverPlaceUrl);

      if (!supported) {
        Alert.alert('오류', '네이버 플레이스를 열 수 없습니다.');
        return;
      }

      await Linking.openURL(store.naverPlaceUrl);
    } catch (error) {
      Alert.alert('오류', '네이버 플레이스를 여는 중 문제가 발생했습니다.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>매장 정보</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* 이미지 */}
        {imageUrls.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imageScroll}
          >
            {imageUrls.map((url, index) => (
              <Image
                key={`${url}-${index}`}
                source={{ uri: url }}
                style={styles.image}
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyImageBox}>
            <Text style={styles.emptyImageText}>매장 사진 없음</Text>
          </View>
        )}

        {/* 매장 카드 */}
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.storeName}>{store?.name || '-'}</Text>
              <Text style={styles.category}>{store?.category || '-'}</Text>
            </View>

            <View style={styles.rightBadges}>
              {store?.isBurning ? (
                <View style={styles.burningBadge}>
                  <Text style={styles.burningBadgeText}>버닝</Text>
                </View>
              ) : null}

              <View style={styles.pb}>
                <Text style={styles.pbText}>+{displayPb} PB</Text>
              </View>
            </View>
          </View>

          <Text style={styles.address}>📍 {displayAddress}</Text>
        </View>

        {/* 상세 정보 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>매장 정보</Text>

          <Info label="주소" value={displayAddress} />
          <Info label="영업시간" value={store?.businessHours || '-'} />
          <Info label="전화번호" value={store?.phone || '-'} />
          <Info label="버닝 기간" value={burningPeriod} />
          <Info label="설명" value={store?.description || '-'} />
        </View>
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={[
            styles.button,
            !store?.naverPlaceUrl && { backgroundColor: '#CBD5E1' },
          ]}
          onPress={openNaverPlace}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>네이버 플레이스에서 확인하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },

  close: {
    fontSize: 24,
    color: '#999',
  },

  imageScroll: {
    paddingRight: 16,
  },

  image: {
    width: 260,
    height: 180,
    borderRadius: 16,
    marginLeft: 16,
    backgroundColor: '#E5E7EB',
  },

  emptyImageBox: {
    height: 180,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyImageText: {
    color: '#6B7280',
    fontWeight: '600',
  },

  card: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  rightBadges: {
    alignItems: 'flex-end',
    gap: 8,
  },

  storeName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },

  category: {
    color: '#6B7280',
    marginTop: 4,
  },

  burningBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },

  burningBadgeText: {
    color: '#7C3AED',
    fontWeight: '800',
  },

  pb: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },

  pbText: {
    color: BRAND_BLUE,
    fontWeight: '800',
  },

  address: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 15,
    lineHeight: 22,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
    color: BRAND_BLUE,
  },

  infoRow: {
    marginBottom: 14,
  },

  infoLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 4,
  },

  infoValue: {
    color: '#111',
    fontWeight: '600',
    fontSize: 15,
    lineHeight: 22,
  },

  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#fff',
  },

  button: {
    height: 55,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
});