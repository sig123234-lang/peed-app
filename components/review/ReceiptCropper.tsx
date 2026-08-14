import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/kit';
import { colors, radius, spacing } from '@/theme';

// 촬영 가이드 프레임 — 사진에서 영수증만 남길 사각형을 회원이 직접 잡는다.
//
// 왜 필요한가. 판독 품질을 가르는 것은 화질이 아니라 **영수증이 프레임을 얼마나
// 채우는가** 였다. 실측(2026-08-14, 같은 영수증 같은 사진):
//   · 통째로 올림 → 23.8초, 주소 못 읽음, 중복키 못 만듦
//   · 이 화면으로 잡아서 올림 → 17.3초, 사업자등록번호·주소·승인번호 모두 읽음
// 주소를 읽어야 '고른 매장이 맞는지' 를 대조할 수 있으므로, 이 화면은 속도만이 아니라
// 인증의 성패를 가른다.
//
// 자르기는 여기서 하지 않는다. 사각형만 0..1 비율로 서버에 보내고, 실제로는 서버가
// 원본에서 잘라낸다. 화면에 보이는 축소본에서 자르면 그만큼 잃고, 브라우저에서 자르면
// EXIF(촬영 시각·위치)가 함께 날아가 두 번째 증거를 잃는다.

export type CropBox = { x: number; y: number; w: number; h: number };

/** 한 변의 최소 비율. 너무 좁게 잡으면 글자가 통째로 날아간다(서버도 같은 값으로 거른다). */
const MIN_SIDE = 0.2;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ReceiptCropper({
  uri,
  onConfirm,
  onSkip,
}: {
  uri: string;
  onConfirm: (box: CropBox) => void;
  onSkip: () => void;
}) {
  // 사진의 가로세로비. 틀을 사진과 똑같은 비율로 두면 화면 좌표가 사진 좌표에
  // 그대로 대응해서, 여백 계산 없이 비율을 뽑을 수 있다.
  const [ratio, setRatio] = useState(3 / 4);
  const [frameW, setFrameW] = useState(0);
  // 세로로 긴 영수증을 염두에 둔 첫 위치. 대개 여기서 모서리만 조금 당기면 된다.
  const [box, setBox] = useState<CropBox>({ x: 0.14, y: 0.07, w: 0.72, h: 0.86 });

  const boxRef = useRef(box);
  boxRef.current = box;
  const startRef = useRef(box);

  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (alive && w && h) setRatio(w / h);
      },
      () => {
        // 크기를 못 읽으면 기본 비율로 둔다 — 사각형을 잡는 데는 지장이 없다.
      }
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  const frameH = frameW ? frameW / ratio : 0;

  const responders = useMemo(() => {
    const begin = () => {
      startRef.current = boxRef.current;
    };

    /** 네 모서리 — 잡은 쪽만 움직이고 반대쪽은 고정된다. */
    const corner = (fromLeft: boolean, fromTop: boolean) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: begin,
        onPanResponderMove: (_e, g) => {
          if (!frameW || !frameH) return;
          const s = startRef.current;
          const dx = g.dx / frameW;
          const dy = g.dy / frameH;
          let { x, y, w, h } = s;
          if (fromLeft) {
            x = clamp(s.x + dx, 0, s.x + s.w - MIN_SIDE);
            w = s.x + s.w - x;
          } else {
            w = clamp(s.w + dx, MIN_SIDE, 1 - s.x);
          }
          if (fromTop) {
            y = clamp(s.y + dy, 0, s.y + s.h - MIN_SIDE);
            h = s.y + s.h - y;
          } else {
            h = clamp(s.h + dy, MIN_SIDE, 1 - s.y);
          }
          setBox({ x, y, w, h });
        },
      });

    /** 안쪽을 끌면 크기는 그대로 두고 통째로 옮긴다. */
    const move = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: begin,
      onPanResponderMove: (_e, g) => {
        if (!frameW || !frameH) return;
        const s = startRef.current;
        setBox({
          x: clamp(s.x + g.dx / frameW, 0, 1 - s.w),
          y: clamp(s.y + g.dy / frameH, 0, 1 - s.h),
          w: s.w,
          h: s.h,
        });
      },
    });

    return {
      move,
      tl: corner(true, true),
      tr: corner(false, true),
      bl: corner(true, false),
      br: corner(false, false),
    };
  }, [frameW, frameH]);

  const px = {
    left: box.x * frameW,
    top: box.y * frameH,
    width: box.w * frameW,
    height: box.h * frameH,
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.guide}>영수증만 사각형 안에 들어오게 맞춰주세요</Text>

      <View
        style={styles.stage}
        onLayout={(e) => setFrameW(e.nativeEvent.layout.width)}
      >
        {frameH > 0 && (
          <View style={{ width: '100%', height: frameH }}>
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />

            {/* 바깥을 덮어 어둡게 — 어디가 읽히는지 한눈에 보이게 한다. */}
            <View style={[styles.shade, { left: 0, right: 0, top: 0, height: px.top }]} />
            <View
              style={[
                styles.shade,
                { left: 0, right: 0, top: px.top + px.height, bottom: 0 },
              ]}
            />
            <View
              style={[
                styles.shade,
                { left: 0, top: px.top, width: px.left, height: px.height },
              ]}
            />
            <View
              style={[
                styles.shade,
                {
                  left: px.left + px.width,
                  right: 0,
                  top: px.top,
                  height: px.height,
                },
              ]}
            />

            <View style={[styles.box, px]} {...responders.move.panHandlers}>
              <View style={[styles.handle, styles.tl]} {...responders.tl.panHandlers} />
              <View style={[styles.handle, styles.tr]} {...responders.tr.panHandlers} />
              <View style={[styles.handle, styles.bl]} {...responders.bl.panHandlers} />
              <View style={[styles.handle, styles.br]} {...responders.br.panHandlers} />
            </View>
          </View>
        )}
      </View>

      <View style={styles.buttons}>
        <AppButton label="전체 사진 그대로" variant="ghost" onPress={onSkip} style={{ flex: 1 }} />
        <AppButton
          label="이 영역으로 인증"
          variant="gradient"
          onPress={() => onConfirm(box)}
          style={{ flex: 1.4 }}
        />
      </View>
    </View>
  );
}

const HANDLE = 28;

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, gap: spacing.md },
  guide: { fontSize: 12.5, color: colors.textSecondary, textAlign: 'center' },
  stage: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.textPrimary,
  },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.white,
    // 모서리 손잡이가 틀 밖으로 나가도 눌리게 둔다.
    ...({ boxShadow: '0 0 0 9999px rgba(0,0,0,0)' } as object),
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tl: { left: -2, top: -2, borderLeftWidth: 5, borderTopWidth: 5 },
  tr: { right: -2, top: -2, borderRightWidth: 5, borderTopWidth: 5 },
  bl: { left: -2, bottom: -2, borderLeftWidth: 5, borderBottomWidth: 5 },
  br: { right: -2, bottom: -2, borderRightWidth: 5, borderBottomWidth: 5 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
});
