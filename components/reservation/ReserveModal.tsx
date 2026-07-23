import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppButton } from '@/components/ui/kit';
import { useReservations } from '@/context/reservations';
import { colors, radius, spacing } from '@/theme';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
// 매장에 등록된 예약 시간대가 없으면 기본 슬롯을 제공.
const DEFAULT_SLOTS = ['11:30', '12:30', '13:30', '17:30', '18:30', '19:30', '20:30'];

function nextDays(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dow = DOW[d.getDay()];
    return {
      key: `d${i}`,
      top: i === 0 ? '오늘' : i === 1 ? '내일' : dow,
      sub: `${d.getMonth() + 1}/${d.getDate()}`,
      full: `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`,
    };
  });
}

export function ReserveModal() {
  const { pendingStore: store, closeReserve, book } = useReservations();

  const days = useMemo(() => nextDays(7), []);
  const slots = store && store.times && store.times.length ? store.times : DEFAULT_SLOTS;
  const [dayIdx, setDayIdx] = useState(0);
  const [time, setTime] = useState('');
  const [party, setParty] = useState(2);

  // Reset selection each time a store is opened.
  useEffect(() => {
    if (store) {
      setDayIdx(0);
      setTime((store.times && store.times[0]) || DEFAULT_SLOTS[0]);
      setParty(2);
    }
  }, [store]);

  if (!store) return null;

  const confirm = () => {
    const day = days[dayIdx];
    book({ store, dateLabel: day.full, time, party });
    Alert.alert('예약 완료 🎉', `${store.name}\n${day.full} ${time} · ${party}명 예약이 접수됐어요.`);
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={!!store}
      onRequestClose={closeReserve}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* header */}
          <View style={styles.header}>
            <Image source={store.image} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeMeta}>
                {store.category} · {store.location}
              </Text>
            </View>
            <TouchableOpacity onPress={closeReserve} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* date */}
            <Text style={styles.label}>날짜</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {days.map((d, i) => {
                const active = dayIdx === i;
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => setDayIdx(i)}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                  >
                    <Text style={[styles.dayTop, active && styles.dayTextActive]}>
                      {d.top}
                    </Text>
                    <Text style={[styles.daySub, active && styles.dayTextActive]}>
                      {d.sub}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* time */}
            <Text style={styles.label}>시간</Text>
            <View style={styles.timeWrap}>
              {slots.map((t) => {
                const active = time === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setTime(t)}
                    style={[styles.timeChip, active && styles.timeChipActive]}
                  >
                    <Text style={[styles.timeText, active && styles.timeTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* party */}
            <Text style={styles.label}>인원</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setParty((p) => Math.max(1, p - 1))}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.partyText}>{party}명</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setParty((p) => Math.min(8, p + 1))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>

          <AppButton
            label={`${time || '시간 선택'} · ${party}명 예약 확정`}
            variant="coral"
            onPress={confirm}
            disabled={!time}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing.xl,
    paddingBottom: spacing['2xl'],
    maxHeight: '86%',
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  storeMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  chipRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  dayChip: {
    width: 58,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: colors.primary,
  },
  dayTop: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  daySub: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  dayTextActive: {
    color: colors.white,
  },
  timeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  timeChipActive: {
    backgroundColor: colors.primary,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  timeTextActive: {
    color: colors.white,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
  },
  partyText: {
    minWidth: 56,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  holdBox: {
    marginTop: spacing.xl,
    backgroundColor: colors.limeSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  holdTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.limeInk,
    marginBottom: 4,
  },
  holdDesc: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.limeInk,
    lineHeight: 18,
  },
});
