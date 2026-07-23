/// <reference lib="dom" />
import React, { useEffect, useRef, useState } from 'react';

import { MapMarker } from '@/data/stores';

// Web interactive map — Leaflet + CARTO "light_all" tiles: a clean base map that
// DOES show context labels (도로명·지역명·지하철역 등, 캐치테이블/직방 수준)
// while staying light enough that our coral PEED pins stay readable. No API key
// or domain registration required. If the CDN can't load, we fall back to a
// keyless Google embed so the map never goes blank.
const DEFAULT_CENTER = { lat: 36.5, lng: 127.8 }; // middle of Korea (fallback only)
// Where to center the nationwide map when we don't (yet) know the user's spot.
const FALLBACK_HERE = { lat: 37.5665, lng: 126.978 }; // Seoul

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
const CLUSTER_CSS2 = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
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
      // If CSS load event is missed, don't block forever.
      link.onerror = () => {
        cssReady = true;
      };
      document.head.appendChild(link);
    } else {
      cssReady = true;
    }
    if (!document.getElementById('peed-map-style')) {
      const style = document.createElement('style');
      style.id = 'peed-map-style';
      style.textContent =
        '.peed-pin{cursor:pointer}' +
        '.peed-pin-pill{position:absolute;left:0;top:0;' +
        'transform:translate(-50%,calc(-100% - 17px));padding:3px 9px;' +
        'background:#fff;border:1.6px solid #FF6B6B;border-radius:999px;' +
        'font-size:11px;font-weight:800;color:#1A1A2E;white-space:nowrap;' +
        'box-shadow:0 1px 5px rgba(0,0,0,.22)}' +
        '.peed-pin-pill--sm{padding:2px 7px;font-size:10px;' +
        'transform:translate(-50%,calc(-100% - 14px))}' +
        '.peed-pin-pb{margin-left:4px;color:#4F6BFF;font-weight:900}' +
        '.peed-pin:hover{z-index:10000 !important}' +
        // 핀을 누르면 뜨는 카드 — 사진·업종·거리·PB 를 지도 위에서 바로 본다.
        '.leaflet-popup-content-wrapper{border-radius:14px;padding:0;overflow:hidden}' +
        '.leaflet-popup-content{margin:0;width:230px !important}' +
        '.peed-card{font-family:inherit}' +
        '.peed-card img{width:100%;height:104px;object-fit:cover;display:block;background:#EEF1F8}' +
        '.peed-card-b{padding:10px 12px 12px}' +
        '.peed-card-n{font-size:14px;font-weight:800;color:#111827;margin:0 0 3px}' +
        '.peed-card-m{font-size:11.5px;font-weight:600;color:#6B7280;margin:0 0 8px}' +
        '.peed-card-r{display:flex;gap:6px;align-items:center;margin-bottom:9px;flex-wrap:wrap}' +
        '.peed-tag{font-size:11px;font-weight:800;padding:2px 7px;border-radius:6px;' +
        'background:#EEF2FF;color:#4F6BFF}' +
        '.peed-tag--pb{background:#FFECEC;color:#FF5A5A}' +
        '.peed-card-btn{display:block;width:100%;border:none;border-radius:8px;padding:8px 0;' +
        'background:#4F6BFF;color:#fff;font-size:12.5px;font-weight:800;cursor:pointer}' +
        '.peed-badge{position:absolute;left:12px;bottom:12px;z-index:1000;background:#fff;' +
        'border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;color:#111827;' +
        'box-shadow:0 2px 10px rgba(0,0,0,.16)}' +
        '.peed-pin-dot{position:absolute;left:0;top:0;' +
        'transform:translate(-50%,-50%);width:17px;height:17px;' +
        'border-radius:50%;background:#FF6B6B;border:3px solid #fff;' +
        'box-shadow:0 1px 5px rgba(0,0,0,.4)}';
      document.head.appendChild(style);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => {
      // Wait until the Leaflet CSS has applied so tiles lay out correctly, then
      // best-effort load the clustering plugin before resolving.
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

/** 두 지점 사이 거리(km) — 지도에서 '얼마나 가까운지'가 가장 궁금한 정보다. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 핀을 눌렀을 때 뜨는 카드. 사진·업종·지역·거리·적립 PB 를 한 번에 보여준다. */
function cardHtml(p: MapMarker, here: { lat: number; lng: number } | null): string {
  const img = p.image
    ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" />`
    : '';
  const meta = [p.category, p.location].filter(Boolean).map((v) => escapeHtml(String(v))).join(' · ');
  const tags: string[] = [];
  if (here) {
    const d = distanceKm(here, { lat: p.lat, lng: p.lng });
    tags.push(`<span class="peed-tag">${d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`}</span>`);
  }
  if (typeof p.rating === 'number' && p.rating > 0) {
    tags.push(`<span class="peed-tag">★ ${p.rating.toFixed(1)}</span>`);
  }
  if (typeof p.reward === 'number' && p.reward > 0) {
    tags.push(`<span class="peed-tag peed-tag--pb">리뷰 +${p.reward} PB</span>`);
  }
  return (
    '<div class="peed-card">' +
    img +
    '<div class="peed-card-b">' +
    `<p class="peed-card-n">${escapeHtml(p.name)}</p>` +
    (meta ? `<p class="peed-card-m">${meta}</p>` : '') +
    (tags.length ? `<div class="peed-card-r">${tags.join('')}</div>` : '') +
    '<button class="peed-card-btn" type="button">상세보기</button>' +
    '</div></div>'
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, '');
}

type MapBounds = { north: number; south: number; east: number; west: number };

export function BurningMap({
  markers,
  zoom,
  height = 240,
  onMarkerPress,
  onSearchArea,
}: {
  markers?: MapMarker[];
  zoom?: number;
  height?: number;
  onMarkerPress?: (marker: MapMarker) => void;
  onSearchArea?: (bounds: MapBounds) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Keep the latest press handler without re-initialising the map every render.
  const onPressRef = useRef(onMarkerPress);
  onPressRef.current = onMarkerPress;

  const pts = markers ?? [];
  const markersKey = pts.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|');

  // 최신 마커를 렌더 없이 참조(초기 센터링·마커 갱신용).
  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const layerRef = useRef<any>(null); // 현재 마커 레이어
  const hereRef = useRef<{ lat: number; lng: number } | null>(null); // 내 위치(거리 계산용)
  const fittedRef = useRef(false); // 전체 보기 1회만
  const [ready, setReady] = useState(false);

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
          map.setView([FALLBACK_HERE.lat, FALLBACK_HERE.lng], 12);
          if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (cancelled || !map) return;
                const here: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                map.setView(here, 13);
                hereRef.current = { lat: here[0], lng: here[1] };
                L.circleMarker(here, {
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

  // ── 마커만 갱신(지도 재생성 없이). 카테고리·이 지역 검색·원격 로드 시 여기만 돈다.
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
        ? L.markerClusterGroup({ maxClusterRadius: 48, showCoverageOnHover: false, spiderfyOnMaxZoom: true })
        : L.layerGroup();

    cur.forEach((p) => {
      const pb = typeof p.reward === 'number' && p.reward > 0 ? `<span class="peed-pin-pb">+${p.reward}</span>` : '';
      const icon = L.divIcon({
        className: 'peed-pin',
        html:
          `<div class="peed-pin-pill${manyPins ? ' peed-pin-pill--sm' : ''}">🔥 ${escapeHtml(p.name)}${pb}</div>` +
          '<div class="peed-pin-dot"></div>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name, riseOnHover: true });
      m.bindPopup(cardHtml(p, hereRef.current), { closeButton: true, autoPan: true, offset: [0, -22] });
      // 카드 안의 '상세보기' 를 눌렀을 때만 상세 화면으로 간다. 핀을 눌렀다고
      // 바로 화면이 바뀌면 지도에서 여러 곳을 비교할 수가 없다.
      m.on('popupopen', (e: any) => {
        const btn = e.popup.getElement()?.querySelector('.peed-card-btn');
        if (btn) btn.onclick = () => onPressRef.current?.(p);
      });
      cluster.addLayer(m);
    });

    map.addLayer(cluster);
    layerRef.current = cluster;

    // 핀이 여러 개면 전부 보이도록 화면을 맞춘다. 고정 줌이면 화면 밖에 있는
    // 매장은 있는 줄도 모른다.
    if (cur.length > 1 && !fittedRef.current) {
      try {
        map.fitBounds(
          L.latLngBounds(cur.map((p) => [p.lat, p.lng])),
          { padding: [48, 48], maxZoom: 15 }
        );
        fittedRef.current = true;
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markersKey]);

  const wrapStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height,
    borderRadius: 20,
    overflow: 'hidden',
    background: '#EAECEF',
    boxShadow: '0 6px 18px rgba(20, 24, 60, 0.08)',
  };

  // Fallback: keyless Google Maps embed.
  if (failed) {
    const q = encodeURIComponent(
      pts.length === 1 ? `${pts[0].lat},${pts[0].lng}` : '대한민국'
    );
    const z = zoom ?? (pts.length === 1 ? 16 : 14);
    return (
      <div style={wrapStyle}>
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
    <div style={wrapStyle}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 몇 곳이 있는지 — 지도만 보고는 알 수 없던 정보 */}
      {pts.length > 0 && <div className="peed-badge">🔥 버닝 매장 {pts.length}곳</div>}

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
