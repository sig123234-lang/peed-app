import React from 'react';

// 웹 PWA 전용 영상 재생기. react-native-web 은 react-dom 위에서 돌기 때문에
// 순수 DOM <video> 를 그대로 렌더할 수 있다(별도 영상 라이브러리 없이). 광고
// 영상은 인스타 스토리 광고처럼 '음소거·자동재생'으로 튼다 — 모바일 웹에서
// 자동재생이 허용되려면 muted + playsInline 이 반드시 필요하다.
export function WebVideo({
  uri,
  poster,
  cover = true,
  loop = true,
  onEnded,
  radius = 0,
}: {
  uri: string;
  poster?: string;
  cover?: boolean;
  loop?: boolean;
  onEnded?: () => void;
  radius?: number;
}) {
  if (typeof document === 'undefined') return null;
  return React.createElement('video', {
    src: uri,
    poster,
    autoPlay: true,
    muted: true,
    loop,
    playsInline: true,
    onEnded,
    // React 가 muted 를 속성으로 안 걸어주는 경우가 있어 ref 로 확실히 건다.
    ref: (el: any) => {
      if (el) el.muted = true;
    },
    style: {
      width: '100%',
      height: '100%',
      objectFit: cover ? 'cover' : 'contain',
      borderRadius: radius,
      display: 'block',
      background: '#000',
    },
  });
}
