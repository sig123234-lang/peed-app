// Shared decoration presets for the Bite composer + viewer, so a story looks
// identical when created and when played back.

// Filters are simple tint overlays (cross-platform; no native filter needed).
export type BiteFilter = { key: string; label: string; color: string; opacity: number };

export const BITE_FILTERS: BiteFilter[] = [
  { key: 'none', label: '원본', color: 'transparent', opacity: 0 },
  { key: 'warm', label: '따뜻', color: '#FF8A3D', opacity: 0.2 },
  { key: 'cool', label: '시원', color: '#3D7BFF', opacity: 0.2 },
  { key: 'film', label: '필름', color: '#C08A2A', opacity: 0.22 },
  { key: 'rose', label: '로즈', color: '#FF6B9A', opacity: 0.2 },
  { key: 'dim', label: '무드', color: '#0A0A16', opacity: 0.34 },
];

export function filterFor(key?: string): BiteFilter {
  return BITE_FILTERS.find((f) => f.key === key) ?? BITE_FILTERS[0];
}

// 스토리 배경 — 사진 뒤에 깔리고, 사진이 없으면 그 자체가 화면이 된다.
// 두 색이 같으면 단색으로 보인다(그라디언트 컴포넌트 하나로 둘 다 그린다).
//
// 앞쪽은 그라디언트, 뒤쪽은 단색. 사진을 얹을 땐 배경이 튀지 않는 단색이 사진을
// 살려주고, 글만 있는 스토리엔 그라디언트가 허전하지 않다.
const solid = (c: string): string[] => [c, c];

export const BITE_BACKGROUNDS: string[][] = [
  ['#6C5CE7', '#4F6BFF'],
  ['#FF7A7A', '#FF5A5A'],
  ['#D6FA55', '#B7EC1F'],
  ['#00C2FF', '#4F6BFF'],
  ['#FF8AC2', '#FF6B6B'],
  ['#12141C', '#3A3F52'],
  solid('#FFFFFF'),
  solid('#F2F3F7'),
  solid('#111318'),
  solid('#4F6BFF'),
  solid('#FF5A5A'),
  solid('#FFB020'),
  solid('#22C55E'),
  solid('#C6F432'),
  solid('#FF8AC2'),
  solid('#6C5CE7'),
];

export const TEXT_COLORS = [
  '#FFFFFF',
  '#111111',
  '#FF6B6B',
  '#4F6BFF',
  '#C6F432',
  '#FFD43B',
  '#FF8AC2',
  '#22C55E',
];

export const STICKERS = [
  '🍜', '🍣', '🍕', '🍺', '🍶', '🔥',
  '😋', '❤️', '⭐', '✨', '📍', '👍',
  '🥂', '🍰', '☕', '🌶️', '🎉', '💯',
];

// 텍스트 폰트 — 웹에서 CDN 없이 쓰는 시스템 폰트 스택 (인스타 폰트 전환 느낌).
export type BiteFont = { key: string; label: string; family?: string; weight: string };
export const BITE_FONTS: BiteFont[] = [
  { key: 'classic', label: '기본', family: undefined, weight: '800' },
  { key: 'rounded', label: '라운드', family: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif', weight: '900' },
  { key: 'serif', label: '세리프', family: 'Georgia, "Times New Roman", serif', weight: '700' },
  { key: 'mono', label: '타자기', family: 'ui-monospace, "SFMono-Regular", Menlo, monospace', weight: '700' },
];
export function fontFor(key?: string): BiteFont {
  return BITE_FONTS.find((f) => f.key === key) ?? BITE_FONTS[0];
}

// 하이라이트 배경 위 글자색 — 배경 밝기에 따라 검정/흰색.
export function contrastText(hex?: string): string {
  if (!hex) return '#111111';
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#FFFFFF';
}
