// PEED UI kit — the reusable building blocks every screen composes from.
// All visuals come from the design tokens in `@/theme`, so the whole app stays
// consistent and re-skinnable from one place.
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {
  Edge,
  SafeAreaView,
} from 'react-native-safe-area-context';

import { colors, gradients, radius, shadow, spacing, type } from '@/theme';

/* ---------------------------------------------------------------- Screen */

export function Screen({
  children,
  style,
  edges = ['top', 'bottom'],
  background = colors.surface,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
  background?: string;
}) {
  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: background }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

/* ----------------------------------------------------------------- Card */

export function Card({
  children,
  style,
  padded = true,
  elevated = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        padded && { padding: spacing.lg },
        elevated ? shadow.card : shadow.none,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------- Badge */

type BadgeVariant = 'brand' | 'lime' | 'coral' | 'neutral' | 'solid';

const badgeColors: Record<BadgeVariant, { bg: string; fg: string }> = {
  brand: { bg: colors.primarySoft, fg: colors.primary },
  lime: { bg: colors.limeSoft, fg: colors.limeInk },
  coral: { bg: colors.coralSoft, fg: colors.coralDeep },
  neutral: { bg: colors.surfaceAlt, fg: colors.textSecondary },
  solid: { bg: colors.primary, fg: colors.white },
};

export function Badge({
  label,
  variant = 'brand',
  style,
}: {
  label: string;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const c = badgeColors[variant];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

/* -------------------------------------------------------------- AppButton */

type ButtonVariant =
  | 'primary'
  | 'gradient'
  | 'coral'
  | 'lime'
  | 'outline'
  | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const sizeMap: Record<ButtonSize, { h: number; fs: number; px: number }> = {
  sm: { h: 42, fs: 14, px: spacing.lg },
  md: { h: 52, fs: 16, px: spacing.xl },
  lg: { h: 58, fs: 17, px: spacing['2xl'] },
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  full = false,
  style,
  textStyle,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const s = sizeMap[size];
  const solidColor =
    variant === 'coral'
      ? colors.coral
      : variant === 'lime'
        ? colors.lime
        : colors.primary;
  const fg =
    variant === 'lime'
      ? colors.limeInk
      : variant === 'outline'
        ? colors.primary
        : variant === 'ghost'
          ? colors.textSecondary
          : colors.white;

  const base: ViewStyle = {
    height: s.h,
    paddingHorizontal: s.px,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...(full ? { flex: 1 } : {}),
    ...(disabled ? { opacity: 0.5 } : {}),
  };

  const content = (
    <Text style={[{ fontSize: s.fs, fontWeight: '800', color: fg }, textStyle]}>
      {label}
    </Text>
  );

  const inner = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    content
  );

  if (variant === 'gradient') {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={disabled || loading}
        style={[full ? { flex: 1 } : undefined, style]}
      >
        <LinearGradient
          colors={gradients.brandDiagonal}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[base, disabled ? {} : shadow.soft]}
        >
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle: ViewStyle =
    variant === 'outline'
      ? { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary }
      : variant === 'ghost'
        ? { backgroundColor: colors.surfaceAlt }
        : { backgroundColor: solidColor, ...(disabled ? {} : shadow.soft) };

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled || loading}
      style={[base, variantStyle, style]}
    >
      {inner}
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------ GradientHeader */

export function GradientHeader({
  children,
  style,
  variant = 'brand',
  rounded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: keyof typeof gradients;
  rounded?: boolean;
}) {
  return (
    <LinearGradient
      colors={gradients[variant]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        rounded && { borderRadius: radius.xl },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

/* ------------------------------------------------------------- ProgressBar */

export function ProgressBar({
  value,
  height = 8,
  track = colors.surfaceAlt,
  fill = colors.lime,
  style,
}: {
  value: number; // 0..1
  height?: number;
  track?: string;
  fill?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      style={[
        { height, backgroundColor: track, borderRadius: radius.pill, overflow: 'hidden' },
        style,
      ]}
    >
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: fill,
          borderRadius: radius.pill,
        }}
      />
    </View>
  );
}

/* ----------------------------------------------------------------- styles */

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  badgeText: {
    ...type.badge,
  },
});
