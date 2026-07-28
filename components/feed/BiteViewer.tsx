import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { contrastText, filterFor, fontFor } from '@/components/feed/biteStyles';
import { useBiteStoryGroups } from '@/components/feed/useBiteStories';
import { WebVideo } from '@/components/feed/WebVideo';
import { useDm } from '@/context/dm';
import { useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { APP_WIDTH, colors, radius, spacing } from '@/theme';

const STORY_MS = 6000;
const AD_IMAGE_MS = 7000; // 이미지 광고는 조금 더 길게
const AD_VIDEO_MS = 30000; // 영상 광고는 재생이 끝나면 넘어가고, 이건 안전용 상한

// 바이트 4개(사람)마다 스토리 광고 1개를 끼운다 — 인스타 스토리 광고처럼.
// 광고는 그 자체가 한 칸짜리 '그룹'이 되어 넘기기·진행바가 자연스럽게 흐른다.
function interleaveBiteAds(groups: any[], ads: any[]): any[] {
  if (!ads.length || !groups.length) return groups;
  const out: any[] = [];
  groups.forEach((g, i) => {
    out.push(g);
    if ((i + 1) % 4 === 0) {
      const ad = ads[Math.floor(i / 4) % ads.length];
      const key = `__ad_${ad.id}_${i}`;
      out.push({
        userId: key,
        name: ad.title || '광고',
        avatar: ad.image ? { uri: ad.image } : undefined,
        isMine: false,
        isAd: true,
        ad,
        items: [{ id: key, isAd: true, ad }],
        latestAt: 0,
      });
    }
  });
  return out;
}

// Fullscreen story viewer. Tap right → next, left → previous; auto-advances
// every few seconds and closes after the last story.
//
// 재생 단위는 '사람'이다. 한 사람이 여러 개를 올렸으면 올린 순서대로 이어서
// 보여주고, 그 사람 걸 다 보면 다음 사람으로 넘어간다. 위쪽 진행 막대도 지금
// 보고 있는 사람이 올린 개수만큼만 그린다 — 전체 개수를 그리면 몇 개짜리인지
// 알 수 없다.
export function BiteViewer() {
  const { biteViewerId, closeBiteViewer, openBiteComposer, viewUser } = useShell();
  const { deleteBite, toggleBiteLike } = useFeed();
  const { replyToBite } = useDm();
  const realGroups = useBiteStoryGroups();
  const [ads, setAds] = useState<any[]>([]);
  useEffect(() => {
    fetch('/api/ads')
      .then((r) => r.json())
      .then((d) => setAds((d.ads || []).filter((a: any) => a.placement === '바이트')))
      .catch(() => {});
  }, []);
  // 광고를 끼운 최종 재생 목록. 광고가 없으면 원본 그대로.
  const groups = useMemo(() => interleaveBiteAds(realGroups, ads), [realGroups, ads]);
  const navedRef = useRef(false); // 사용자가 직접 넘겼는지 — 광고 늦게 로드돼도 위치 유지
  const [menuOpen, setMenuOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [gi, setGi] = useState(0); // 몇 번째 사람
  const [ii, setIi] = useState(0); // 그 사람의 몇 번째 스토리
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  // Jump to the tapped person when the viewer opens.
  useEffect(() => {
    navedRef.current = false;
    if (biteViewerId) {
      const i = groups.findIndex((g) => g.userId === biteViewerId);
      setGi(i >= 0 ? i : 0);
      setIi(0);
      setMenuOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biteViewerId]);

  // 광고가 뒤늦게 로드되면 그룹 배열의 인덱스가 밀린다 — 아직 직접 넘겨보지
  // 않았다면(막 열었으면) 눌렀던 사람 위치로 다시 맞춘다.
  useEffect(() => {
    if (!biteViewerId || navedRef.current) return;
    const i = groups.findIndex((g) => g.userId === biteViewerId);
    if (i >= 0) {
      setGi(i);
      setIi(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads.length]);

  const group = groups[Math.min(gi, Math.max(0, groups.length - 1))];
  const items = group?.items ?? [];

  const goNext = () => {
    navedRef.current = true;
    if (ii < items.length - 1) setIi(ii + 1);
    else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setIi(0);
    } else closeBiteViewer();
  };

  const goPrev = () => {
    navedRef.current = true;
    if (ii > 0) setIi(ii - 1);
    else if (gi > 0) {
      const prev = groups[gi - 1];
      setGi(gi - 1);
      setIi(Math.max(0, prev.items.length - 1));
    }
  };

  // Auto-advance. 메뉴를 열었거나 답장을 쓰는 동안은 멈춘다 — 쓰는 사이에
  // 넘어가버리면 엉뚱한 스토리에 답장이 달린다(메뉴 쪽은 엉뚱한 걸 지우게 된다).
  const paused = menuOpen || typing || !!reply.trim() || sending;
  useEffect(() => {
    if (!biteViewerId || items.length === 0 || paused) return;
    const it: any = items[Math.min(ii, items.length - 1)];
    // 광고는 더 오래 머문다 — 영상은 재생이 끝나면(onEnded) 넘어가고 이 타이머는 상한.
    const ms = it?.isAd ? (it.ad?.video ? AD_VIDEO_MS : AD_IMAGE_MS) : STORY_MS;
    const t = setTimeout(goNext, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, ii, biteViewerId, items.length, groups.length, paused]);

  // 스토리가 바뀌면 쓰던 답장은 지운다 — 남겨두면 다음 사람에게 잘못 간다.
  useEffect(() => {
    setReply('');
    setMenuOpen(false);
  }, [gi, ii]);

  if (!biteViewerId || groups.length === 0 || !group) return null;
  const cur = items[Math.min(ii, items.length - 1)];
  if (!cur) return null;

  const W = Math.min(APP_WIDTH, 460);

  // ── 스토리 광고 ── 인스타 스토리 광고처럼 바이트 사이에 전체화면으로 뜬다.
  if (cur.isAd) {
    const ad = cur.ad || {};
    const openAd = () => {
      if (ad.link && typeof window !== 'undefined') window.open(ad.link, '_blank');
    };
    return (
      <View style={styles.root}>
        <View style={[styles.frame, { width: W }]}>
          {/* 미디어 — 영상 우선 */}
          {ad.video ? (
            <View style={StyleSheet.absoluteFill}>
              <WebVideo uri={ad.video} poster={ad.image} loop={false} onEnded={goNext} />
            </View>
          ) : ad.image ? (
            <Image
              source={{ uri: ad.image }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <LinearGradient
              colors={['#6C5CE7', '#4F6BFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* 위·아래 어둡게 — 글자가 잘 보이게 */}
          <LinearGradient
            colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.78)']}
            locations={[0, 0.2, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* 좌/우 탭 — 넘기기 (광고도 스킵 가능) */}
          <Pressable style={styles.tapLeft} onPress={goPrev} />
          <Pressable style={styles.tapRight} onPress={goNext} />

          {/* 진행 막대 (광고 한 칸) */}
          <View style={styles.segments}>
            <View style={styles.segTrack}>
              <View style={[styles.segFill, { width: '100%' }]} />
            </View>
          </View>

          {/* 헤더 — 광고주 + 스폰서 표시 + 닫기 */}
          <View style={styles.header} pointerEvents="box-none">
            <View style={styles.authorTap}>
              {ad.image ? (
                <Image source={{ uri: ad.image }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{ad.title || '광고'}</Text>
                <Text style={styles.time}>Sponsored · 광고</Text>
              </View>
            </View>
            <Pressable onPress={closeBiteViewer} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
          </View>

          {/* 문구 + CTA */}
          <View style={styles.adBottom} pointerEvents="box-none">
            {ad.body ? (
              <Text style={styles.adBody} numberOfLines={3}>{ad.body}</Text>
            ) : null}
            {ad.link ? (
              <Pressable style={styles.adCta} onPress={openAd}>
                <Text style={styles.adCtaText}>{String(ad.ctaText || '자세히 보기').trim()}</Text>
                <Ionicons name="open-outline" size={16} color="#111" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  const onEdit = () => {
    setMenuOpen(false);
    const id = cur.id;
    closeBiteViewer();
    openBiteComposer(id); // 컴포저가 원래 사진·꾸밈·구도를 그대로 불러온다
  };

  // 상단 프로필(아바타·이름)을 누르면 그 스토리를 올린 사람 프로필로.
  const openAuthor = () => {
    if (cur.isMine || !group.userId) return;
    closeBiteViewer();
    viewUser(group.userId);
  };

  const onReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await replyToBite(cur.id, text);
    setSending(false);
    if (!ok) {
      // 24시간이 지나 사라졌거나 작성자가 지운 스토리.
      if (typeof window !== 'undefined') window.alert('답장을 보내지 못했어요.');
      return;
    }
    setReply('');
    setSent(true);
    setTimeout(() => setSent(false), 1800);
  };

  const onDelete = () => {
    if (typeof window !== 'undefined' && !window.confirm('이 바이트를 삭제할까요?')) return;
    setMenuOpen(false);
    const id = cur.id;
    // 이 사람의 마지막 한 장이면 볼 게 없어지니 닫는다.
    if (items.length <= 1) closeBiteViewer();
    else setIi(Math.min(ii, items.length - 2));
    deleteBite(id);
  };

  // 올릴 때 잡아둔 배치(확대·축소/이동/회전). x·y 는 비율이라 이 화면 크기에
  // 곱해 쓴다. 컴포저와 순서(이동 → 회전 → 확대)가 같아야 같은 그림이 된다.
  const fitStyle = cur.fit
    ? {
        transform: [
          { translateX: cur.fit.x * frame.w },
          { translateY: cur.fit.y * frame.h },
          { rotate: `${cur.fit.rotate ?? 0}deg` },
          { scale: cur.fit.scale },
        ],
      }
    : null;

  return (
    <View style={styles.root}>
      <View
        style={[styles.frame, { width: W }]}
        onLayout={(e) =>
          setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }
      >
        {/* 배경은 항상 깔린다 — 사진을 줄이거나 돌렸으면 그 틈으로 드러난다 */}
        <LinearGradient
          colors={
            (cur.bg && cur.bg.length >= 2 ? cur.bg : ['#6C5CE7', '#4F6BFF']) as [
              string,
              string,
            ]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* 사진 — 컴포저와 같이 원본 비율(contain) 로 얹는다 */}
        {cur.image ? (
          <Image
            source={cur.image}
            style={[StyleSheet.absoluteFill, fitStyle]}
            contentFit="contain"
          />
        ) : null}

        {/* filter tint */}
        {filterFor(cur.filter).opacity > 0 && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: filterFor(cur.filter).color,
                opacity: filterFor(cur.filter).opacity,
              },
            ]}
          />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent', 'transparent', 'rgba(0,0,0,0.65)']}
          locations={[0, 0.22, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* tap zones (below header/close so those stay clickable) */}
        <Pressable style={styles.tapLeft} onPress={goPrev} />
        <Pressable style={styles.tapRight} onPress={goNext} />

        {/* decorations (text + emoji stickers) */}
        {cur.overlays?.map((o: any) => (
          <View
            key={o.id}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${o.x * 100}%`,
              top: `${o.y * 100}%`,
              maxWidth: '84%',
            }}
          >
            {o.kind === 'emoji' ? (
              <Text style={{ fontSize: o.size ?? 56 }}>{o.value}</Text>
            ) : (
              <View
                style={
                  o.highlight
                    ? {
                        backgroundColor: o.color ?? '#FFFFFF',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }
                    : undefined
                }
              >
                <Text
                  style={{
                    fontSize: o.size ?? 26,
                    fontWeight: fontFor(o.font).weight as any,
                    fontFamily: fontFor(o.font).family,
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
          </View>
        ))}

        {/* progress segments — 지금 보고 있는 사람이 올린 개수만큼 */}
        <View style={styles.segments}>
          {items.map((s: any, i: number) => (
            <View key={s.id} style={styles.segTrack}>
              <View style={[styles.segFill, { width: i <= ii ? '100%' : '0%' }]} />
            </View>
          ))}
        </View>

        {/* header */}
        <View style={styles.header} pointerEvents="box-none">
          <Pressable style={styles.authorTap} onPress={openAuthor} disabled={cur.isMine}>
            <Image source={cur.avatar} style={styles.avatar} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{cur.isMine ? '내 바이트' : cur.name}</Text>
              <Text style={styles.time}>{cur.timeLabel}</Text>
            </View>
          </Pressable>
          {/* 좋아요 — 누구나 누를 수 있다. */}
          <Pressable onPress={() => toggleBiteLike(cur.id)} hitSlop={10} style={styles.likeBtn}>
            <Ionicons
              name={cur.liked ? 'heart' : 'heart-outline'}
              size={24}
              color={cur.liked ? '#FF4D67' : colors.white}
            />
            {cur.likeCount ? <Text style={styles.likeCount}>{cur.likeCount}</Text> : null}
          </Pressable>
          {/* 내 바이트에만 수정·삭제 */}
          {cur.isMine && (
            <Pressable
              onPress={() => setMenuOpen((v) => !v)}
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.white} />
            </Pressable>
          )}
          <Pressable onPress={closeBiteViewer} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
        </View>

        {menuOpen && (
          <>
            {/* 바깥을 누르면 닫힘 — 탭 영역(넘기기)보다 위에 깔아 오작동을 막는다 */}
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
            <View style={styles.menu}>
              <Pressable style={styles.menuItem} onPress={onEdit}>
                <Ionicons name="create-outline" size={19} color={colors.textPrimary} />
                <Text style={styles.menuText}>수정</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable style={styles.menuItem} onPress={onDelete}>
                <Ionicons name="trash-outline" size={19} color={colors.coral} />
                <Text style={[styles.menuText, { color: colors.coral }]}>삭제</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* caption — 답장창이 있으면 그 위로 올린다 */}
        {cur.caption ? (
          <View
            style={[styles.captionWrap, !cur.isMine && styles.captionWrapWithReply]}
            pointerEvents="none"
          >
            <Text style={styles.caption} numberOfLines={3}>
              {cur.caption}
            </Text>
          </View>
        ) : null}

        {/* 답장 — 남의 스토리에만. 보낸 글은 작성자와의 1:1 채팅으로 간다. */}
        {!cur.isMine && (
          <View style={styles.replyBar}>
            <TextInput
              style={styles.replyInput}
              value={reply}
              onChangeText={setReply}
              placeholder={`${cur.name}님에게 답장...`}
              placeholderTextColor="rgba(255,255,255,0.6)"
              maxLength={500}
              editable={!sending}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onSubmitEditing={onReply}
              returnKeyType="send"
            />
            <Pressable
              onPress={onReply}
              disabled={!reply.trim() || sending}
              hitSlop={8}
              style={[styles.replySend, (!reply.trim() || sending) && styles.replySendOff]}
            >
              <Ionicons name="send" size={17} color="#fff" />
            </Pressable>
          </View>
        )}

        {sent ? (
          <View style={styles.sentToast} pointerEvents="none">
            <Text style={styles.sentToastText}>답장을 보냈어요</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  frame: {
    height: '100%',
    maxHeight: 900,
    backgroundColor: '#111',
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },

  tapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '35%',
    zIndex: 2,
  },
  tapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '65%',
    zIndex: 2,
  },

  segments: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    zIndex: 4,
  },
  segTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  segFill: {
    height: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    zIndex: 5,
  },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: colors.surfaceAlt,
  },
  name: {
    color: colors.white,
    fontSize: 14.5,
    fontWeight: '800',
  },
  time: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    height: 34,
    justifyContent: 'center',
  },
  likeCount: { color: colors.white, fontSize: 13, fontWeight: '800' },

  // 메뉴 — 좌/우 탭 영역(zIndex 2)보다 위에 있어야 눌린다.
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  menu: {
    position: 'absolute',
    top: 64,
    right: spacing.md,
    minWidth: 148,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingVertical: 4,
    zIndex: 9,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  menuText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.sm,
  },

  // 스토리 광고 하단 — 문구 + CTA 버튼
  adBottom: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    gap: spacing.sm,
    zIndex: 6,
  },
  adBody: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  adCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  adCtaText: { color: '#111', fontSize: 15, fontWeight: '800' },

  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['2xl'],
    zIndex: 4,
  },
  caption: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  captionWrapWithReply: {
    paddingBottom: 74, // 답장창 높이만큼 띄운다
  },

  // 답장 — 좌우 탭 영역(zIndex 2) 위에 있어야 입력이 먹는다.
  replyBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: 5,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 6,
  },
  replyInput: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 7,
    ...({ outlineStyle: 'none' } as object),
  },
  replySend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replySendOff: { opacity: 0.4 },

  sentToast: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 88,
    alignItems: 'center',
    zIndex: 7,
  },
  sentToastText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
});
