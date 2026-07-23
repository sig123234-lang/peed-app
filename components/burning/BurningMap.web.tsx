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
      m.on('click', () => onPressRef.current?.(p));
      cluster.addLayer(m);
    });

    map.addLayer(cluster);
    layerRef.current = cluster;
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

  return (
    <div style={wrapStyle}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
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
