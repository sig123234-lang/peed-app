/// <reference lib="dom" />
import React, { useEffect, useState } from 'react';

import { BurningMapKakao, kakaoMapKey, loadKakao } from './BurningMap.kakao';
import { BurningMapLeaflet } from './BurningMap.leaflet';
import { BurningMapProps, wrapStyle } from './mapShared';

export type { MapBounds } from './mapShared';

// 어느 지도를 띄울지 고르는 스위처.
//
// 기본은 카카오맵이다 — 국내 지도라 지하철역·동 이름·상권 POI 가 다 보인다.
// 다만 카카오 SDK 는 도메인 화이트리스트를 브라우저에서 검사하므로, 배포
// 도메인이 카카오 콘솔에 등록돼 있지 않으면 런타임에 실패한다. 그때는 키가
// 필요 없는 Leaflet + CARTO 지도로 내려간다. 정보량은 떨어져도 지도가 빈
// 화면이 되는 것보다는 낫다.
//
// 판정은 모듈 전역에 한 번만 남겨, 화면을 옮겨 다녀도 매번 다시 재지 않는다.
type Pick = 'kakao' | 'leaflet';

let decided: Pick | null = null;
let deciding: Promise<Pick> | null = null;

function decide(): Promise<Pick> {
  if (decided) return Promise.resolve(decided);
  if (deciding) return deciding;
  if (!kakaoMapKey()) {
    decided = 'leaflet';
    return Promise.resolve(decided);
  }
  deciding = loadKakao()
    .then<Pick>(() => 'kakao')
    .catch<Pick>(() => 'leaflet')
    .then((pick) => {
      decided = pick;
      deciding = null;
      return pick;
    });
  return deciding;
}

export function BurningMap(props: BurningMapProps) {
  const [pick, setPick] = useState<Pick | null>(decided);

  useEffect(() => {
    if (pick) return;
    let alive = true;
    decide().then((p) => {
      if (alive) setPick(p);
    });
    return () => {
      alive = false;
    };
  }, [pick]);

  // 판정이 끝나기 전에는 같은 크기의 빈 상자를 둔다 — 지도가 뜨면서 아래
  // 목록이 밀려 내려가는 일이 없게.
  if (!pick) return <div style={wrapStyle(props.height ?? 240)} />;

  return pick === 'kakao' ? <BurningMapKakao {...props} /> : <BurningMapLeaflet {...props} />;
}
