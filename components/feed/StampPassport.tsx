import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RegionPicker } from '@/components/feed/RegionPicker';
import { useFeed } from '@/context/feed';
import { colors, radius, spacing } from '@/theme';

// 도장 패스포트 — 지역을 하나 고르고, 그 지역의 서로 다른 매장에 리뷰를 남길
// 때마다 도장이 하나씩 찍힌다. 다 채우면 보너스 PB 를 받고 지역이 다시 열린다.
//
// 예전에는 마포구 동네 7곳이 고정으로 박혀 있어 다른 지역 사람은 쓸 수 없었다.
// 이제 전국 시·군·구에서 직접 고른다.

const SEAL_RED = '#E23B3B';

export function StampPassport({
  onOpenReview,
  picking,
  setPicking,
}: {
  onOpenReview: () => void;
  /** 지역 선택창 열림 여부 — 바깥의 '도장' 칩에서도 열 수 있어야 해서 위로 뺐다. */
  picking: boolean;
  setPicking: (v: boolean) => void;
}) {
  const { passport, passportGoal, passportReward, pickRegion } = useFeed();

  const done = passport.stores.length;
  const slots = Array.from({ length: passportGoal }, (_, i) => i < done);
  const picked = !!passport.region;

  const choose = async (key: string) => {
    setPicking(false);
    await pickRegion(key);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🗺️ 도장깨기</Text>
        {picked ? (
          <Text style={styles.count}>
            {done}/{passportGoal} 도장
          </Text>
        ) : null}
      </View>

      {picked ? (
        <View style={styles.board}>
          {/* 한번 고른 지역은 완주할 때까지 바꿀 수 없다(고정). */}
          <View style={styles.regionRow}>
            <Text style={styles.regionName}>{passport.region}</Text>
            <View style={styles.regionLock}>
              <Ionicons name="lock-closed" size={11} color={colors.textTertiary} />
              <Text style={styles.regionChange}>완주까지 고정</Text>
            </View>
          </View>

          <View style={styles.seals}>
            {slots.map((filled, i) => (
              <View key={i} style={[styles.seal, filled ? styles.sealOn : styles.sealOff]}>
                {filled ? (
                  <Text style={styles.sealMark}>認</Text>
                ) : (
                  <Text style={styles.sealNum}>{i + 1}</Text>
                )}
              </View>
            ))}
          </View>

          <Text style={styles.hint}>
            {done === 0
              ? `${passport.region} 매장에 리뷰를 남기면 도장이 찍혀요`
              : `${Math.max(0, passportGoal - done)}곳 더 다녀오면 +${passportReward} PB`}
          </Text>

          <TouchableOpacity style={styles.cta} onPress={onOpenReview} activeOpacity={0.85}>
            <Text style={styles.ctaText}>리뷰 쓰고 도장 받기</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.empty}
          onPress={() => setPicking(true)}
          activeOpacity={0.85}
        >
          <View style={styles.emptyCircle}>
            <Text style={styles.emptyPlus}>＋</Text>
          </View>
          <Text style={styles.emptyTitle}>
            {passport.completed > 0 ? '다음 지역을 골라보세요' : '지역을 골라보세요'}
          </Text>
          <Text style={styles.emptySub}>
            고른 지역의 매장 {passportGoal}곳에 리뷰를 남기면 +{passportReward} PB
          </Text>
          {passport.completed > 0 ? (
            <Text style={styles.emptyDone}>지금까지 {passport.completed}개 지역 완주 🎉</Text>
          ) : null}
        </TouchableOpacity>
      )}

      {picking ? (
        <RegionPicker
          current={passport.region}
          hasProgress={done > 0}
          onPick={choose}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  count: { fontSize: 13, fontWeight: '800', color: colors.coralDeep },

  board: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  regionName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  regionLock: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  regionChange: { fontSize: 12.5, fontWeight: '700', color: colors.textTertiary },

  seals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  seal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  sealOn: {
    borderColor: SEAL_RED,
    backgroundColor: 'rgba(253,236,236,0.92)',
    transform: [{ rotate: '-12deg' }],
  },
  sealOff: {
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceAlt,
  },
  sealMark: { color: SEAL_RED, fontSize: 16, fontWeight: '800' },
  sealNum: { color: colors.textTertiary, fontSize: 13, fontWeight: '800' },

  hint: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

  cta: {
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontSize: 14, fontWeight: '800', color: colors.white },

  empty: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },
  emptyCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyPlus: { fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: -2 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: colors.textPrimary },
  emptySub: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  emptyDone: { fontSize: 12.5, fontWeight: '800', color: colors.coralDeep, marginTop: 2 },
});
