import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BlurBackdrop } from '@/components/ui/BlurBackdrop';
import { REGIONS, SIDO_LIST, regionKey } from '@/data/regions';
import { APP_WIDTH, colors, radius, shadow, spacing } from '@/theme';

// 지역 고르기 — 전국 시·군·구 252곳. 목록이 길어서 시도 탭 + 검색을 같이 둔다.
// 검색은 시도명으로도 걸리게 해서 "경기" 만 쳐도 경기도 전체가 나온다.
export function RegionPicker({
  current,
  hasProgress,
  onPick,
  onClose,
}: {
  current: string;
  hasProgress: boolean;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const [sido, setSido] = useState(SIDO_LIST[0]);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState('');

  const list = useMemo(() => {
    const query = q.trim();
    if (query) {
      return REGIONS.filter(
        (r) => r.name.includes(query) || r.sido.includes(query)
      ).slice(0, 120);
    }
    return REGIONS.filter((r) => r.sido === sido);
  }, [q, sido]);

  // 도장을 이미 모은 상태에서 다른 지역으로 바꾸면 처음부터 다시 모아야 한다.
  const choose = (key: string) => {
    if (key === current) return onClose();
    if (hasProgress) return setConfirm(key);
    onPick(key);
  };

  if (confirm) {
    return (
      <BlurBackdrop onPress={() => setConfirm('')}>
        <View style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>지역을 바꿀까요?</Text>
          <Text style={styles.confirmBody}>
            지금까지 모은 도장은 사라지고{'\n'}
            <Text style={styles.confirmStrong}>{confirm}</Text> 에서 처음부터 모아요.
          </Text>
          <View style={styles.confirmRow}>
            <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirm('')}>
              <Text style={styles.confirmCancelText}>그대로 둘래요</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmOk} onPress={() => onPick(confirm)}>
              <Text style={styles.confirmOkText}>바꿀래요</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurBackdrop>
    );
  }

  return (
    <BlurBackdrop onPress={onClose}>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.title}>어느 지역을 돌아볼까요?</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sub}>고른 지역의 매장 5곳에 리뷰를 남기면 보너스 PB를 받아요.</Text>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="지역 검색 (예: 마포, 고양, 경기)"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {!q ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.sidoRow}
            contentContainerStyle={styles.sidoRowContent}
          >
            {SIDO_LIST.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setSido(s)}
                style={[styles.sidoChip, s === sido && styles.sidoChipOn]}
              >
                <Text style={[styles.sidoText, s === sido && styles.sidoTextOn]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {list.map((r) => {
            const key = regionKey(r);
            const on = key === current;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.row, on && styles.rowOn]}
                onPress={() => choose(key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.rowName, on && styles.rowNameOn]}>{r.name}</Text>
                <Text style={styles.rowSido}>{r.sido}</Text>
                {on ? <Ionicons name="checkmark" size={17} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
          {list.length === 0 ? (
            <Text style={styles.empty}>그런 지역은 못 찾았어요</Text>
          ) : null}
        </ScrollView>
      </View>
    </BlurBackdrop>
  );
}

const styles = StyleSheet.create({
  card: {
    width: Math.min(APP_WIDTH - spacing.lg * 2, 460),
    maxHeight: 520,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lifted,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 19, fontWeight: '800', color: colors.textPrimary },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },

  sidoRow: { marginBottom: spacing.sm, flexGrow: 0 },
  sidoRowContent: { gap: 6, paddingVertical: 2 },
  sidoChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  sidoChipOn: { backgroundColor: colors.primarySoft },
  sidoText: { fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },
  sidoTextOn: { color: colors.primary },

  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowOn: { backgroundColor: colors.primarySoft },
  rowName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.textPrimary },
  rowNameOn: { color: colors.primary, fontWeight: '800' },
  rowSido: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  confirmCard: {
    width: Math.min(APP_WIDTH - spacing.lg * 2, 360),
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.lifted,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  confirmBody: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  confirmStrong: { color: colors.textPrimary, fontWeight: '800' },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
  confirmCancel: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: { fontSize: 14, fontWeight: '800', color: colors.textSecondary },
  confirmOk: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmOkText: { fontSize: 14, fontWeight: '800', color: colors.white },
});
