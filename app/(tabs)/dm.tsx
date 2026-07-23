import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { BlurBackdrop } from '@/components/ui/BlurBackdrop';
import { DmConversation, DmMember, useDm } from '@/context/dm';
import { initialAvatar, useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { useVoice } from '@/context/voice';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { colors, radius, shadow, spacing, type } from '@/theme';

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간`;
  return `${Math.floor(h / 24)}일`;
}

const convTitle = (c: DmConversation) =>
  c.isGroup
    ? c.title || c.others.map((m) => m.name).join(', ') || '그룹'
    : c.others[0]?.name || '대화';

// 그룹은 멤버 아바타 2개를 겹쳐서 표시.
function ConvAvatar({ conv, size = 52 }: { conv: DmConversation; size?: number }) {
  if (conv.isGroup && conv.others.length >= 2) {
    const s = size * 0.68;
    return (
      <View style={{ width: size, height: size }}>
        <Image source={conv.others[1].avatar} style={[stackImg(s), { right: 0, bottom: 0 }]} contentFit="cover" />
        <Image
          source={conv.others[0].avatar}
          style={[stackImg(s), { left: 0, top: 0, borderWidth: 2, borderColor: colors.bg }]}
          contentFit="cover"
        />
      </View>
    );
  }
  const src = conv.others[0]?.avatar || initialAvatar(convTitle(conv));
  return <Image source={src} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} contentFit="cover" />;
}
const stackImg = (s: number) => ({
  position: 'absolute' as const,
  width: s,
  height: s,
  borderRadius: s / 2,
  backgroundColor: colors.surfaceAlt,
});

export default function DmScreen() {
  const { posts, me } = useFeed();
  const {
    conversations,
    messages,
    openConversation,
    sendMessage,
    sendImage,
    markRead,
    startDirect,
    createGroup,
    askNotifyPermission,
  } = useDm();
  const { dmTarget, clearDmTarget, setHideTabBar, viewUser } = useShell();
  const { joinCall, activeConvId } = useVoice();
  const isDesktop = useIsDesktop();

  const CALL_MARK = '[VOICE_CALL]';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // 새 대화 상대 후보 = 팔로우한 사람 + 게시물 작성자 + 기존 대화 멤버.
  const [following, setFollowing] = useState<DmMember[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !me.id || me.id === 'me') return;
    fetch(`/api/public?action=following&uid=${encodeURIComponent(me.id)}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.users)) {
          setFollowing(
            d.users.map((u: any) => ({
              id: u.id,
              name: u.name,
              handle: u.handle,
              avatar: u.avatar ? { uri: u.avatar } : initialAvatar(u.name),
            }))
          );
        }
      })
      .catch(() => {});
  }, [me.id]);

  const candidates = useMemo(() => {
    const seen = new Set<string>([me.id]);
    const list: DmMember[] = [];
    const add = (m: DmMember) => {
      if (!m || !m.id || m.id === 'me' || seen.has(m.id)) return;
      seen.add(m.id);
      list.push(m);
    };
    for (const u of following) add(u);
    for (const p of posts) {
      if (!p.author.isMe)
        add({ id: p.author.id, name: p.author.name, handle: p.author.handle, avatar: p.author.avatar });
    }
    for (const c of conversations) for (const m of c.others) add(m);
    return list;
  }, [following, posts, conversations, me.id]);

  // 모바일: 대화방 진입 시 하단 탭바 숨김.
  useEffect(() => {
    setHideTabBar(!isDesktop && !!selectedId);
    return () => setHideTabBar(false);
  }, [isDesktop, selectedId, setHideTabBar]);

  // 프로필 '메시지' → 1:1 대화 생성 후 바로 열기.
  useEffect(() => {
    if (!dmTarget) return;
    const target = dmTarget;
    clearDmTarget();
    (async () => {
      const cid = await startDirect(target.id);
      if (cid) {
        setSelectedId(cid);
        openConversation(cid);
      }
    })();
  }, [dmTarget, startDirect, openConversation, clearDmTarget]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const msgs = selectedId ? messages[selectedId] ?? [] : [];
  const memberMap = useMemo(() => {
    const m: Record<string, DmMember> = {};
    if (selected) for (const x of selected.members) m[x.id] = x;
    return m;
  }, [selected]);

  useEffect(() => {
    if (isDesktop && !selectedId && conversations.length) setSelectedId(conversations[0].id);
  }, [isDesktop, conversations, selectedId]);

  useEffect(() => {
    if (selectedId) openConversation(selectedId);
  }, [selectedId, openConversation]);

  useEffect(() => {
    if (selectedId) markRead(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, msgs.length]);

  const send = () => {
    const t = draft.trim();
    if (!t || !selectedId) return;
    sendMessage(selectedId, t);
    setDraft('');
  };

  const pickAndSend = async () => {
    if (!selectedId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alert('사진 접근 권한이 필요합니다.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    if (!res.canceled) sendImage(selectedId, res.assets[0].uri);
  };

  // ── 새 메시지 만들기(1:1 / 그룹) ──
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, DmMember>>({});
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const pickedList = Object.values(picked);

  const openPicker = () => {
    setPicked({});
    setGroupName('');
    setSearch('');
    setPickerOpen(true);
  };
  const togglePick = (m: DmMember) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[m.id]) delete next[m.id];
      else next[m.id] = m;
      return next;
    });
  };
  const creatingRef = useRef(false);
  const createChat = async () => {
    const ids = pickedList.map((m) => m.id);
    if (ids.length === 0 || creatingRef.current) return; // 중복 생성(더블탭) 방지
    creatingRef.current = true;
    try {
      let cid: string | null = null;
      if (ids.length === 1) cid = await startDirect(ids[0]);
      else cid = await createGroup(ids, groupName.trim());
      setPickerOpen(false);
      if (cid) {
        setSelectedId(cid);
        openConversation(cid);
      }
    } finally {
      creatingRef.current = false;
    }
  };

  const searchLower = search.trim().toLowerCase();
  const pickResults = candidates.filter(
    (u) =>
      !searchLower ||
      u.name.toLowerCase().includes(searchLower) ||
      u.handle.toLowerCase().includes(searchLower)
  );

  const listHeader = (
    <View style={styles.listHead}>
      <Text style={styles.paneTitle}>메시지</Text>
      <TouchableOpacity onPress={openPicker} style={styles.composeBtn} hitSlop={8} activeOpacity={0.8}>
        <Ionicons name="create-outline" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );

  const listEl = (
    <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
      {conversations.length === 0 ? (
        <Text style={styles.emptyList}>
          아직 대화가 없어요{'\n'}오른쪽 위 ✎ 로 새 대화·단체톡을 시작해보세요
        </Text>
      ) : (
        conversations.map((c) => {
          const active = selectedId === c.id;
          const last = c.last;
          const senderPrefix = last
            ? last.fromMe
              ? '나: '
              : c.isGroup
                ? `${(memberOf(c, last.from) || {}).name?.split(' ')[0] || ''}: `
                : ''
            : '';
          return (
            <TouchableOpacity
              key={c.id}
              style={[styles.convRow, active && styles.convRowActive]}
              onPress={() => {
                askNotifyPermission();
                setSelectedId(c.id);
              }}
              activeOpacity={0.8}
            >
              <ConvAvatar conv={c} />
              <View style={{ flex: 1 }}>
                <Text style={styles.convName} numberOfLines={1}>
                  {convTitle(c)}
                  {c.isGroup ? <Text style={styles.groupCount}>  {c.members.length}</Text> : null}
                </Text>
                <Text style={[styles.convPreview, c.unread > 0 && styles.convPreviewUnread]} numberOfLines={1}>
                  {last
                    ? last.text === CALL_MARK
                      ? '📞 음성 통화'
                      : `${senderPrefix}${last.image ? '📷 사진' : last.text}`
                    : '대화를 시작해보세요'}
                </Text>
              </View>
              <View style={styles.convRight}>
                {last ? <Text style={styles.convTime}>{relTime(last.ts)}</Text> : null}
                {c.unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{c.unread > 9 ? '9+' : c.unread}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );

  const threadEl = selected ? (
    <View style={styles.thread}>
      <View style={styles.threadHeader}>
        {!isDesktop && (
          <TouchableOpacity onPress={() => setSelectedId(null)} hitSlop={8} style={{ marginRight: spacing.xs }}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.threadWho}
          activeOpacity={selected.isGroup ? 1 : 0.7}
          onPress={() => {
            const other = selected.others[0];
            if (!selected.isGroup && other) viewUser(other.id);
          }}
          disabled={selected.isGroup}
        >
          <ConvAvatar conv={selected} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.threadName} numberOfLines={1}>
              {convTitle(selected)}
            </Text>
            <Text style={styles.threadHandle} numberOfLines={1}>
              {selected.isGroup
                ? `멤버 ${selected.members.length}명`
                : selected.others[0]?.handle || ''}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.msgScroll}
        contentContainerStyle={styles.msgContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {msgs.length === 0 ? (
          <Text style={styles.emptyThread}>
            {selected.isGroup ? `${convTitle(selected)} 그룹` : `${convTitle(selected)}님`}과 대화를
            시작해보세요 👋
          </Text>
        ) : (
          msgs.map((m, i) => {
            const mine = m.fromMe;
            const sender = memberMap[m.from];
            // 음성 통화 카드 — 참여/통화중 표시.
            if (m.text === CALL_MARK) {
              const inThisCall = activeConvId === selected.id;
              return (
                <View key={m.id} style={styles.callCard}>
                  <View style={styles.callIcon}>
                    <Ionicons name="call" size={16} color={colors.white} />
                  </View>
                  <Text style={styles.callCardText}>
                    {mine ? '내가 시작한 음성 통화' : `${sender?.name || '상대'}님의 음성 통화`}
                  </Text>
                  <TouchableOpacity
                    style={[styles.callJoinBtn, inThisCall && styles.callJoinBtnOn]}
                    onPress={() => (inThisCall ? undefined : joinCall(selected.id))}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.callJoinTxt, inThisCall && { color: colors.success }]}>
                      {inThisCall ? '통화 중' : '참여'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }
            const showName =
              selected.isGroup && !mine && (i === 0 || msgs[i - 1].from !== m.from);
            return (
              <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowMe : styles.rowThem]}>
                {!mine && (
                  <Image
                    source={sender?.avatar || initialAvatar('?')}
                    style={styles.bubbleAvatar}
                    contentFit="cover"
                  />
                )}
                <View style={{ maxWidth: '100%' }}>
                  {showName && <Text style={styles.senderName}>{sender?.name || 'PEED 유저'}</Text>}
                  {m.image ? (
                    <View style={[styles.bubbleImageWrap, mine ? styles.bubbleMe : styles.bubbleThem]}>
                      <Image source={{ uri: m.image }} style={styles.bubbleImage} contentFit="cover" />
                    </View>
                  ) : (
                    <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
                      <Text style={[styles.bubbleText, mine && { color: colors.white }]}>{m.text}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.photoBtn} onPress={pickAndSend} hitSlop={6} activeOpacity={0.8}>
          <Ionicons name="image-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="메시지 보내기…"
          placeholderTextColor={colors.textTertiary}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !draft.trim() && { opacity: 0.4 }]}
          onPress={send}
          disabled={!draft.trim()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-up" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  ) : (
    <View style={styles.emptyPane}>
      <Ionicons name="chatbubbles-outline" size={44} color={colors.textTertiary} />
      <Text style={styles.emptyPaneText}>대화를 선택하세요</Text>
    </View>
  );

  const body = isDesktop ? (
    <View style={styles.desktop}>
      <View style={styles.listPane}>
        {listHeader}
        {listEl}
      </View>
      <View style={styles.threadPane}>{threadEl}</View>
    </View>
  ) : (
    <View style={styles.mobile}>
      {selectedId ? (
        threadEl
      ) : (
        <>
          {listHeader}
          {listEl}
        </>
      )}
    </View>
  );

  const isGroupPick = pickedList.length >= 2;

  return (
    <View style={{ flex: 1 }}>
      {body}

      {pickerOpen && (
        <BlurBackdrop onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHead}>
              <TouchableOpacity onPress={() => setPickerOpen(false)} style={styles.iconBtn} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.pickerTitle}>새 메시지</Text>
              <TouchableOpacity
                onPress={createChat}
                disabled={pickedList.length === 0}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Text style={[styles.nextTxt, pickedList.length === 0 && { opacity: 0.35 }]}>
                  {isGroupPick ? '만들기' : '채팅'}
                </Text>
              </TouchableOpacity>
            </View>

            {isGroupPick && (
              <TextInput
                style={styles.groupNameInput}
                placeholder="그룹 이름 (선택)"
                placeholderTextColor={colors.textTertiary}
                value={groupName}
                onChangeText={setGroupName}
                maxLength={40}
              />
            )}

            {/* 선택된 사람 칩 */}
            {pickedList.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {pickedList.map((m) => (
                  <TouchableOpacity key={m.id} style={styles.chip} onPress={() => togglePick(m)} activeOpacity={0.8}>
                    <Image source={m.avatar} style={styles.chipAvatar} contentFit="cover" />
                    <Text style={styles.chipName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Ionicons name="close-circle" size={15} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={17} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="이름 · 아이디 검색"
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>

            <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {pickResults.length === 0 ? (
                <Text style={styles.emptyList}>
                  {candidates.length === 0
                    ? '팔로우한 사람이 여기 떠요.\n먼저 사람을 팔로우해보세요.'
                    : '검색 결과가 없어요'}
                </Text>
              ) : (
                pickResults.map((u) => {
                  const on = !!picked[u.id];
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.pickRow}
                      onPress={() => togglePick(u)}
                      activeOpacity={0.8}
                    >
                      <Image source={u.avatar} style={styles.pickAvatar} contentFit="cover" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.convName} numberOfLines={1}>
                          {u.name}
                        </Text>
                        <Text style={styles.convPreview} numberOfLines={1}>
                          {u.handle}
                        </Text>
                      </View>
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>
                        {on && <Ionicons name="checkmark" size={15} color={colors.white} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </BlurBackdrop>
      )}
    </View>
  );
}

function memberOf(c: DmConversation, uid: string): DmMember | undefined {
  return c.members.find((m) => m.id === uid);
}

const styles = StyleSheet.create({
  desktop: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  mobile: { flex: 1, backgroundColor: colors.bg },
  listPane: { width: 320, borderRightWidth: 1, borderRightColor: colors.line },
  threadPane: { flex: 1 },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  paneTitle: { ...type.h2, color: colors.textPrimary },
  composeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flex: 1 },
  emptyList: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontWeight: '600',
    lineHeight: 20,
    paddingVertical: spacing['2xl'],
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  convRowActive: { backgroundColor: colors.surface },
  convName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  groupCount: { fontSize: 12, fontWeight: '700', color: colors.textTertiary },
  convPreview: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  convPreviewUnread: { color: colors.textPrimary, fontWeight: '800' },
  convRight: { alignItems: 'flex-end', gap: 5 },
  convTime: { fontSize: 12, fontWeight: '600', color: colors.textTertiary },
  unreadBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: { color: colors.white, fontSize: 11, fontWeight: '800' },

  thread: { flex: 1 },
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  threadWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  threadName: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  threadHandle: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, marginTop: 1 },
  callCard: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingLeft: 6,
    paddingRight: spacing.xs,
    paddingVertical: 5,
    ...shadow.soft,
    marginVertical: 2,
  },
  callIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callCardText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  callJoinBtn: {
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  callJoinBtnOn: { backgroundColor: '#E8FBF3' },
  callJoinTxt: { fontSize: 12.5, fontWeight: '800', color: colors.white },

  msgScroll: { flex: 1, backgroundColor: colors.surface },
  msgContent: { padding: spacing.lg, gap: spacing.sm },
  emptyThread: { textAlign: 'center', color: colors.textTertiary, fontWeight: '600', marginTop: spacing['3xl'] },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, maxWidth: '82%' },
  rowMe: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  rowThem: { alignSelf: 'flex-start' },
  bubbleAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt },
  senderName: { fontSize: 11.5, fontWeight: '700', color: colors.textTertiary, marginBottom: 3, marginLeft: 4 },
  bubble: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: colors.card, borderBottomLeftRadius: 4, ...shadow.soft },
  bubbleText: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.textPrimary },
  bubbleImageWrap: { padding: 3, borderRadius: radius.lg, overflow: 'hidden' },
  bubbleImage: { width: 210, height: 260, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  photoBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  emptyPaneText: { fontSize: 15, fontWeight: '700', color: colors.textTertiary },

  /* new-message picker */
  pickerCard: {
    width: Math.min(440, 520),
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lifted,
  },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  pickerTitle: { ...type.title, color: colors.textPrimary },
  nextTxt: { fontSize: 15, fontWeight: '800', color: colors.primary },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupNameInput: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    ...({ outlineStyle: 'none' } as object),
  },
  chipRow: { flexGrow: 0, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingLeft: 4,
    paddingRight: spacing.sm,
    paddingVertical: 3,
    marginRight: spacing.sm,
  },
  chipAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  chipName: { fontSize: 13, fontWeight: '700', color: colors.primary, maxWidth: 90 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pickAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceAlt },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
