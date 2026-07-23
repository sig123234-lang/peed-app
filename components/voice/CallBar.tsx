import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useDm } from '@/context/dm';
import { useVoice } from '@/context/voice';
import { APP_MAX_WIDTH, colors, radius, shadow, spacing } from '@/theme';

// 통화 중 상단 바 — 참여자·음소거·나가기. 통화 중일 때만 표시(모든 탭 위에).
export function CallBar() {
  const { activeConvId, connecting, muted, participantIds, toggleMute, leave } = useVoice();
  const { conversations } = useDm();

  if (!activeConvId && !connecting) return null;

  const conv = conversations.find((c) => c.id === activeConvId);
  const title = conv
    ? conv.isGroup
      ? conv.title || conv.others.map((m) => m.name).join(', ') || '그룹'
      : conv.others[0]?.name || '음성 통화'
    : '음성 통화';

  // 참여자 이름(내 포함) — 대화 멤버에서 매칭.
  const nameOf = (id: string) => conv?.members.find((m) => m.id === id)?.name || '나';
  const names = participantIds.map(nameOf);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.dot} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            📞 {title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {connecting && !activeConvId
              ? '연결 중…'
              : names.length > 1
                ? `통화 중 · ${names.length}명`
                : '상대 대기 중…'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, muted && styles.iconBtnOn]}
          onPress={toggleMute}
          activeOpacity={0.85}
        >
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={18} color={muted ? colors.white : colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.leaveBtn} onPress={leave} activeOpacity={0.85}>
          <Ionicons name="call" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: spacing.sm,
    zIndex: 9999,
  },
  bar: {
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingLeft: spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
    ...shadow.lifted,
    ...({ position: 'sticky', top: 8 } as object),
  },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  title: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary, marginTop: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOn: { backgroundColor: colors.textSecondary },
  leaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '135deg' }],
  },
});
