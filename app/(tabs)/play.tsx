import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GameHub } from '@/components/game/GameHub';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';
import PeedScreen from './peed';

// 플레이 허브 — [🎁 경품 | 🎮 게임] 서브탭. 둘 다 "PB를 쓰는 곳".
export default function PlayScreen() {
  const [seg, setSeg] = useState<'prize' | 'game'>('prize');
  return (
    <View style={styles.container}>
      <View style={styles.segWrap}>
        <View style={styles.seg}>
          <TouchableOpacity
            style={[styles.segBtn, seg === 'prize' && styles.segOn]}
            onPress={() => setSeg('prize')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, seg === 'prize' && styles.segTextOn]}>🎁 경품</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segBtn, seg === 'game' && styles.segOn]}
            onPress={() => setSeg('game')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, seg === 'game' && styles.segTextOn]}>🎮 게임</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {seg === 'prize' ? <PeedScreen embedded /> : <GameHub />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  segWrap: { alignItems: 'center', paddingTop: spacing.sm, backgroundColor: colors.surface },
  seg: {
    width: APP_WIDTH - spacing.lg * 2,
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: { backgroundColor: colors.card, ...shadow.soft },
  segText: { fontSize: 14, fontWeight: '700', color: colors.textTertiary },
  segTextOn: { color: colors.primary, fontWeight: '800' },
});
