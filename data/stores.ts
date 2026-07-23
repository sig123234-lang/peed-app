// Shared reservable-store data — real Mapo-gu (마포구) spots. Photos are
// category-matched stock food shots from Unsplash (hotlinkable, verified).
export type ReservableStore = {
  id: string;
  name: string;
  category: string;
  location: string;
  lat: number; // real Mapo-gu coordinates (for map pins)
  lng: number;
  reward: number; // PB earned for a burning review
  rating: number;
  priceRange: string;
  image: any;
  reservable: boolean;
  times: string[]; // bookable time slots
  photos?: string[]; // 갤러리 (네이버/업로드)
  menus?: { name: string; price: number }[]; // 메뉴·가격
  phone?: string;
};

// 실 사용 전환 — 데모 매장 제거. 실제 버닝 매장은 서버(/api/stores)에서만 온다.
export const STORES: ReservableStore[] = [];

export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  reward?: number;
  // 지도 위 말풍선에 바로 보여줄 정보. 핀만 찍혀 있으면 어디가 어떤 곳인지
  // 알 수 없어 매번 상세 화면을 열었다 닫아야 했다.
  image?: string;
  location?: string;
  rating?: number;
};

// Stable, module-level marker list — only PEED-registered stores show as pins.
export const STORE_MARKERS: MapMarker[] = STORES.map((s) => ({
  id: s.id,
  name: s.name,
  lat: s.lat,
  lng: s.lng,
  category: s.category,
  reward: s.reward,
}));
