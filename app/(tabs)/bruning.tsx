import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

const { width, height } = Dimensions.get('window');
const BRAND_BLUE = '#4F6BFF';

type BurningScreenProps = {
  onOpenStore: () => void;
  onPressReview: () => void;
};

type BurningStore = {
  id: string;
  name: string;
  category: string;
  reward: number;
  lat: number;
  lng: number;
  distance: string;
  address: string;
};

const burningStores: BurningStore[] = [
  {
    id: '1',
    name: '샤월의주방',
    category: '요리주점',
    reward: 10,
    lat: 37.5578,
    lng: 126.9246,
    distance: '1.2km',
    address: '서울 마포구 와우산로21길 19 2층',
  },
  {
    id: '2',
    name: '담벗',
    category: '한식주점',
    reward: 10,
    lat: 37.5564,
    lng: 126.9231,
    distance: '1.5km',
    address: '서울 마포구 어울마당로 54 1층',
  },
  {
    id: '3',
    name: '피드버거 연남점',
    category: '버거',
    reward: 10,
    lat: 37.5611,
    lng: 126.9258,
    distance: '0.9km',
    address: '서울 마포구 연남동 000-00',
  },
  {
    id: '4',
    name: '상수 하이볼클럽',
    category: '바 · 펍',
    reward: 10,
    lat: 37.5488,
    lng: 126.9225,
    distance: '2.0km',
    address: '서울 마포구 독막로18길 7',
  },
  {
    id: '5',
    name: '스시윤원',
    category: '일식',
    reward: 10,
    lat: 37.5549,
    lng: 126.9262,
    distance: '1.7km',
    address: '서울 마포구 양화로 00',
  },
];

const INITIAL_REGION: Region = {
  latitude: 37.5578,
  longitude: 126.9246,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export default function BurningScreen({
  onOpenStore,
  onPressReview,
}: BurningScreenProps) {
  const mapRef = useRef<MapView | null>(null);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [region, setRegion] = useState<Region>(INITIAL_REGION);

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return burningStores;

    return burningStores.filter(
      (store) =>
        store.name.toLowerCase().includes(keyword) ||
        store.category.toLowerCase().includes(keyword) ||
        store.address.toLowerCase().includes(keyword)
    );
  }, [search]);

  const selectedStore =
    filteredStores.find((store) => store.id === selectedId) ?? null;

  const focusStoreToUpperArea = (store: BurningStore) => {
    const latitudeOffset = region.latitudeDelta * 0.16;

    mapRef.current?.animateToRegion(
      {
        latitude: store.lat - latitudeOffset,
        longitude: store.lng,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      },
      280
    );
  };

  const handlePressMarker = (storeId: string) => {
    const store = filteredStores.find((item) => item.id === storeId);
    if (!store) return;

    setSelectedId(storeId);
    setSheetVisible(true);
    focusStoreToUpperArea(store);
  };

  const handleCloseSheet = () => {
    setSheetVisible(false);
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={setRegion}
      >
        {filteredStores.map((store) => (
          <Marker
            key={store.id}
            coordinate={{ latitude: store.lat, longitude: store.lng }}
            onPress={() => handlePressMarker(store.id)}
            anchor={{ x: 0.5, y: 3 }}
          >
            <Text style={styles.fireEmoji}>🔥</Text>
          </Marker>
        ))}
      </MapView>

      <View style={styles.topOverlay}>
        <View style={styles.searchBar}>
          <Text style={styles.searchBack}>←</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="찾고 있는 버닝 매장이 있나요?"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <TouchableOpacity style={[styles.chip, styles.chipActive]}>
            <Text style={[styles.chipText, styles.chipTextActive]}>전체</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>맛집</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>카페</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>술집</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chip}>
            <Text style={styles.chipText}>데이트</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.leftFloating}>
        <TouchableOpacity style={styles.roundButton}>
          <Text style={styles.roundButtonText}>◎</Text>
        </TouchableOpacity>
      </View>

      {sheetVisible && selectedStore && (
        <View style={styles.sheetWrap}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>버닝 매장</Text>

            <TouchableOpacity
              style={styles.sheetCloseButton}
              onPress={handleCloseSheet}
            >
              <Text style={styles.sheetCloseText}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.storeCard}>
            <View style={styles.storeInfo}>
              <View style={styles.storeTopRow}>
                <View>
                  <Text style={styles.storeName}>{selectedStore.name}</Text>
                  <Text style={styles.storeCategory}>
                    ★ 5.0 · {selectedStore.category} · {selectedStore.distance}
                  </Text>
                </View>

                <View style={styles.storePbBadge}>
                  <Text style={styles.storePbBadgeText}>+10PB</Text>
                </View>
              </View>

              <Text style={styles.storeAddress}>{selectedStore.address}</Text>

              <View style={styles.storeMetaRow}>
                <Text style={styles.storeMeta}>🕒 17:00 영업 시작</Text>
              </View>
              <View style={styles.storeMetaRow}>
                <Text style={styles.storeMeta}>₩ 저녁 1 - 3만원</Text>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={onOpenStore}
                >
                  <Text style={styles.secondaryButtonText}>매장 보기</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onPressReview}
                >
                  <Text style={styles.primaryButtonText}>리뷰 인증</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.bottomGuide}>
            <Text style={styles.bottomGuideText}>
              버닝 매장은 리뷰 인증 시 추가 PB를 받을 수 있는 제휴 매장이에요.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  map: {
    width,
    height,
  },

  topOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    zIndex: 20,
  },

  searchBar: {
    marginHorizontal: 18,
    marginTop: 0,
    height: 58,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  searchBack: {
    fontSize: 30,
    color: '#111827',
    marginRight: 10,
    marginTop: -2,
  },

  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#111827',
    fontWeight: '500',
  },

  chipRow: {
    paddingHorizontal: 18,
    paddingTop: 12,
  },

  chip: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  chipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },

  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },

  chipTextActive: {
    color: '#FFFFFF',
  },

  leftFloating: {
    position: 'absolute',
    left: 18,
    bottom: 110,
    zIndex: 20,
  },

  roundButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  roundButtonText: {
    fontSize: 24,
    color: '#111827',
    fontWeight: '800',
  },

  fireEmoji: {
    fontSize: 30,
    lineHeight: 34,
  },

  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 105,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    zIndex: 25,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },

  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },

  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  sheetCloseText: {
    fontSize: 24,
    color: '#6B7280',
    marginTop: -2,
  },

  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },

  storeInfo: {
    flex: 1,
  },

  storeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },

  storeName: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },

  storeCategory: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },

  storePbBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },

  storePbBadgeText: {
    color: BRAND_BLUE,
    fontSize: 13,
    fontWeight: '800',
  },

  storeAddress: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },

  storeMetaRow: {
    marginBottom: 4,
  },

  storeMeta: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },

  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  secondaryButtonText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '800',
  },

  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  bottomGuide: {
    paddingTop: 10,
    paddingBottom: 2,
  },

  bottomGuideText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
  },
});
