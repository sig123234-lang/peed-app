import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import { colors } from '@/theme';

// 웹(모바일 크롬 등) 전용 당겨서 새로고침.
// Expo 웹 빌드는 body를 고정하고 스크롤을 내부 FlatList에서 처리하기 때문에
// 브라우저 기본 pull-to-refresh 제스처가 발동하지 않는다. 그래서 문서 레벨
// 터치를 직접 듣고, 스크롤이 맨 위일 때 아래로 당기면 인디케이터를 보여주고
// 임계치를 넘겨 놓으면 새로고침한다. 네이티브/데스크톱(마우스)에선 무동작.
const THRESHOLD = 100; // 이만큼 당기면 새로고침(값↑ = 덜 민감)
const MAX_PULL = 124; // 인디케이터가 내려오는 최대치
const RESISTANCE = 0.45; // 당김 저항(값↓ = 손가락을 더 많이 끌어야 함)

// 특정 화면(예: Bite 풀스크린 편집기)에서 당겨서 새로고침을 잠근다.
// lockPullRefresh() 를 호출하면 잠기고, 반환된 함수를 호출하면 풀린다(카운터 방식).
let pullLocks = 0;
export function lockPullRefresh(): () => void {
  pullLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pullLocks = Math.max(0, pullLocks - 1);
  };
}

function findScroller(el: any): any {
  let node = el as HTMLElement | null;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function PullToRefresh({ onRefresh }: { onRefresh?: () => void }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!('ontouchstart' in window)) return; // 터치 기기에서만

    let startY = 0;
    let startX = 0;
    let active = false; // 이번 제스처가 풀투리프레시 후보인지
    let engaged = false; // 실제로 당기는 중인지(가로 스와이프 배제)
    let scroller: any = null;

    const setPullValue = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const atTop = () => (scroller ? scroller.scrollTop <= 0 : (window.scrollY || 0) <= 0);

    const onStart = (e: TouchEvent) => {
      if (pullLocks > 0 || refreshingRef.current || e.touches.length !== 1) {
        active = false;
        return;
      }
      scroller = findScroller(e.target);
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      active = atTop();
      engaged = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      // 위로 올리거나, 맨 위가 아니면 취소
      if (dy <= 0 || !atTop()) {
        active = false;
        if (engaged) setPullValue(0);
        engaged = false;
        return;
      }
      // 세로 우세 + 어느 정도 끌었을 때만 관여(오작동·가로 스와이프 방해 방지)
      if (!engaged) {
        if (dy < 12) return;
        if (dy <= Math.abs(dx)) {
          active = false;
          return;
        }
        engaged = true;
      }
      e.preventDefault(); // 브라우저 기본 오버스크롤/바운스 대신 우리가 처리
      setPullValue(Math.min(dy * RESISTANCE, MAX_PULL));
    };

    const onEnd = () => {
      if (!engaged) return;
      engaged = false;
      active = false;
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullValue(0);
        const run = onRefresh ?? (() => window.location.reload());
        // 인디케이터가 잠깐 보이도록 살짝 지연
        window.setTimeout(run, 220);
        // 새로고침이 막히거나 데이터 갱신형일 때 대비한 안전 해제
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        }, 4000);
      } else {
        setPullValue(0);
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);

  if (pull <= 0 && !refreshing) return null;

  const shown = refreshing ? THRESHOLD : pull;
  const progress = Math.min(pull / THRESHOLD, 1);
  const ready = pull >= THRESHOLD;

  return (
    <View
      pointerEvents="none"
      style={
        {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          alignItems: 'center',
          zIndex: 100000,
          transform: [{ translateY: shown - 46 }],
        } as any
      }
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0B1020',
          shadowOpacity: 0.16,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          ...({ boxShadow: '0 4px 12px rgba(11,16,32,0.16)' } as object),
        }}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons
            name="arrow-down"
            size={20}
            color={ready ? colors.primary : colors.textTertiary}
            style={{ transform: [{ rotate: `${progress * 180}deg` }] }}
          />
        )}
      </View>
    </View>
  );
}
