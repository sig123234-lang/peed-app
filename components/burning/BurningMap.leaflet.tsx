/// <reference lib="dom" />
import React, { useEffect, useRef, useState } from 'react';

import {
  BurningMapProps,
  cardHtml,
  ensureMapStyles,
  pinHtml,
  wrapStyle,
} from './mapShared';

// 폴백 지도 — Leaflet + CARTO "light_all" 타일. 키가 필요 없어 어디서든 뜨지만
// 국내에서는 라벨이 거의 없다(지하철역·상권 POI 가 안 나온다). 기본 지도는
// BurningMap.kakao 가 맡고, 카카오 키가 없거나 SDK 로드/도메인 인증이 실패했을
// 때만 이쪽으로 내려온다. CDN 마저 죽으면 키 없는 구글 임베드로 한 번 더
// 폴백해 지도가 빈 화면이 되는 일이 없게 한다.
const FALLBACK_HERE = { lat: 37.5665, lng: 126.978 }; // 서울 — 내 위치를 모를 때

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
const CLUSTER_CSS2 = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap &copy; CARTO';

let leafletPromise: Promise<any> | null = null;

function addCss(id: string, href: string) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

// 팝업 껍데기만 Leaflet 전용 — 카드 본문 CSS 는 mapShared 가 담당한다.
function ensureLeafletStyles() {
  if (typeof document === 'undefined' || document.getElementById('peed-leaflet-style')) return;
  const style = document.createElement('style');
  style.id = 'peed-leaflet-style';
  style.textContent =
    '.leaflet-popup-content-wrapper{border-radius:14px;padding:0;overflow:hidden}' +
    '.leaflet-popup-content{margin:0;width:230px !important}';
  document.head.appendChild(style);
}

// markercluster 플러그인은 있으면 좋고 없으면 그냥 개별 핀으로 폴백(선택적 로드).
function loadClusterPlugin(w: any): Promise<void> {
  return new Promise((resolve) => {
    if (w.L && w.L.markerClusterGroup) return resolve();
    addCss('leaflet-cluster-css', CLUSTER_CSS);
    addCss('leaflet-cluster-css2', CLUSTER_CSS2);
    const s = document.createElement('script');
    s.src = CLUSTER_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // 실패해도 진행(클러스터 없이)
    document.head.appendChild(s);
  });
}

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('no dom'));
  }
  const w = window as any;
  if (w.L && w.L.markerClusterGroup) return Promise.resolve(w.L);
  if (w.L) return loadClusterPlugin(w).then(() => w.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    let cssReady = false;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.onload = () => {
        cssReady = true;
      };
      // CSS load 이벤트를 놓쳐도 영영 막히지 않게.
      link.onerror = () => {
        cssReady = true;
      };
      document.head.appendChild(link);
    } else {
      cssReady = true;
    }
    ensureMapStyles();
    ensureLeafletStyles();

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => {
      // Leaflet CSS 가 적용된 뒤에야 타일 배치가 맞는다. 그 다음 클러스터
      // 플러그인을 best-effort 로 붙이고 resolve.
      const waitCss = () => {
        if (cssReady) loadClusterPlugin(w).then(() => resolve(w.L));
        else requestAnimationFrame(waitCss);
      };
      waitCss();
    };
    script.onerror = () => reject(new Error('leaflet load failed'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

export function BurningMapLeaflet({
  markers,
  zoom,
  height = 240,
  here,
  onMarkerPress,
  onSearchArea,
}: BurningMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // 최신 핸들러를 렌더마다 다시 지도 만들지 않고 참조한다.
  const onPressRef = useRef(onMarkerPress);
  onPressRef.current = onMarkerPress;

  const pts = markers ?? [];
  const markersKey = pts.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|');

  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const layerRef = useRef<any>(null); // 현재 마커 레이어
  const hereRef = useRef<{ lat: number; lng: number } | null>(here ?? null); // 거리 계산용
  if (here) hereRef.current = here;
  const fittedRef = useRef(false); // 전체 보기 1회만
  const [ready, setReady] = useState(false);

  // 이 줌보다 넓게 보고 있으면 핀 이름을 감추고 점만 남긴다. 말풍선은
  // 줌아웃해도 크기가 그대로라 축소할수록 지도를 뒤덮는다.
  const LABEL_MIN_ZOOM = 15;

  const syncPinLabels = () => {
    const map = mapRef.current;
    if (!map || !containerRef.current) return;
    const far = map.getZoom() < LABEL_MIN_ZOOM;
    containerRef.current.querySelectorAll('.peed-pin').forEach((el) => {
      el.classList.toggle('peed-pin--far', far);
    });
  };

  // ── 지도는 마운트 시 딱 한 번만 생성한다. 필터/데이터가 바뀌어도 재생성하지
  //    않아(타일 재로딩·지도 파괴 방지) 진입/조작 렉을 없앤다.
  useEffect(() => {
    let cancelled = false;
    let map: any = null;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = '';

        map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        });
        mapRef.current = map;

        L.tileLayer(TILE_URL, {
          subdomains: 'abcd',
          maxZoom: 20,
          attribution: TILE_ATTR,
        }).addTo(map);

        // 초기 뷰 — 매장 상세(핀 1개)면 그 지점, 아니면 사용자 위치 근처.
        const initial = ptsRef.current;
        if (initial.length === 1) {
          map.setView([initial[0].lat, initial[0].lng], zoom ?? 15);
        } else {
          const start = hereRef.current ?? FALLBACK_HERE;
          map.setView([start.lat, start.lng], hereRef.current ? 13 : 12);
          if (!hereRef.current && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (cancelled || !map) return;
                const spot: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                map.setView(spot, 13);
                hereRef.current = { lat: spot[0], lng: spot[1] };
                L.circleMarker(spot, {
                  radius: 8,
                  color: '#ffffff',
                  weight: 3,
                  fillColor: '#4F6BFF',
                  fillOpacity: 1,
                })
                  .addTo(map)
                  .bindTooltip('내 위치', { direction: 'top', offset: [0, -6] });
              },
              () => {},
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
            );
          }
        }

        // "이 지역 검색" — 사용자가 지도를 움직이면 버튼 노출.
        if (onSearchArea) {
          let moveReady = false;
          setTimeout(() => {
            moveReady = true;
          }, 1200);
          map.on('moveend', () => {
            if (moveReady && !cancelled) setShowSearch(true);
          });
        }

        map.on('zoomend', syncPinLabels);

        requestAnimationFrame(() => {
          if (!cancelled && map) map.invalidateSize();
        });
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      setReady(false);
      layerRef.current = null;
      mapRef.current = null;
      if (map) {
        try {
          map.remove();
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 마커만 갱신(지도 재생성 없이). 이 지역 검색·원격 로드 시 여기만 돈다.
  useEffect(() => {
    const map = mapRef.current;
    const L = (typeof window !== 'undefined' && (window as any).L) || null;
    if (!ready || !map || !L) return;

    if (layerRef.current) {
      try {
        map.removeLayer(layerRef.current);
      } catch {
        // ignore
      }
      layerRef.current = null;
    }

    const cur = ptsRef.current;
    const manyPins = cur.length > 6;
    const cluster =
      typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({
            maxClusterRadius: 48,
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
          })
        : L.layerGroup();

    cur.forEach((p) => {
      const icon = L.divIcon({
        className: 'peed-pin',
        html: pinHtml(p, manyPins),
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name, riseOnHover: true });
      // 카드 내용은 '열릴 때' 만든다 — 위치 권한이 늦게 떨어져도 거리가 나온다.
      m.bindPopup(() => cardHtml(p, hereRef.current), {
        closeButton: false,
        autoPan: true,
        offset: [0, -18],
      });
      // 카드를 누르면 상세로 간다. 핀을 눌렀다고 바로 화면이 바뀌면 지도에서
      // 여러 곳을 비교할 수가 없어, 카드를 한 번 거치게 한다.
      m.on('popupopen', (e: any) => {
        const card = e.popup.getElement()?.querySelector('.peed-card');
        if (card) card.onclick = () => onPressRef.current?.(p);
      });
      cluster.addLayer(m);
    });

    map.addLayer(cluster);
    layerRef.current = cluster;
    syncPinLabels();

    // 핀이 여러 개면 전부 보이도록 화면을 맞춘다. 고정 줌이면 화면 밖에 있는
    // 매장은 있는 줄도 모른다.
    if (cur.length > 1 && !fittedRef.current) {
      try {
        map.fitBounds(L.latLngBounds(cur.map((p) => [p.lat, p.lng])), {
          padding: [48, 48],
          maxZoom: 15,
        });
        fittedRef.current = true;
      } catch {
        // ignore
      }
    }
  }, [ready, markersKey]);

  const box = wrapStyle(height);

  // 최종 폴백: 키 없는 구글 지도 임베드.
  if (failed) {
    const q = encodeURIComponent(pts.length === 1 ? `${pts[0].lat},${pts[0].lng}` : '대한민국');
    const z = zoom ?? (pts.length === 1 ? 16 : 14);
    return (
      <div style={box}>
        <iframe
          title="버닝맵"
          src={`https://www.google.com/maps?q=${q}&hl=ko&z=${z}&output=embed`}
          loading="lazy"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    );
  }

  const searchArea = () => {
    const map = mapRef.current;
    if (!map || !onSearchArea) return;
    const b = map.getBounds();
    onSearchArea({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
    setShowSearch(false);
  };

  // 내 위치로 이동 — 권한이 이미 있으면 바로, 없으면 그때 물어본다.
  const goHere = () => {
    const map = mapRef.current;
    if (!map || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        hereRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  };

  return (
    <div style={box}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 매장 수 배지는 두지 않는다 — 지도 바로 아래 목록 제목이 이미
          "가까운 버닝 매장 N곳" 을 말하고 있어 같은 말을 두 번 하는 셈이다. */}

      <button
        onClick={goHere}
        title="내 위치"
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 1000,
          width: 38,
          height: 38,
          border: 'none',
          borderRadius: 10,
          background: '#fff',
          color: '#4F6BFF',
          fontSize: 17,
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(0,0,0,.18)',
        }}
      >
        ◎
      </button>

      {onSearchArea && showSearch && (
        <button
          onClick={searchArea}
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            border: 'none',
            borderRadius: 999,
            padding: '8px 16px',
            background: '#4F6BFF',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(79,107,255,.45)',
          }}
        >
          🔍 이 지역 검색
        </button>
      )}
    </div>
  );
}
