/// <reference lib="dom" />
import Constants from 'expo-constants';
import React, { useEffect, useRef, useState } from 'react';

import {
  BurningMapProps,
  cardHtml,
  ensureMapStyles,
  pinHtml,
  wrapStyle,
} from './mapShared';

// 기본 지도 — 카카오맵. CARTO/OSM 타일은 국내에서 지하철역·지명·상권 POI 가
// 거의 안 나와 "지도에 아무 정보가 없다"는 문제가 있었다. 카카오는 국내
// 지도 데이터를 그대로 쓰므로 역 이름·동 이름·건물·주요 상권이 다 보인다.
//
// 키는 공개용 JavaScript 키다(도메인 제한이 걸린 클라이언트 키라 번들에 실려도
// 안전하다). 도메인 화이트리스트는 브라우저 런타임에서 검사되므로, 등록이
// 안 돼 있으면 여기서 실패하고 호출부가 안내 화면으로 내려간다.

const SDK_ID = 'kakao-maps-sdk';
const LOAD_TIMEOUT_MS = 6000;

export function kakaoMapKey(): string {
  // process.env.EXPO_PUBLIC_* 는 Metro 가 빌드 시점에 문자열로 인라인해 준다.
  // app.config.js 의 extra.kakaoMapKey 는 웹 export 에서 빈 값으로 직렬화되는
  // 경우가 있어(확인함) 이쪽을 먼저 본다. extra 는 예전 경로 겸 보험.
  const inlined = process.env.EXPO_PUBLIC_KAKAO_MAP_KEY;
  if (inlined) return String(inlined);
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return String(extra.kakaoMapKey ?? '');
}

let sdkPromise: Promise<any> | null = null;

/**
 * 카카오 SDK 로드. 실패(키 없음·네트워크·도메인 미등록)하면 reject 한다.
 * 도메인이 등록돼 있지 않으면 스크립트는 200 으로 내려오지만 `kakao.maps.load`
 * 콜백이 끝내 안 불리므로, 타임아웃으로도 실패를 잡는다.
 */
export function loadKakao(): Promise<any> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('no dom'));
  }
  const w = window as any;
  if (w.kakao?.maps?.Map) return Promise.resolve(w.kakao.maps);
  if (sdkPromise) return sdkPromise;

  const key = kakaoMapKey();
  if (!key) return Promise.reject(new Error('no kakao map key'));

  sdkPromise = new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const timer = setTimeout(
      () => done(() => reject(new Error('kakao sdk timeout'))),
      LOAD_TIMEOUT_MS
    );
    const ok = () => {
      clearTimeout(timer);
      done(() => resolve(w.kakao.maps));
    };
    const fail = (why: string) => {
      clearTimeout(timer);
      done(() => reject(new Error(why)));
    };

    const boot = () => {
      if (!w.kakao?.maps?.load) return fail('kakao sdk malformed');
      try {
        w.kakao.maps.load(ok);
      } catch {
        fail('kakao maps.load threw');
      }
    };

    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (existing) {
      if (w.kakao?.maps?.load) boot();
      else {
        existing.addEventListener('load', boot);
        existing.addEventListener('error', () => fail('kakao sdk load error'));
      }
      return;
    }

    ensureMapStyles();
    const s = document.createElement('script');
    s.id = SDK_ID;
    s.async = true;
    // autoload=false + kakao.maps.load 로 초기화 시점을 우리가 잡는다.
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    s.onload = boot;
    s.onerror = () => fail('kakao sdk load error');
    document.head.appendChild(s);
  });

  // 실패한 프라미스를 캐시해두면 재시도가 영영 막힌다.
  sdkPromise.catch(() => {
    sdkPromise = null;
  });
  return sdkPromise;
}

// Leaflet 줌 ↔ 카카오 레벨. 카카오는 숫자가 작을수록 확대되고 1~14 범위다.
function toLevel(zoom: number): number {
  return Math.min(14, Math.max(1, 21 - zoom));
}

const FALLBACK_HERE = { lat: 37.5665, lng: 126.978 }; // 서울 — 내 위치를 모를 때

export function BurningMapKakao({
  markers,
  zoom,
  height = 240,
  here,
  onMarkerPress,
  onSearchArea,
}: BurningMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mapsRef = useRef<any>(null); // kakao.maps 네임스페이스
  const [showSearch, setShowSearch] = useState(false);
  const [ready, setReady] = useState(false);

  const onPressRef = useRef(onMarkerPress);
  onPressRef.current = onMarkerPress;

  const pts = markers ?? [];
  const markersKey = pts.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|');

  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const pinsRef = useRef<any[]>([]); // 현재 핀 오버레이들
  const cardRef = useRef<any>(null); // 열려 있는 카드 오버레이 (한 번에 하나)
  const hereRef = useRef<{ lat: number; lng: number } | null>(here ?? null);
  if (here) hereRef.current = here;
  const meRef = useRef<any>(null); // 내 위치 점
  const fittedRef = useRef(false);

  const closeCard = () => {
    if (cardRef.current) {
      cardRef.current.setMap(null);
      cardRef.current = null;
    }
  };

  // 카카오는 숫자가 클수록 넓은 범위다(3 ≈ 골목, 7 ≈ 1km, 10 ≈ 8km).
  //
  // 이름표는 7(약 1km)까지만 띄운다. 그보다 넓어지면 이름을 읽어도 어느
  // 골목인지 알 수 없고, 상자만 지도를 덮는다.
  const LABEL_MAX_LEVEL = 7;

  // 점도 배율에 맞춰 줄인다 — 넓게 볼수록 작아져야 매장이 여럿일 때 서로
  // 뭉개지지 않고, 당겨보면 커져서 누르기 쉽다. [지름, 흰 테두리]
  function dotSize(level: number): [number, number] {
    if (level <= 3) return [18, 3];
    if (level <= 5) return [15, 2.5];
    if (level <= 7) return [12, 2];
    if (level <= 9) return [10, 2];
    return [8, 1.5];
  }

  const syncPins = () => {
    const map = mapRef.current;
    if (!map) return;
    const level = map.getLevel();
    const far = level > LABEL_MAX_LEVEL;
    const [d, b] = dotSize(level);
    pinsRef.current.forEach((o) => {
      const el = o.getContent();
      if (!el || !el.classList) return;
      el.classList.toggle('peed-pin--far', far);
      el.style.setProperty('--dot', `${d}px`);
      el.style.setProperty('--dot-b', `${b}px`);
    });
  };

  // ── 지도는 마운트 시 한 번만 만든다.
  useEffect(() => {
    let cancelled = false;

    loadKakao()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        mapsRef.current = maps;
        containerRef.current.innerHTML = '';

        const initial = ptsRef.current;
        const single = initial.length === 1;
        const start = single
          ? { lat: initial[0].lat, lng: initial[0].lng }
          : (hereRef.current ?? FALLBACK_HERE);

        const map = new maps.Map(containerRef.current, {
          center: new maps.LatLng(start.lat, start.lng),
          level: single ? toLevel(zoom ?? 15) : hereRef.current ? toLevel(13) : toLevel(12),
        });
        mapRef.current = map;

        // 지도가 크지 않아 컨트롤은 얹지 않는다. 줌은 휠·핀치로, 지도 종류
        // 전환은 쓸 일이 없다. 버튼이 늘수록 정작 봐야 할 핀이 가려진다.

        // 빈 곳을 누르면 열려 있던 카드를 닫는다.
        maps.event.addListener(map, 'click', closeCard);

        // 넓게 보면 핀 이름을 감춘다. 말풍선은 줌아웃해도 크기가 그대로라
        // 축소할수록 지도를 뒤덮는다.
        maps.event.addListener(map, 'zoom_changed', syncPins);

        if (!single && !hereRef.current && typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled || !mapRef.current) return;
              const spot = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              hereRef.current = spot;
              mapRef.current.setCenter(new maps.LatLng(spot.lat, spot.lng));
              mapRef.current.setLevel(toLevel(13));
              showMe(spot);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
          );
        } else if (hereRef.current) {
          showMe(hereRef.current);
        }

        // "이 지역 검색" — 사용자가 지도를 움직이면 버튼 노출.
        if (onSearchArea) {
          let moveReady = false;
          setTimeout(() => {
            moveReady = true;
          }, 1200);
          maps.event.addListener(map, 'idle', () => {
            if (moveReady && !cancelled) setShowSearch(true);
          });
        }

        map.relayout();
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        // 호출부(BurningMap.web)가 이미 로드 성공을 확인하고 이 컴포넌트를
        // 띄우므로 여기까지 오는 일은 드물다. 와도 조용히 빈 상자로 둔다.
      });

    return () => {
      cancelled = true;
      setReady(false);
      closeCard();
      pinsRef.current.forEach((o) => o.setMap(null));
      pinsRef.current = [];
      if (meRef.current) {
        meRef.current.setMap(null);
        meRef.current = null;
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 내 위치 점을 찍는다(있으면 옮긴다). */
  const showMe = (spot: { lat: number; lng: number }) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    const pos = new maps.LatLng(spot.lat, spot.lng);
    if (meRef.current) {
      meRef.current.setPosition(pos);
      return;
    }
    meRef.current = new maps.CustomOverlay({
      position: pos,
      zIndex: 1,
      content:
        '<div style="width:16px;height:16px;border-radius:50%;background:#4F6BFF;' +
        'border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)" title="내 위치"></div>',
    });
    meRef.current.setMap(map);
  };

  // ── 핀 갱신. 지도를 다시 만들지 않고 오버레이만 교체한다.
  //
  // 클러스터링은 넣지 않았다. 카카오 MarkerClusterer 는 kakao.maps.Marker 만
  // 받고 CustomOverlay 는 못 받는데, 지금 핀(매장명 + 적립 PB 말풍선)은
  // CustomOverlay 여야 한다. 핀이 50개를 넘어가면 그때 Marker + MarkerImage
  // 조합으로 다시 보는 게 맞다.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!ready || !maps || !map) return;

    closeCard();
    pinsRef.current.forEach((o) => o.setMap(null));
    pinsRef.current = [];

    const cur = ptsRef.current;
    const manyPins = cur.length > 6;

    cur.forEach((p) => {
      const el = document.createElement('div');
      el.className = 'peed-pin peed-pin-k';
      el.innerHTML = pinHtml(p, manyPins);
      el.onclick = (ev) => {
        ev.stopPropagation();
        openCard(p);
      };

      const overlay = new maps.CustomOverlay({
        position: new maps.LatLng(p.lat, p.lng),
        content: el,
        zIndex: 2,
        clickable: true,
      });
      overlay.setMap(map);
      pinsRef.current.push(overlay);
    });

    syncPins();

    // 매장과 내 위치가 한 화면에 들어오게 맞춘다. 고정 줌으로 시작하면 화면
    // 밖에 있는 매장은 있는 줄도 모르고, 반대로 너무 당겨져 있으면 어디를
    // 보고 있는지 감이 안 온다.
    if (cur.length > 0 && !fittedRef.current) {
      try {
        const b = new maps.LatLngBounds();
        cur.forEach((p) => b.extend(new maps.LatLng(p.lat, p.lng)));
        if (hereRef.current) {
          b.extend(new maps.LatLng(hereRef.current.lat, hereRef.current.lng));
        }
        if (cur.length === 1 && !hereRef.current) {
          // 점 하나로 setBounds 하면 최대 배율까지 당겨진다.
          map.setCenter(new maps.LatLng(cur[0].lat, cur[0].lng));
          map.setLevel(6);
        } else {
          map.setBounds(b, 48, 48, 48, 48);
          // 매장이 내 위치 바로 옆이면 setBounds 가 최대 배율까지 당겨버린다.
          if (map.getLevel() < 4) map.setLevel(4);
        }
        fittedRef.current = true;
        syncPins();
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markersKey]);

  /** 핀을 눌렀을 때 카드를 띄운다. 내용은 이 시점에 만든다(거리 반영). */
  const openCard = (p: (typeof pts)[number]) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    closeCard();

    const el = document.createElement('div');
    el.className = 'peed-ov-wrap';
    el.innerHTML = `<div class="peed-ov">${cardHtml(p, hereRef.current)}</div>`;
    // 카드를 누르면 상세로 간다. 닫기 버튼은 두지 않는다 — 지도 아무 곳이나
    // 누르면 닫히고, 작은 카드에 ✕ 까지 얹으면 그것대로 답답하다.
    el.onclick = (ev) => {
      ev.stopPropagation();
      onPressRef.current?.(p);
    };

    cardRef.current = new maps.CustomOverlay({
      position: new maps.LatLng(p.lat, p.lng),
      content: el,
      yAnchor: 1, // 아래 여백(.peed-ov-wrap)이 핀 말풍선을 비켜준다
      zIndex: 9,
      clickable: true,
    });
    cardRef.current.setMap(map);
    map.panTo(new maps.LatLng(p.lat, p.lng));
  };

  const searchArea = () => {
    const map = mapRef.current;
    if (!map || !onSearchArea) return;
    const b = map.getBounds();
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    onSearchArea({
      north: ne.getLat(),
      south: sw.getLat(),
      east: ne.getLng(),
      west: sw.getLng(),
    });
    setShowSearch(false);
  };

  // 내 위치로 이동 — 권한이 이미 있으면 바로, 없으면 그때 물어본다.
  const goHere = () => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const spot = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        hereRef.current = spot;
        map.setCenter(new maps.LatLng(spot.lat, spot.lng));
        map.setLevel(toLevel(14));
        showMe(spot);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  };

  return (
    <div style={wrapStyle(height)}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* 매장 수 배지는 두지 않는다 — 지도 바로 아래 목록 제목이 이미
          "가까운 버닝 매장 N곳" 을 말하고 있어 같은 말을 두 번 하는 셈이다. */}

      <button
        onClick={goHere}
        title="내 위치"
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          zIndex: 3,
          width: 32,
          height: 32,
          border: 'none',
          borderRadius: 9,
          background: 'rgba(255,255,255,.92)',
          color: '#4F6BFF',
          fontSize: 15,
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
            zIndex: 3,
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
