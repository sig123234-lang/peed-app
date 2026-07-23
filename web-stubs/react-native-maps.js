// Web stub for `react-native-maps` (a native-only library).
// On web the real package crashes the bundle because it imports React Native
// internals. This lightweight replacement renders a placeholder so the rest of
// the app is browsable in a browser. Native builds are unaffected — Metro only
// swaps to this file when platform === 'web' (see metro.config.js).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const Marker = ({ children }) => <>{children ?? null}</>;
export const Callout = ({ children }) => <>{children ?? null}</>;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;
// `Region` is a TypeScript type in the real lib; export a runtime placeholder
// so a value-position import doesn't blow up on web.
export const Region = undefined;

const MapView = React.forwardRef(function MapView({ style, children }, ref) {
  React.useImperativeHandle(
    ref,
    () => ({
      animateToRegion: () => {},
      animateCamera: () => {},
      fitToCoordinates: () => {},
    }),
    []
  );
  return (
    <View style={[styles.map, style]}>
      <Text style={styles.label}>🗺️ 지도는 네이티브 앱에서만 표시됩니다 (웹 미리보기)</Text>
      {children}
    </View>
  );
});

export default MapView;

const styles = StyleSheet.create({
  map: {
    flex: 1,
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  label: {
    position: 'absolute',
    top: 16,
    color: '#6b7280',
    fontSize: 13,
  },
});
