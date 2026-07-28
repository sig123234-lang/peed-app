// PEED design system — single source of truth for the whole app's look.
// Direction: "Warm & Vivid" — 크림빛 바탕 위에 보라·코랄·귤·라임이 도는 팔레트.
// 예전에는 흰 바탕 + 파란색 한 가지라 화면이 차갑고 밋밋했다. 중립색을 따뜻한
// 쪽으로 옮기고 강조색을 늘려서, 같은 레이아웃이어도 색이 살아나게 했다.
// 토큰 하나를 바꾸면 모든 화면이 따라온다.
import { Dimensions, Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * On desktop web the app renders as a centered phone-width column (Instagram
 * style). APP_WIDTH is the effective content width — clamped to APP_MAX_WIDTH —
 * so width-based layouts (cards, grids) fit inside the column instead of
 * stretching across the whole browser.
 */
export const APP_MAX_WIDTH = 680;
export const APP_WIDTH = Math.min(
  Dimensions.get('window').width,
  APP_MAX_WIDTH
);

/**
 * 데스크탑 3단 레이아웃의 양쪽 기둥 폭. 가운데 칼럼 폭과 본문 기준선을 계산할
 * 때 필요해서(예: 메시지 패널을 피드와 같은 세로선에 맞추기) 토큰으로 뺐다.
 * 각 컴포넌트가 따로 숫자를 들고 있으면 한쪽만 바뀌었을 때 기준선이 어긋난다.
 */
export const SIDEBAR_WIDTH = 236;
export const RAIL_WIDTH = 320;

/* ---------------------------------------------------------------- colors */

export const colors = {
  // Brand — 파랑 한 가지에서 보라기가 도는 인디고로. 같은 밝기에서 채도가 높아
  // 크림 바탕 위에 올렸을 때 훨씬 또렷하다.
  primary: '#5B4DF5',
  primaryDeep: '#7B3FF2',
  primarySoft: '#EFECFF',
  primaryPressed: '#4A3DDD',

  // Playful accents — 강조색을 넷으로 늘려 화면마다 다른 색을 쓸 수 있게 했다.
  lime: '#C6F432',
  limeInk: '#38460A', // legible text on lime
  limeSoft: '#F3FBD3',
  coral: '#FF5F6D',
  coralDeep: '#F0424F',
  coralSoft: '#FFECEE',
  tangerine: '#FF8A3D', // 적립·리워드
  tangerineSoft: '#FFF0E4',
  grape: '#9B5DE5', // 게임·이벤트
  grapeSoft: '#F5EBFF',
  teal: '#0FB5A6', // 지도·매장
  tealSoft: '#E2F7F4',

  // Neutrals / text — 회색을 살짝 따뜻한(자줏빛 도는) 축으로 옮겼다.
  ink: '#1B1526',
  textPrimary: '#241D32',
  textSecondary: '#6C6480',
  textTertiary: '#A49CB4',
  textOnBrand: '#FFFFFF',

  // Surfaces — 순백 대신 크림. 카드만 흰색으로 남겨 대비를 준다.
  bg: '#FFFCF7',
  surface: '#F8F4EE',
  surfaceAlt: '#F0EAE1',
  card: '#FFFFFF',
  // 영수증 종이. 크림빛(#FFFDF7)이었는데 실물 영수증은 흰 종이라 흰색으로 맞췄다.
  // card 와 값은 같지만 뜻이 달라(카드 표면 / 영수증 지면) 토큰은 따로 둔다.
  paper: '#FFFFFF',
  paperInk: '#2A2A28', // near-black receipt ink
  line: '#EFE8DF',
  lineStrong: '#DFD6C9',

  // Semantic
  success: '#17B26A',
  warning: '#F5A623',
  danger: '#EF4444',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(27, 21, 38, 0.45)',
} as const;

/** Gradient stop arrays (use with expo-linear-gradient `colors`). */
export const gradients = {
  brand: ['#7B3FF2', '#5B4DF5'] as const,
  brandDiagonal: ['#8B5CF6', '#5B4DF5'] as const,
  hot: ['#FF8A3D', '#FF5F6D'] as const,
  lime: ['#D6FA55', '#A8DE12'] as const,
  // 보라 → 파랑 → 청록. 온보딩·히어로처럼 큰 면적에 쓰면 색이 흐른다.
  dusk: ['#8B5CF6', '#5B4DF5', '#12A9E0'] as const,
  sunset: ['#FFB13D', '#FF5F6D', '#E0409B'] as const,
  teal: ['#22D3C5', '#0FB5A6'] as const,
  grape: ['#B57BFF', '#7B3FF2'] as const,
} as const;

/* ------------------------------------------------------------- spacing */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

/* -------------------------------------------------------------- radius */

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  '2xl': 32,
  pill: 999,
} as const;

/* ------------------------------------------------------------ typography */

export const type = {
  display: { fontSize: 38, lineHeight: 46, fontWeight: '800' },
  h1: { fontSize: 30, lineHeight: 38, fontWeight: '800' },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  bodyLg: { fontSize: 17, lineHeight: 26, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  badge: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
} satisfies Record<string, TextStyle>;

/* --------------------------------------------------------------- shadows */

const shadowFor = (
  y: number,
  blur: number,
  opacity: number,
  elevation: number
): ViewStyle =>
  Platform.select({
    web: {
      // react-native-web maps boxShadow through style; keep it subtle.
      // 그림자도 따뜻한 축으로 — 크림 바탕에 차가운 회색 그림자가 지면 탁해 보인다.
      boxShadow: `0px ${y}px ${blur}px rgba(58, 40, 30, ${opacity})`,
    } as unknown as ViewStyle,
    default: {
      shadowColor: '#3A281E',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
      elevation,
    },
  }) as ViewStyle;

export const shadow = {
  none: {} as ViewStyle,
  soft: shadowFor(6, 18, 0.08, 3),
  card: shadowFor(10, 28, 0.1, 5),
  lifted: shadowFor(16, 40, 0.14, 10),
} as const;

/** Fixed-width font stack — the signature of a printed receipt. */
export const mono = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'monospace',
}) as string;

export const theme = { colors, gradients, spacing, radius, type, shadow, mono };
export type Theme = typeof theme;
