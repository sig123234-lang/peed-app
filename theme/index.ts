// PEED design system — single source of truth for the whole app's look.
// Direction: "Vivid & Playful" — gradient brand, lime + coral pops, rounded,
// energetic. Change a token here and every screen updates.
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

/* ---------------------------------------------------------------- colors */

export const colors = {
  // Brand
  primary: '#4F6BFF',
  primaryDeep: '#6C5CE7',
  primarySoft: '#EEF2FF',
  primaryPressed: '#3F57E0',

  // Playful accents
  lime: '#C6F432',
  limeInk: '#38460A', // legible text on lime
  limeSoft: '#F4FBD6',
  coral: '#FF6B6B',
  coralDeep: '#FF5A5A',
  coralSoft: '#FFECEC',

  // Neutrals / text
  ink: '#0F1222',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textOnBrand: '#FFFFFF',

  // Surfaces
  bg: '#FFFFFF',
  surface: '#F7F8FC',
  surfaceAlt: '#EEF1F8',
  card: '#FFFFFF',
  paper: '#FFFDF7', // warm thermal-receipt paper
  paperInk: '#2A2A28', // near-black receipt ink
  line: '#ECEEF3',
  lineStrong: '#DDE1EA',

  // Semantic
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(15, 18, 34, 0.45)',
} as const;

/** Gradient stop arrays (use with expo-linear-gradient `colors`). */
export const gradients = {
  brand: ['#6C5CE7', '#4F6BFF'] as const,
  brandDiagonal: ['#7C5CFF', '#4F6BFF'] as const,
  hot: ['#FF7A7A', '#FF5A5A'] as const,
  lime: ['#D6FA55', '#B7EC1F'] as const,
  dusk: ['#6C5CE7', '#4F6BFF', '#00C2FF'] as const,
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
      boxShadow: `0px ${y}px ${blur}px rgba(20, 24, 60, ${opacity})`,
    } as unknown as ViewStyle,
    default: {
      shadowColor: '#141A3C',
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
