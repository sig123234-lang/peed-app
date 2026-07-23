import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BITE_BACKGROUNDS,
  BITE_FILTERS,
  BITE_FONTS,
  STICKERS,
  TEXT_COLORS,
  contrastText,
  filterFor,
  fontFor,
} from '@/components/feed/biteStyles';
import { lockPullRefresh } from '@/components/web/PullToRefresh';
import { BiteOverlay, useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { colors, radius, spacing } from '@/theme';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const SIZES = [26, 38, 54]; // 텍스트 S / M / L

type Panel = 'sticker' | 'bg' | 'filter' | null;

// 인스타그램 스토리 방식 — 세로 풀스크린 캔버스 위에 도구를 얹는다.
// 흐름: 배경(사진 또는 색) → Aa/스티커로 꾸미기(드래그 배치) → 스토리 올리기.
export function BiteComposer() {
  const { biteComposer, closeBiteComposer } = useShell();
  const { addBite, posts } = useFeed();
  const { width: rawW, height: rawH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // 열 때 뷰포트 크기를 '고정'한다. 모바일 키보드가 올라오면 viewport가 줄어
  // 캔버스가 작아지는 걸 막기 위함(인스타처럼 크기 유지). 닫으면 해제.
  const frozen = useRef<{ w: number; h: number } | null>(null);
  if (biteComposer && !frozen.current) frozen.current = { w: rawW, h: rawH };
  if (!biteComposer) frozen.current = null;
  const winW = frozen.current?.w ?? rawW;
  const winH = frozen.current?.h ?? rawH;

  // 세로 9:16 스테이지 — 좁은 화면(폰)은 꽉 채우고, 넓은 화면(데스크탑)은 가운데 컬럼.
  const fill = winW <= Math.round(winH * (9 / 16));
  const STAGE_H = fill ? winH : winH - 40;
  const STAGE_W = fill ? winW : Math.round(STAGE_H * (9 / 16));
  const topPad = Math.max(insets.top, 12);
  const botPad = Math.max(insets.bottom, 14);

  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [overlays, setOverlays] = useState<BiteOverlay[]>([]);
  const [filterKey, setFilterKey] = useState('none');
  const [bgIndex, setBgIndex] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [textSize, setTextSize] = useState(SIZES[1]);
  const [textFont, setTextFont] = useState(BITE_FONTS[0].key);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textHL, setTextHL] = useState(false);
  const [isMention, setIsMention] = useState(false); // @언급 편집 모드
  const [dragging, setDragging] = useState(false);

  // 받는 사람(전체 공개 / 친한 친구) + 친한 친구 선택.
  const [audience, setAudience] = useState<'all' | 'close'>('all');
  const [closeFriends, setCloseFriends] = useState<Set<string>>(new Set());
  const [friendsOpen, setFriendsOpen] = useState(false);

  // 팔로잉 목록 — 피드 게시물 작성자에서 (나 제외) 중복 없이 추출.
  const following = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string; handle: string; avatar: any }[] = [];
    posts.forEach((p) => {
      const a = p.author;
      if (!a.isMe && !seen.has(a.id)) {
        seen.add(a.id);
        list.push({ id: a.id, name: a.name, handle: a.handle, avatar: a.avatar });
      }
    });
    return list;
  }, [posts]);

  const toggleFriend = (id: string) =>
    setCloseFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canvas = useRef({ w: STAGE_W, h: STAGE_H });
  const overlaysRef = useRef<BiteOverlay[]>([]);
  overlaysRef.current = overlays;
  const start = useRef({ x: 0, y: 0 });
  const live = useRef<Record<string, { x: number; y: number }>>({});
  const liveSize = useRef<Record<string, number>>({});
  const startSize = useRef(0);
  const pinch = useRef({ active: false, startDist: 0, startSize: 0 });
  const resp = useRef<Record<string, { move: any; resize: any }>>({});
  const seq = useRef(0);
  const [, force] = useReducer((c) => c + 1, 0);

  // 배경 사진 확대/이동(핀치 줌 + 팬).
  const img = useRef({ scale: 1, tx: 0, ty: 0 });
  const imgStart = useRef({ scale: 1, tx: 0, ty: 0, dist: 0 });
  const bgResp = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        imgStart.current = { ...img.current, dist: 0 };
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches;
        const { w, h } = canvas.current;
        if (touches && touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.hypot(dx, dy) || 1;
          if (imgStart.current.dist === 0) imgStart.current.dist = dist;
          img.current.scale = clamp((imgStart.current.scale * dist) / imgStart.current.dist, 1, 4);
        } else {
          img.current.tx = imgStart.current.tx + g.dx;
          img.current.ty = imgStart.current.ty + g.dy;
        }
        const maxX = ((img.current.scale - 1) * w) / 2;
        const maxY = ((img.current.scale - 1) * h) / 2;
        img.current.tx = clamp(img.current.tx, -maxX, maxX);
        img.current.ty = clamp(img.current.ty, -maxY, maxY);
        force();
      },
      onPanResponderRelease: (_e, g) => {
        imgStart.current.dist = 0;
        if (Math.abs(g.dx) + Math.abs(g.dy) < 6) setActiveId(null); // 탭 → 선택 해제
      },
      onPanResponderTerminate: () => {
        imgStart.current.dist = 0;
      },
    })
  ).current;

  useEffect(() => {
    if (biteComposer) {
      setImage(null);
      setCaption('');
      setOverlays([]);
      setFilterKey('none');
      setBgIndex(0);
      setActiveId(null);
      setPanel(null);
      setEditorOpen(false);
      setEditId(null);
      setTextDraft('');
      setTextColor(TEXT_COLORS[0]);
      setTextSize(SIZES[1]);
      setTextFont(BITE_FONTS[0].key);
      setTextAlign('center');
      setTextHL(false);
      setIsMention(false);
      setDragging(false);
      setAudience('all');
      setCloseFriends(new Set());
      setFriendsOpen(false);
      live.current = {};
      liveSize.current = {};
      resp.current = {};
      img.current = { scale: 1, tx: 0, ty: 0 };
    }
  }, [biteComposer]);

  // 편집기가 열려 있는 동안엔 당겨서 새로고침 잠금(오버레이 드래그와 충돌 방지).
  useEffect(() => {
    if (!biteComposer) return;
    const unlock = lockPullRefresh();
    return unlock;
  }, [biteComposer]);

  if (!biteComposer) return null;

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alert('사진 접근 권한이 필요합니다.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (!res.canceled) {
      setImage(res.assets[0].uri);
      img.current = { scale: 1, tx: 0, ty: 0 };
      setPanel(null);
    }
  };

  /* ------------------------------------------------ text editor */

  const openNewText = () => {
    setPanel(null);
    setEditId(null);
    setIsMention(false);
    setTextDraft('');
    setTextSize(SIZES[1]);
    setTextFont(BITE_FONTS[0].key);
    setTextAlign('center');
    setTextHL(false);
    setEditorOpen(true);
  };

  const openEditText = (o: BiteOverlay) => {
    const mention = o.value.startsWith('@');
    setEditId(o.id);
    setIsMention(mention);
    setTextDraft(mention ? o.value.slice(1) : o.value);
    setTextColor(o.color ?? TEXT_COLORS[0]);
    setTextSize(o.size ?? SIZES[1]);
    setTextFont(o.font ?? BITE_FONTS[0].key);
    setTextAlign(o.align ?? 'center');
    setTextHL(!!o.highlight);
    setEditorOpen(true);
  };

  const cycleAlign = () =>
    setTextAlign((a) => (a === 'left' ? 'center' : a === 'center' ? 'right' : 'left'));

  // @언급 — @는 고정 접두어, 입력은 아이디만 받는다(커서가 @ 뒤로).
  const openMention = () => {
    setPanel(null);
    setEditId(null);
    setIsMention(true);
    setTextDraft('');
    setTextSize(SIZES[1]);
    setTextFont(BITE_FONTS[0].key);
    setTextAlign('center');
    setTextColor('#4F6BFF');
    setTextHL(true);
    setEditorOpen(true);
  };

  const cancelEditor = () => {
    setEditorOpen(false);
    setEditId(null);
    setTextDraft('');
  };

  const confirmEditor = () => {
    const handle = textDraft.trim().replace(/^@+/, '');
    const value = isMention ? (handle ? `@${handle}` : '') : textDraft.trim();
    if (!value) {
      if (editId) removeOverlay(editId);
      cancelEditor();
      return;
    }
    if (editId) {
      setOverlays((prev) =>
        prev.map((o) =>
          o.id === editId
            ? { ...o, value, color: textColor, size: textSize, font: textFont, align: textAlign, highlight: textHL }
            : o
        )
      );
    } else {
      const id = `o${(seq.current += 1)}`;
      setOverlays((prev) => [
        ...prev,
        {
          id,
          kind: 'text',
          value,
          x: 0.12,
          y: 0.4,
          color: textColor,
          size: textSize,
          font: textFont,
          align: textAlign,
          highlight: textHL,
        },
      ]);
      setActiveId(id);
    }
    cancelEditor();
  };

  const addEmojiOverlay = (emoji: string) => {
    const id = `o${(seq.current += 1)}`;
    setOverlays((prev) => [...prev, { id, kind: 'emoji', value: emoji, x: 0.4, y: 0.42, size: 64 }]);
    setActiveId(id);
    setPanel(null);
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    delete live.current[id];
    delete liveSize.current[id];
    delete resp.current[id];
    if (activeId === id) setActiveId(null);
  };

  /* ---------------------------------------------- drag / resize */

  const getResp = (id: string) => {
    if (resp.current[id]) return resp.current[id];
    const ov0 = () => overlaysRef.current.find((o) => o.id === id);

    const move = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const o = ov0();
        if (!o) return;
        setActiveId(id);
        start.current = live.current[id] ?? { x: o.x, y: o.y };
        pinch.current.active = false;
      },
      onPanResponderMove: (evt, g) => {
        const o = ov0();
        if (!o) return;
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.hypot(dx, dy) || 1;
          if (!pinch.current.active) {
            pinch.current = {
              active: true,
              startDist: dist,
              startSize: liveSize.current[id] ?? o.size ?? (o.kind === 'emoji' ? 64 : 32),
            };
          }
          liveSize.current[id] = clamp(
            (pinch.current.startSize * dist) / pinch.current.startDist,
            16,
            240
          );
          force();
          return;
        }
        pinch.current.active = false;
        const { w, h } = canvas.current;
        if (!w || !h) return;
        setDragging(true);
        live.current[id] = {
          x: clamp(start.current.x + g.dx / w, 0, 0.94),
          y: clamp(start.current.y + g.dy / h, 0, 0.95),
        };
        force();
      },
      onPanResponderRelease: (_e, g) => {
        const o = ov0();
        const p = live.current[id];
        const s = liveSize.current[id];
        setDragging(false);
        if (p && p.y > 0.85) {
          removeOverlay(id);
          pinch.current.active = false;
          return;
        }
        if (p || s != null) {
          setOverlays((prev) =>
            prev.map((it) =>
              it.id === id
                ? { ...it, ...(p ? { x: p.x, y: p.y } : {}), ...(s != null ? { size: Math.round(s) } : {}) }
                : it
            )
          );
          if (p) delete live.current[id];
          if (s != null) delete liveSize.current[id];
        }
        const moved = Math.abs(g.dx) + Math.abs(g.dy);
        if (moved < 6 && !pinch.current.active) {
          if (o?.kind === 'text') openEditText(o);
          else setActiveId(id);
        }
        pinch.current.active = false;
      },
      onPanResponderTerminate: () => {
        delete live.current[id];
        pinch.current.active = false;
        setDragging(false);
      },
    });

    const resize = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const o = ov0();
        if (!o) return;
        setActiveId(id);
        startSize.current = liveSize.current[id] ?? o.size ?? (o.kind === 'emoji' ? 64 : 32);
      },
      onPanResponderMove: (_e, g) => {
        liveSize.current[id] = clamp(startSize.current + (g.dx + g.dy) / 2, 16, 220);
        force();
      },
      onPanResponderRelease: () => {
        const s = liveSize.current[id];
        if (s != null) {
          setOverlays((prev) => prev.map((it) => (it.id === id ? { ...it, size: Math.round(s) } : it)));
          delete liveSize.current[id];
        }
      },
      onPanResponderTerminate: () => {
        delete liveSize.current[id];
      },
    });

    resp.current[id] = { move, resize };
    return resp.current[id];
  };

  /* --------------------------------------------------- publish */

  const publish = () => {
    if (!image && overlays.length === 0) return;
    addBite({
      image: image ? { uri: image } : undefined,
      caption: caption.trim(),
      overlays,
      filter: filterKey,
      bg: image ? undefined : BITE_BACKGROUNDS[bgIndex],
      audience,
    });
    closeBiteComposer();
  };

  const canPost = !!image || overlays.length > 0;
  const flt = filterFor(filterKey);
  const stageRadius = fill ? 0 : 22;

  return (
    <View style={[styles.root, { paddingVertical: fill ? 0 : 20 }]}>
      <View
        style={[styles.stage, { width: STAGE_W, height: STAGE_H, borderRadius: stageRadius }]}
        onLayout={(e) =>
          (canvas.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        {/* background */}
        {image ? (
          <Image
            source={{ uri: image }}
            style={[
              StyleSheet.absoluteFill,
              {
                transform: [
                  { translateX: img.current.tx },
                  { translateY: img.current.ty },
                  { scale: img.current.scale },
                ],
              },
            ]}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={BITE_BACKGROUNDS[bgIndex] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {flt.opacity > 0 && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: flt.color, opacity: flt.opacity }]} />
        )}

        {/* 배경 제스처: 사진이면 핀치 줌/이동, 아니면 탭으로 선택 해제 */}
        {image ? (
          <View style={StyleSheet.absoluteFill} {...bgResp.panHandlers} />
        ) : (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveId(null)} />
        )}

        {overlays.length === 0 && !editorOpen && (
          <View style={styles.hint} pointerEvents="none">
            <Ionicons name="sparkles" size={30} color="rgba(255,255,255,0.9)" />
            <Text style={styles.hintTitle}>이 순간을 Bite로</Text>
            <Text style={styles.hintText}>
              오른쪽 도구로 사진·색 배경을 고르고{'\n'}Aa로 글자, 스티커로 꾸며보세요
            </Text>
          </View>
        )}

        {/* overlays */}
        {overlays.map((o) => {
          const p = live.current[o.id] ?? { x: o.x, y: o.y };
          const size = liveSize.current[o.id] ?? o.size ?? (o.kind === 'emoji' ? 64 : 32);
          const selected = activeId === o.id;
          const r = getResp(o.id);
          const f = fontFor(o.font);
          return (
            <View
              key={o.id}
              {...r.move.panHandlers}
              style={[
                styles.overlay,
                { left: `${p.x * 100}%`, top: `${p.y * 100}%` },
                selected && styles.overlaySelected,
              ]}
            >
              {o.kind === 'emoji' ? (
                <Text style={{ fontSize: size }}>{o.value}</Text>
              ) : (
                <View
                  style={
                    o.highlight
                      ? { backgroundColor: o.color ?? '#FFF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }
                      : undefined
                  }
                >
                  <Text
                    style={{
                      fontSize: size,
                      fontWeight: f.weight as any,
                      fontFamily: f.family,
                      textAlign: o.align ?? 'center',
                      color: o.highlight ? contrastText(o.color) : o.color ?? '#FFFFFF',
                      ...(o.highlight
                        ? {}
                        : {
                            textShadowColor: 'rgba(0,0,0,0.35)',
                            textShadowOffset: { width: 0, height: 1 },
                            textShadowRadius: 5,
                          }),
                    }}
                  >
                    {o.value}
                  </Text>
                </View>
              )}
              {selected && (
                <View {...r.resize.panHandlers} style={styles.resizeHandle} hitSlop={10}>
                  <Ionicons name="resize" size={14} color="#111" />
                </View>
              )}
            </View>
          );
        })}

        {/* drag-to-trash */}
        {dragging && (
          <View
            style={[
              styles.trashZone,
              { bottom: botPad + 8 },
              activeId && (live.current[activeId]?.y ?? 0) > 0.85 && styles.trashZoneOn,
            ]}
            pointerEvents="none"
          >
            <Ionicons name="trash" size={22} color="#fff" />
          </View>
        )}

        {/* ---------- overlaid chrome (hidden while editing text) ---------- */}
        {!editorOpen && (
          <>
            {/* top: close + tool rail */}
            <View style={[styles.topBar, { top: topPad }]} pointerEvents="box-none">
              <TouchableOpacity onPress={closeBiteComposer} style={styles.roundBtn} hitSlop={8}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>

              <View style={styles.tools} pointerEvents="box-none">
                <RailTool icon="text" label="Aa" onPress={openNewText} />
                <RailTool icon="at" label="언급" onPress={openMention} />
                <RailTool
                  icon="happy"
                  label="스티커"
                  active={panel === 'sticker'}
                  onPress={() => setPanel(panel === 'sticker' ? null : 'sticker')}
                />
                {!image && (
                  <RailTool
                    icon="color-palette"
                    label="배경"
                    active={panel === 'bg'}
                    onPress={() => setPanel(panel === 'bg' ? null : 'bg')}
                  />
                )}
                <RailTool
                  icon="color-filter"
                  label="필터"
                  active={panel === 'filter'}
                  onPress={() => setPanel(panel === 'filter' ? null : 'filter')}
                />
                <RailTool icon="image" label="사진" onPress={pickPhoto} />
                {activeId && <RailTool icon="trash" label="삭제" onPress={() => removeOverlay(activeId)} />}
              </View>
            </View>

            {/* panels (sticker / bg / filter) */}
            {panel && (
              <View style={[styles.panel, { bottom: botPad + 78 }]}>
                {panel === 'sticker' && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.rowGap}>
                      {STICKERS.map((e) => (
                        <TouchableOpacity key={e} onPress={() => addEmojiOverlay(e)} style={styles.emojiBtn}>
                          <Text style={styles.emojiText}>{e}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
                {panel === 'filter' && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.rowGap}>
                      {BITE_FILTERS.map((f) => (
                        <TouchableOpacity
                          key={f.key}
                          onPress={() => setFilterKey(f.key)}
                          style={[styles.filterChip, filterKey === f.key && styles.filterChipOn]}
                        >
                          <View
                            style={[styles.filterDot, { backgroundColor: f.key === 'none' ? '#8890A0' : f.color }]}
                          />
                          <Text style={styles.chipText}>{f.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
                {panel === 'bg' && !image && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.rowGap}>
                      {BITE_BACKGROUNDS.map((g, i) => (
                        <TouchableOpacity key={i} onPress={() => setBgIndex(i)}>
                          <LinearGradient
                            colors={g as [string, string]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.bgSwatch, bgIndex === i && styles.bgSwatchOn]}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>
            )}

            {/* 받는 사람(전체/친한 친구) */}
            {!panel && (
              <TouchableOpacity
                style={[styles.audiencePill, { bottom: botPad + 62 }]}
                onPress={() => setFriendsOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={audience === 'close' ? 'star' : 'globe-outline'}
                  size={15}
                  color={audience === 'close' ? '#4ADE80' : '#fff'}
                />
                <Text style={styles.audiencePillText}>
                  {audience === 'close'
                    ? `친한 친구${closeFriends.size ? ` ${closeFriends.size}` : ''}`
                    : '전체 공개'}
                </Text>
                <Ionicons name="chevron-up" size={13} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}

            {/* bottom: caption + share */}
            <View style={[styles.bottomBar, { bottom: botPad }]}>
              <View style={styles.captionWrap}>
                <TextInput
                  style={styles.caption}
                  placeholder="한줄 설명 (선택)"
                  placeholderTextColor="rgba(255,255,255,0.55)"
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={60}
                />
              </View>
              <TouchableOpacity onPress={publish} disabled={!canPost} activeOpacity={0.9}>
                <LinearGradient
                  colors={canPost ? ['#7C5CFF', '#4F6BFF'] : ['#3A3F52', '#3A3F52']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shareBtn}
                >
                  <Ionicons name="arrow-forward" size={22} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {activeId && (
              <Text style={[styles.dragHint, { top: topPad + 52 }]} pointerEvents="none">
                드래그로 이동 · 모서리로 크기 · 탭하면 편집 · 아래로 끌면 삭제
              </Text>
            )}

            {/* 받는 사람 선택 시트 */}
            {friendsOpen && (
              <View style={styles.friendsSheet}>
                <View style={styles.friendsHandle} />
                <View style={styles.friendsHead}>
                  <Text style={styles.friendsTitle}>받는 사람</Text>
                  <TouchableOpacity onPress={() => setFriendsOpen(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.audOpt, audience === 'all' && styles.audOptOn]}
                  onPress={() => setAudience('all')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="globe-outline" size={20} color="#fff" />
                  <Text style={styles.audOptText}>전체 공개</Text>
                  {audience === 'all' && <Ionicons name="checkmark-circle" size={20} color="#4F6BFF" />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.audOpt, audience === 'close' && styles.audOptOn]}
                  onPress={() => setAudience('close')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="star" size={20} color="#4ADE80" />
                  <Text style={styles.audOptText}>친한 친구</Text>
                  {audience === 'close' && <Ionicons name="checkmark-circle" size={20} color="#4F6BFF" />}
                </TouchableOpacity>

                {audience === 'close' && (
                  <>
                    <Text style={styles.friendsSub}>친한 친구 선택 · 팔로잉</Text>
                    <ScrollView style={{ maxHeight: 230 }} showsVerticalScrollIndicator={false}>
                      {following.length === 0 ? (
                        <Text style={styles.friendsEmpty}>표시할 팔로잉이 없어요</Text>
                      ) : (
                        following.map((f) => {
                          const on = closeFriends.has(f.id);
                          return (
                            <TouchableOpacity
                              key={f.id}
                              style={styles.friendRow}
                              onPress={() => toggleFriend(f.id)}
                              activeOpacity={0.8}
                            >
                              <Image source={f.avatar} style={styles.friendAvatar} contentFit="cover" />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.friendName}>{f.name}</Text>
                                <Text style={styles.friendHandle}>{f.handle}</Text>
                              </View>
                              <View style={[styles.friendCheck, on && styles.friendCheckOn]}>
                                {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </ScrollView>
                  </>
                )}

                <TouchableOpacity style={styles.friendsDone} onPress={() => setFriendsOpen(false)} activeOpacity={0.9}>
                  <Text style={styles.friendsDoneText}>완료</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ---------- text editor (fullscreen over stage) ---------- */}
        {editorOpen && (
          <View style={[styles.editor, { paddingTop: topPad + 4, paddingBottom: botPad + 4 }]}>
            <View style={styles.editorTop}>
              <TouchableOpacity onPress={cancelEditor} hitSlop={8}>
                <Text style={styles.editorCancel}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmEditor} hitSlop={8}>
                <Text style={styles.editorDone}>완료</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.editorTools}>
              <TouchableOpacity onPress={cycleAlign} style={styles.toolPill}>
                <Ionicons name="reorder-two" size={16} color="#fff" />
                <Text style={styles.toolPillText}>
                  {textAlign === 'left' ? '왼쪽' : textAlign === 'right' ? '오른쪽' : '가운데'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTextHL((v) => !v)}
                style={[styles.toolPill, textHL && styles.toolPillOn]}
              >
                <Ionicons name="color-fill" size={16} color="#fff" />
                <Text style={styles.toolPillText}>배경</Text>
              </TouchableOpacity>
              <View style={styles.sizeRow}>
                {SIZES.map((sz, i) => (
                  <TouchableOpacity
                    key={sz}
                    onPress={() => setTextSize(sz)}
                    style={[styles.sizeBtn, textSize === sz && styles.sizeBtnOn]}
                  >
                    <Text style={[styles.sizeBtnText, { fontSize: 12 + i * 3 }]}>Aa</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.editorCenter}>
              <View
                style={
                  textHL
                    ? { backgroundColor: textColor, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '100%' }
                    : { width: '100%' }
                }
              >
                {isMention ? (
                  <View style={styles.mentionRow}>
                    <Text
                      style={{
                        color: textHL ? contrastText(textColor) : textColor,
                        fontSize: textSize,
                        fontFamily: fontFor(textFont).family,
                        fontWeight: fontFor(textFont).weight as any,
                      }}
                    >
                      @
                    </Text>
                    <TextInput
                      style={[
                        styles.editorInput,
                        {
                          width: 'auto',
                          minWidth: 40,
                          color: textHL ? contrastText(textColor) : textColor,
                          fontSize: textSize,
                          fontFamily: fontFor(textFont).family,
                          fontWeight: fontFor(textFont).weight as any,
                          textAlign: 'left',
                        },
                      ]}
                      value={textDraft}
                      onChangeText={(v) => setTextDraft(v.replace(/[@\s]/g, ''))}
                      placeholder="아이디"
                      placeholderTextColor={textHL ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)'}
                      autoFocus
                      maxLength={30}
                    />
                  </View>
                ) : (
                  <TextInput
                    style={[
                      styles.editorInput,
                      {
                        color: textHL ? contrastText(textColor) : textColor,
                        fontSize: textSize,
                        fontFamily: fontFor(textFont).family,
                        fontWeight: fontFor(textFont).weight as any,
                        textAlign,
                      },
                    ]}
                    value={textDraft}
                    onChangeText={setTextDraft}
                    placeholder="텍스트 입력"
                    placeholderTextColor={textHL ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)'}
                    autoFocus
                    multiline
                    maxLength={60}
                  />
                )}
              </View>
            </View>

            <View style={styles.fontRow}>
              {BITE_FONTS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setTextFont(f.key)}
                  style={[styles.fontBtn, textFont === f.key && styles.fontBtnOn]}
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontFamily: f.family, fontWeight: f.weight as any }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.editorColors}>
              {TEXT_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setTextColor(c)}
                  style={[styles.swatch, { backgroundColor: c }, textColor === c && styles.swatchOn]}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function RailTool({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.railTool} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.railIcon, active && styles.railIconOn]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </View>
      <Text style={styles.railLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const FIXED = { position: 'fixed', inset: 0 } as unknown as object;

const styles = StyleSheet.create({
  root: {
    ...FIXED,
    zIndex: 9999,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    overflow: 'hidden',
    backgroundColor: '#111',
    // 브라우저 기본 핀치 줌/스크롤 제스처를 막고 우리가 직접 처리.
    ...({ boxShadow: '0 20px 60px rgba(0,0,0,0.6)', touchAction: 'none' } as object),
  },

  hint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  hintTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  hintText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
  },

  overlay: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: '92%',
  },
  overlaySelected: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
    borderStyle: 'dashed',
  },
  resizeHandle: {
    position: 'absolute',
    right: -13,
    bottom: -13,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...({ boxShadow: '0 1px 5px rgba(0,0,0,0.35)' } as object),
  },

  trashZone: {
    position: 'absolute',
    alignSelf: 'center',
    left: '50%',
    marginLeft: -26,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  trashZoneOn: {
    backgroundColor: colors.danger,
    borderColor: '#fff',
    transform: [{ scale: 1.15 }],
  },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tools: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  railTool: { alignItems: 'center', gap: 3, width: 52 },
  railIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railIconOn: { backgroundColor: colors.primary },
  railLabel: { color: 'rgba(255,255,255,0.92)', fontSize: 10.5, fontWeight: '800' },

  dragHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11.5,
    fontWeight: '700',
    ...({ textShadow: '0 1px 4px rgba(0,0,0,0.6)' } as object),
  },

  panel: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  rowGap: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 26 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  filterChipOn: { backgroundColor: colors.primary },
  filterDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  bgSwatch: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bgSwatchOn: { borderColor: '#fff' },

  bottomBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  captionWrap: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  caption: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    ...({ outlineStyle: 'none' } as object),
  },
  shareBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...({ boxShadow: '0 6px 16px rgba(79,107,255,0.5)' } as object),
  },

  /* text editor */
  editor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md,
    justifyContent: 'space-between',
  },
  editorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editorCancel: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '700' },
  editorDone: { color: '#fff', fontSize: 16, fontWeight: '900' },
  editorTools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  toolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  toolPillOn: { backgroundColor: colors.primary },
  toolPillText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  sizeRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  sizeBtn: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  sizeBtnOn: { backgroundColor: colors.primary },
  sizeBtnText: { color: '#fff', fontWeight: '900' },
  editorCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mentionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  editorInput: {
    width: '100%',
    fontWeight: '800',
    textAlign: 'center',
    ...({ outlineStyle: 'none' } as object),
  },
  fontRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  fontBtn: {
    minWidth: 44,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  fontBtnOn: { borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.22)' },
  editorColors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  swatchOn: { borderColor: '#fff' },

  /* 받는 사람 */
  audiencePill: {
    position: 'absolute',
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  audiencePillText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  friendsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#15171E',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    zIndex: 20,
  },
  friendsHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: spacing.md,
  },
  friendsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  friendsTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  audOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  audOptOn: { backgroundColor: 'rgba(255,255,255,0.08)' },
  audOptText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  friendsSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  friendsEmpty: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  friendAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  friendName: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  friendHandle: { color: 'rgba(255,255,255,0.55)', fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  friendCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendCheckOn: { backgroundColor: '#4ADE80', borderColor: '#4ADE80' },
  friendsDone: {
    marginTop: spacing.md,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendsDoneText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
