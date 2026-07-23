/// <reference lib="dom" />
import type { CSSProperties } from 'react';

import { MapMarker } from '@/data/stores';

// 카카오맵 구현(BurningMap.kakao)과 Leaflet 폴백(BurningMap.leaflet)이 함께 쓰는
// 조각들. 두 지도가 같은 핀·같은 카드로 보여야 폴백이 일어나도 사용자가
// 화면이 바뀐 걸 눈치채지 못한다.

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
 * 핀을 눌렀을 때 뜨는 카드. 사진·업종·지역·거리·적립 PB 를 한 번에 보여준다.
 * `here` 는 카드를 여는 시점에 넘긴다 — 마커를 만들 때 미리 굳혀두면 위치
 * 권한이 늦게 떨어졌을 때 거리가 영영 안 나온다.
 */
export function cardHtml(p: MapMarker, here: LatLng | null): string {
  const img = p.image ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" />` : '';
  const meta = [p.category, p.location]
    .filter(Boolean)
    .map((v) => escapeHtml(String(v)))
    .join(' · ');

  const tags: string[] = [];
  if (here) {
    tags.push(`<span class="peed-tag">${fmtDistance(distanceKm(here, { lat: p.lat, lng: p.lng }))}</span>`);
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

const PIN_CSS =
  '.peed-pin{cursor:pointer}' +
  // 카카오 CustomOverlay 전용 — 말풍선·점이 절대배치의 기준을 확실히 잡도록
  // 좌표 지점에 0×0 기준점을 만든다. (Leaflet 은 divIcon 이 이 역할을 하므로
  // .peed-pin 에 position 을 주면 오히려 마커 배치가 깨진다.)
  '.peed-pin-k{position:relative;width:0;height:0}' +
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
  'box-shadow:0 1px 5px rgba(0,0,0,.4)}' +
  // 카드 본문 — Leaflet 팝업 안에서도, 카카오 CustomOverlay 안에서도 같은 모양.
  '.peed-card{font-family:inherit;width:230px}' +
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
  '.peed-badge{position:absolute;left:12px;bottom:12px;z-index:3;background:#fff;' +
  'border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;color:#111827;' +
  'box-shadow:0 2px 10px rgba(0,0,0,.16)}' +
  // 카카오 CustomOverlay 용 카드 껍데기 — Leaflet 은 팝업이 껍데기를 그려주지만
  // 카카오는 아무것도 안 그려주므로 여기서 흰 상자와 꼬리를 직접 만든다.
  // yAnchor:1 로 붙이고 아래 여백으로 핀 말풍선을 비켜간다 — 카드 높이가
  // 사진 유무에 따라 달라져도 띄우는 높이가 흔들리지 않는다.
  '.peed-ov-wrap{padding-bottom:34px}' +
  '.peed-ov{position:relative;background:#fff;border-radius:14px;overflow:hidden;' +
  'box-shadow:0 6px 22px rgba(0,0,0,.22)}' +
  '.peed-ov-x{position:absolute;right:6px;top:6px;z-index:2;width:24px;height:24px;' +
  'border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font-size:14px;' +
  'line-height:1;cursor:pointer}';

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
