import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Modal, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { APP_WIDTH, colors, radius, spacing } from '@/theme';

const MAX_SCALE = 4;

// 프로필 사진 위치 조정 — 원형 프레임 안에서 사진을 드래그(이동)·핀치/슬라이더로
// 확대해 원하는 부분을 맞춘 뒤, 512px 정사각으로 잘라 data URI로 돌려준다. (웹)
export function AvatarCropper({
  uri,
  onCancel,
  onDone,
}: {
  uri: string;
  onCancel: () => void;
  onDone: (dataUri: string) => void;
}) {
  const FRAME = Math.round(Math.min(APP_WIDTH - 72, 300));
  const TRACK = FRAME - 56;

  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const natRef = useRef<{ w: number; h: number } | null>(null);
  const elRef = useRef<any>(null);
  const t = useRef({ scale: 1, tx: 0, ty: 0 });
  const startRef = useRef({ tx: 0, ty: 0, scale: 1, dist: 0 });
  const [, force] = useReducer((c) => c + 1, 0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = new (window as any).Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      const n = { w: el.naturalWidth || el.width, h: el.naturalHeight || el.height };
      elRef.current = el;
      natRef.current = n;
      setNat(n);
    };
    el.src = uri;
  }, [uri]);

  const clampT = () => {
    const n = natRef.current;
    if (!n) return;
    const ds = (FRAME / Math.min(n.w, n.h)) * t.current.scale;
    const maxTx = Math.max(0, (n.w * ds - FRAME) / 2);
    const maxTy = Math.max(0, (n.h * ds - FRAME) / 2);
    t.current.tx = Math.max(-maxTx, Math.min(maxTx, t.current.tx));
    t.current.ty = Math.max(-maxTy, Math.min(maxTy, t.current.ty));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startRef.current = { ...t.current, dist: 0 };
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.hypot(dx, dy) || 1;
          if (startRef.current.dist === 0) startRef.current.dist = dist;
          t.current.scale = Math.max(1, Math.min(MAX_SCALE, (startRef.current.scale * dist) / startRef.current.dist));
        } else {
          t.current.tx = startRef.current.tx + g.dx;
          t.current.ty = startRef.current.ty + g.dy;
        }
        clampT();
        force();
      },
      onPanResponderRelease: () => {
        startRef.current.dist = 0;
      },
      onPanResponderTerminate: () => {
        startRef.current.dist = 0;
      },
    })
  ).current;

  const setScaleFromX = (x: number) => {
    const ratio = Math.max(0, Math.min(1, x / TRACK));
    t.current.scale = 1 + ratio * (MAX_SCALE - 1);
    clampT();
    force();
  };
  const slider = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setScaleFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setScaleFromX(e.nativeEvent.locationX),
    })
  ).current;

  const n = nat;
  const ds = n ? (FRAME / Math.min(n.w, n.h)) * t.current.scale : 1;
  const imgW = n ? n.w * ds : FRAME;
  const imgH = n ? n.h * ds : FRAME;
  const knob = ((t.current.scale - 1) / (MAX_SCALE - 1)) * TRACK;

  const done = () => {
    const el = elRef.current;
    const nn = natRef.current;
    if (!el || !nn || typeof document === 'undefined') {
      onDone(uri);
      return;
    }
    const OUT = 512;
    const d = (FRAME / Math.min(nn.w, nn.h)) * t.current.scale;
    const crop = FRAME / d;
    const sx0 = nn.w / 2 - (FRAME / 2 + t.current.tx) / d;
    const sy0 = nn.h / 2 - (FRAME / 2 + t.current.ty) / d;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return onDone(uri);
      ctx.drawImage(el, sx0, sy0, crop, crop, 0, 0, OUT, OUT);
      onDone(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      onDone(uri);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>사진 위치 조정</Text>
          <Text style={styles.sub}>드래그로 이동 · 확대해서 원하는 부분을 맞춰요</Text>

          <View
            style={[styles.frame, { width: FRAME, height: FRAME, borderRadius: FRAME / 2 }]}
            {...pan.panHandlers}
          >
            {n && (
              <Image
                source={{ uri }}
                pointerEvents="none"
                contentFit="fill"
                style={{
                  position: 'absolute',
                  width: imgW,
                  height: imgH,
                  left: FRAME / 2 - imgW / 2 + t.current.tx,
                  top: FRAME / 2 - imgH / 2 + t.current.ty,
                }}
              />
            )}
            <View
              pointerEvents="none"
              style={[styles.ring, { width: FRAME, height: FRAME, borderRadius: FRAME / 2 }]}
            />
          </View>

          {/* zoom slider */}
          <View style={styles.zoomRow}>
            <Ionicons name="remove" size={16} color={colors.textTertiary} />
            <View style={[styles.track, { width: TRACK }]} {...slider.panHandlers}>
              <View style={styles.trackFill} />
              <View style={[styles.knob, { left: Math.max(0, Math.min(TRACK - 20, knob - 10)) }]} />
            </View>
            <Ionicons name="add" size={20} color={colors.textTertiary} />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancel} onPress={onCancel} activeOpacity={0.85}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.done} onPress={done} activeOpacity={0.9}>
              <Text style={styles.doneText}>적용</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,12,20,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.textPrimary },
  sub: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  frame: {
    overflow: 'hidden',
    backgroundColor: '#111',
    ...({ touchAction: 'none', cursor: 'grab' } as object),
  },
  ring: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  track: {
    height: 24,
    justifyContent: 'center',
    ...({ touchAction: 'none', cursor: 'pointer' } as object),
  },
  trackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
  },
  knob: {
    position: 'absolute',
    top: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: '#fff',
    ...({ boxShadow: '0 1px 4px rgba(0,0,0,0.3)' } as object),
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
    width: '100%',
  },
  cancel: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '800', color: colors.textSecondary },
  done: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { fontSize: 15, fontWeight: '800', color: colors.white },
});
