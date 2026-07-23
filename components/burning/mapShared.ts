/// <reference lib="dom" />
import type { CSSProperties } from 'react';

import { MapMarker } from '@/data/stores';

// 지도 화면(BurningMap.kakao)과 스위처(BurningMap.web), 네이티브
// 플레이스홀더(BurningMap.tsx)가 함께 쓰는 조각들 — 공통 props 타입과
// 핀·카드의 HTML·CSS, 거리 계산.

export type MapBounds = { north: number; south: number; east: number; west: number };

export type LatLng = { lat: number; lng: number };

export type BurningMapProps = {
  markers?: MapMarker[];
  zoom?: number;
  height?: number;
  /** 내 위치 — 거리 표시에 쓴다. 부모가 이미 알고 있으면 내려준다. */
  here?: LatLng | null;
  onMarkerPress?: (marker: MapMarker) => void;
  onSearchArea?: (bounds: MapBounds) => void;
};

/** 두 지점 사이 거리(km) — 지도에서 '얼마나 가까운지'가 가장 궁금한 정보다. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 지우는 게 아니라 실제로 이스케이프한다. 예전 구현은 해당 문자를 삭제해서
// "Q&A 포차" 가 "QA 포차" 로 나왔다.
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function fmtDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/** 핀 말풍선(pill) 안쪽 HTML. 매장명 + 적립 PB. */
export function pinHtml(p: MapMarker, small: boolean): string {
  const pb =
    typeof p.reward === 'number' && p.reward > 0
      ? `<span class="peed-pin-pb">+${p.reward}</span>`
      : '';
  return (
    `<div class="peed-pin-pill${small ? ' peed-pin-pill--sm' : ''}">🔥 ${escapeHtml(p.name)}${pb}</div>` +
    '<div class="peed-pin-dot"></div>'
  );
}

/**
 * 핀을 눌렀을 때 뜨는 카드. 지도가 크지 않으므로 한 줄짜리 가로 카드로 —
 * 썸네일 + 매장명 + (업종 · 거리) + 적립 PB 까지만. 주소·별점은 넣지 않는다.
 * 주소는 한 줄을 통째로 잡아먹고, 별점은 서버가 주지도 않는다. 자세한 건
 * 카드를 누르면 열리는 상세 화면이 보여준다.
 *
 * `here` 는 카드를 여는 시점에 넘긴다 — 마커를 만들 때 미리 굳혀두면 위치
 * 권한이 늦게 떨어졌을 때 거리가 영영 안 나온다.
 */
export function cardHtml(p: MapMarker, here: LatLng | null): string {
  const img = p.image
    ? `<img class="peed-card-t" src="${escapeHtml(p.image)}" alt="" loading="lazy" />`
    : '';
  const meta = [
    p.category,
    here ? fmtDistance(distanceKm(here, { lat: p.lat, lng: p.lng })) : '',
  ]
    .filter(Boolean)
    .map((v) => escapeHtml(String(v)))
    .join(' · ');
  const pb =
    typeof p.reward === 'number' && p.reward > 0
      ? `<span class="peed-tag peed-tag--pb">+${p.reward}</span>`
      : '';

  return (
    '<div class="peed-card" role="button" tabindex="0">' +
    img +
    '<div class="peed-card-b">' +
    `<p class="peed-card-n">${escapeHtml(p.name)}</p>` +
    (meta ? `<p class="peed-card-m">${meta}</p>` : '') +
    '</div>' +
    pb +
    '</div>'
  );
}

const PIN_CSS =
  '.peed-pin{cursor:pointer}' +
  // 카카오 CustomOverlay 전용 — 말풍선·점이 절대배치의 기준을 확실히 잡도록
  // 좌표 지점에 0×0 기준점을 만든다. (Leaflet 은 divIcon 이 이 역할을 하므로
  // .peed-pin 에 position 을 주면 오히려 마커 배치가 깨진다.)
  '.peed-pin-k{position:relative;width:0;height:0}' +
  // 이름은 점 위에 그냥 글씨로 얹는다. 흰 테두리 말풍선으로 감싸면 상자가
  // 지도를 가려서, 줌아웃할 때 화면을 뒤덮는 게 바로 그 상자였다. 대신
  // 흰 외곽선(text-shadow)을 둘러 어떤 배경 위에서도 읽히게 한다.
  '.peed-pin-pill{position:absolute;left:0;top:0;' +
  'transform:translate(-50%,calc(-100% - 11px));' +
  'font-size:11px;font-weight:800;color:#1A1A2E;white-space:nowrap;' +
  'text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}' +
  '.peed-pin-pill--sm{font-size:10px;transform:translate(-50%,calc(-100% - 9px))}' +
  '.peed-pin-pb{margin-left:3px;color:#FF5A5A;font-weight:900}' +
  '.peed-pin:hover{z-index:10000 !important}' +
  '.peed-pin-dot{position:absolute;left:0;top:0;' +
  'transform:translate(-50%,-50%);width:14px;height:14px;' +
  'border-radius:50%;background:#FF6B6B;border:2.5px solid #fff;' +
  'box-shadow:0 1px 4px rgba(0,0,0,.35)}' +
  // 도(道) 단위까지 축소했을 때만 이름을 감춘다. 매장이 늘면 그 배율에서는
  // 이름이 서로 겹쳐 읽히지도 않는다. 평소 보는 배율에서는 늘 보인다.
  '.peed-pin--far .peed-pin-pill{display:none}' +
  // 카드 본문 — 한 줄짜리 가로 카드. 지도가 작아서 세로로 쌓으면 답답하다.
  '.peed-card{display:flex;align-items:center;gap:9px;width:206px;padding:8px 10px;' +
  'font-family:inherit;cursor:pointer}' +
  '.peed-card-t{width:40px;height:40px;border-radius:9px;object-fit:cover;' +
  'flex:none;background:#EEF1F8}' +
  '.peed-card-b{flex:1;min-width:0}' +
  '.peed-card-n{font-size:12.5px;font-weight:800;color:#111827;margin:0;' +
  'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.peed-card-m{font-size:11px;font-weight:600;color:#6B7280;margin:2px 0 0;' +
  'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.peed-tag{font-size:10.5px;font-weight:800;padding:2px 6px;border-radius:6px;' +
  'background:#EEF2FF;color:#4F6BFF;flex:none}' +
  '.peed-tag--pb{background:#FFECEC;color:#FF5A5A}' +
  // 카카오 CustomOverlay 용 카드 껍데기 — Leaflet 은 팝업이 껍데기를 그려주지만
  // 카카오는 아무것도 안 그려주므로 여기서 흰 상자와 꼬리를 직접 만든다.
  // yAnchor:1 로 붙이고 아래 여백으로 핀 말풍선을 비켜간다 — 카드 높이가
  // 사진 유무에 따라 달라져도 띄우는 높이가 흔들리지 않는다.
  '.peed-ov-wrap{padding-bottom:28px}' +
  '.peed-ov{position:relative;background:#fff;border-radius:13px;overflow:hidden;' +
  'box-shadow:0 5px 18px rgba(0,0,0,.2)}';

/** 핀·카드 CSS 를 문서에 한 번만 주입한다. */
export function ensureMapStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('peed-map-style')) return;
  const style = document.createElement('style');
  style.id = 'peed-map-style';
  style.textContent = PIN_CSS;
  document.head.appendChild(style);
}

/** 지도 컨테이너 공통 박스 스타일. */
export function wrapStyle(height: number): CSSProperties {
  return {
    position: 'relative',
    width: '100%',
    height,
    borderRadius: 20,
    overflow: 'hidden',
    background: '#EAECEF',
    boxShadow: '0 6px 18px rgba(20, 24, 60, 0.08)',
  };
}
