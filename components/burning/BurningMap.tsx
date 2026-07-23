import { StyleSheet, Text, View } from 'react-native';

import { MapMarker } from '@/data/stores';
import { colors, radius } from '@/theme';

// Native placeholder. The interactive map (BurningMap.web.tsx) runs on web; a
// real native map can be wired up in a native build later.
export type MapBounds = { north: number; south: number; east: number; west: number };

export function BurningMap({
  markers,
  height = 200,
}: {
  markers?: MapMarker[];
  zoom?: number;
  height?: number;
  onMarkerPress?: (marker: MapMarker) => void;
  onSearchArea?: (bounds: MapBounds) => void;
}) {
  const label =
    markers && markers.length === 1
      ? markers[0].name
      : markers && markers.length > 1
        ? `등록 매장 ${markers.length}곳`
        : '지도는 앱에서 표시돼요';
  return (
    <View style={[styles.map, { height }]}>
      <Text style={styles.emoji}>🗺️</Text>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 200,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emoji: { fontSize: 36 },
  text: { color: colors.textSecondary, fontWeight: '700' },
});
