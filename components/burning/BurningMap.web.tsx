/// <reference lib="dom" />
import React, { useEffect, useState } from 'react';

import { BurningMapKakao, kakaoMapKey, loadKakao } from './BurningMap.kakao';
import { BurningMapProps, wrapStyle } from './mapShared';

export type { MapBounds } from './mapShared';

// 지도는 카카오맵 하나만 쓴다.
//
// 한때 Leaflet + CARTO 지도를 폴백으로 함께 들고 있었다. 카카오 SDK 가
// 도메인 화이트리스트를 브라우저에서 검사해서, 배포 도메인이 카카오 콘솔에
// 등록됐는지 서버에서 확인할 방법이 없었기 때문이다. 등록이 확인된 지금은
// 폴백을 걷어냈다. 400줄짜리 두 번째 지도를 유지하는 값보다, 평소 한 번도
// 실행되지 않아 조용히 썩는 비용이 크다. 게다가 그 폴백 지도는 국내에서
// 역 이름도 안 나오는, 애초에 이 화면을 고치게 만든 그 지도였다.
//
// 그래도 지도가 안 뜨는 경우는 있을 수 있어(네트워크·카카오 장애·키 만료)
// 그때는 빈 상자 대신 안내를 보여준다. 매장 목록은 지도 아래에 그대로 있어
// 지도가 없어도 화면은 굴러간다.
type State = 'probing' | 'ok' | 'failed';

let decided: State | null = null;
let deciding: Promise<State> | null = null;

function decide(): Promise<State> {
  if (decided) return Promise.resolve(decided);
  if (deciding) return deciding;
  if (!kakaoMapKey()) {
    decided = 'failed';
    return Promise.resolve(decided);
  }
  deciding = loadKakao()
    .then<State>(() => 'ok')
    .catch<State>(() => 'failed')
    .then((s) => {
      decided = s;
      deciding = null;
      return s;
    });
  return deciding;
}

/** 지도를 못 띄웠을 때. 카카오맵으로 직접 열 수 있는 길만 남겨둔다. */
function MapUnavailable({ markers, height }: Pick<BurningMapProps, 'markers' | 'height'>) {
  const pts = markers ?? [];
  const one = pts.length === 1 ? pts[0] : null;
  const link = one
    ? `https://map.kakao.com/link/map/${encodeURIComponent(one.name)},${one.lat},${one.lng}`
    : 'https://map.kakao.com/';

  return (
    <div
      style={{
        ...wrapStyle(height ?? 240),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
      }}
    >
      <div style={{ fontSize: 26 }}>🗺️</div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#4B5563' }}>
        지도를 불러오지 못했어요
      </div>
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          color: '#4F6BFF',
          textDecoration: 'none',
          background: '#fff',
          borderRadius: 999,
          padding: '7px 14px',
          boxShadow: '0 2px 8px rgba(0,0,0,.12)',
        }}
      >
        카카오맵에서 보기
      </a>
    </div>
  );
}

export function BurningMap(props: BurningMapProps) {
  const [state, setState] = useState<State>(decided ?? 'probing');

  useEffect(() => {
    if (state !== 'probing') return;
    let alive = true;
    decide().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, [state]);

  // 판정이 끝나기 전에는 같은 크기의 빈 상자를 둔다 — 지도가 뜨면서 아래
  // 목록이 밀려 내려가는 일이 없게.
  if (state === 'probing') return <div style={wrapStyle(props.height ?? 240)} />;
  if (state === 'failed') return <MapUnavailable markers={props.markers} height={props.height} />;

  return <BurningMapKakao {...props} />;
}
