import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Post, useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import {
  APP_MAX_WIDTH,
  colors,
  radius,
  RAIL_WIDTH,
  shadow,
  SIDEBAR_WIDTH,
  spacing,
} from '@/theme';

/* 게시물 댓글 시트 — 리치 UI + @멘션(태그).
   - 댓글마다 이니셜 아바타(이름 해시 색) · 상대시간 · 작성자 탭 → 프로필.
   - 입력창에서 '@' 뒤 이름을 치면 유저 자동완성이 뜨고, 고르면 @handle 이 박힌다.
   - 본문의 @handle 은 파랗게 강조되고 눌러서 프로필로 이동한다.
   전송은 기존 addComment(낙관적 반영 + 서버 저장)를 그대로 쓴다. */

const MENTION_G = /@([A-Za-z0-9_.가-힣]+)/g; // 렌더링용(전역)
const TRAILING = /@([A-Za-z0-9_.가-힣]*)$/; // 입력 끝의 열린 @토큰(자동완성 트리거)

const AV_COLORS = [
  '#7C5CFF', '#4F6BFF', '#FF6B6B', '#FF9A5A',
  '#22C55E', '#0EA5E9', '#E23D8B', '#8B5CF6', '#F59E0B',
];
function avatarFor(name: string) {
  const n = (name || '').trim();
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return { letter: (n[0] || '?').toUpperCase(), color: AV_COLORS[h % AV_COLORS.length] };
}
function relTime(ts?: number) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60_000) return '방금';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}분`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}시간`;
  if (d < 604_800_000) return `${Math.floor(d / 86_400_000)}일`;
  return `${Math.floor(d / 604_800_000)}주`;
}

type UserHit = { id: string; name: string; handle: string; avatar?: any };

// avatar 값(URL 문자열 또는 {uri} 소스)에서 이미지 URI 를 뽑는다. 없으면 ''.
function avatarUri(avatar: any): string {
  if (!avatar) return '';
  return typeof avatar === 'string' ? avatar : avatar?.uri || '';
}

async function searchUsers(q: string): Promise<UserHit[]> {
  try {
    const r = await fetch(`/api/public?action=searchUsers&q=${encodeURIComponent(q)}`, {
      credentials: 'include',
    });
    const d = await r.json();
    return Array.isArray(d?.users) ? d.users : [];
  } catch {
    return [];
  }
}

function Avatar({ name, avatar, size = 34 }: { name: string; avatar?: any; size?: number }) {
  const uri = avatarUri(avatar);
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    // 실제 프로필 사진
    return <Image source={{ uri }} style={[styles.avatar, dim]} contentFit="cover" />;
  }
  // 프사가 없으면 이름 기반 컬러 이니셜
  const a = avatarFor(name);
  return (
    <View style={[styles.avatar, dim, { backgroundColor: a.color }]}>
      <Text style={[styles.avatarTxt, { fontSize: size * 0.44 }]}>{a.letter}</Text>
    </View>
  );
}

/** 본문의 @handle 을 파랗게 강조하고 눌러서 프로필로 보낸다. */
function CommentBody({ text, onMention }: { text: string; onMention: (h: string) => void }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_G);
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(<Text key={`t${last}`}>{text.slice(last, m.index)}</Text>);
    const handle = m[1];
    parts.push(
      <Text key={`m${m.index}`} style={styles.mention} onPress={() => onMention(handle)}>
        @{handle}
      </Text>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<Text key="end">{text.slice(last)}</Text>);
  return <Text style={styles.cmText}>{parts}</Text>;
}

export function CommentsSheet({
  post,
  visible,
  onClose,
}: {
  post: Post;
  visible: boolean;
  onClose: () => void;
}) {
  const { addComment, editComment, deleteComment, me } = useFeed();
  const { viewUser } = useShell();
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [sel, setSel] = useState({ start: 0, end: 0 }); // 커서 위치(멘션 삽입 후 맨 뒤로 보내기 위함)
  const [suggest, setSuggest] = useState<UserHit[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const handleMap = useRef<Record<string, string>>({}); // handle(소문자,@뗀) → userId
  const listRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  // 게시물 작성자는 미리 핸들→id 로 알아둔다(멘션 탭 즉시 이동).
  useEffect(() => {
    if (post.author?.handle) {
      handleMap.current[post.author.handle.replace(/^@/, '').toLowerCase()] = post.author.id;
    }
  }, [post]);

  // 입력 끝의 '@토큰' 을 자동완성 쿼리로 쓴다(가장 흔한 '치는 중' 케이스).
  const activeQuery = useMemo(() => {
    const m = draft.match(TRAILING);
    return m ? m[1] : null; // null = 멘션 입력 중 아님
  }, [draft]);

  useEffect(() => {
    if (activeQuery === null || activeQuery.length < 1) {
      setSuggest([]);
      setLoadingSug(false);
      return;
    }
    let alive = true;
    setLoadingSug(true);
    const t = setTimeout(async () => {
      const users = await searchUsers(activeQuery);
      if (!alive) return;
      users.forEach((u) => {
        handleMap.current[(u.handle || '').replace(/^@/, '').toLowerCase()] = u.id;
      });
      setSuggest(users.slice(0, 5));
      setLoadingSug(false);
    }, 160);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [activeQuery]);

  const pickMention = useCallback(
    (u: UserHit) => {
      const h = u.handle?.startsWith('@') ? u.handle : `@${u.handle}`;
      // TRAILING 은 항상 문자열 끝의 @토큰만 잡으므로, 넣은 뒤 커서는 맨 뒤가 맞다.
      const next = draft.replace(TRAILING, `${h} `);
      setDraft(next);
      setSel({ start: next.length, end: next.length });
      handleMap.current[(u.handle || '').replace(/^@/, '').toLowerCase()] = u.id;
      setSuggest([]);
      // 커서는 controlled selection 으로 방금 넣은 @handle 뒤에 놓인다.
      // (여기서 강제 focus 를 하면 focus 이벤트가 selection 을 0 으로 되돌려 버린다.)
    },
    [draft]
  );

  const openMention = useCallback(
    async (handle: string) => {
      const key = handle.toLowerCase();
      const cached = handleMap.current[key];
      if (cached) {
        onClose();
        viewUser(cached);
        return;
      }
      const hits = await searchUsers(handle);
      const exact =
        hits.find((h) => (h.handle || '').replace(/^@/, '').toLowerCase() === key) || hits[0];
      if (exact) {
        onClose();
        viewUser(exact.id);
      }
    },
    [onClose, viewUser]
  );

  const submit = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    addComment(post.id, t);
    setDraft('');
    setSel({ start: 0, end: 0 });
    setSuggest([]);
    // 새 댓글이 보이도록 아래로.
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [draft, addComment, post.id]);

  const openAuthor = (userId?: string) => {
    if (!userId) return;
    onClose();
    viewUser(userId);
  };

  const startEdit = (c: { id: string; text: string }) => {
    setEditingId(c.id);
    setEditText(c.text);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };
  const saveEdit = () => {
    const t = editText.trim();
    if (t && editingId) editComment(post.id, editingId, t);
    setEditingId(null);
    setEditText('');
  };
  const confirmDelete = (id: string) => {
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('이 댓글을 삭제할까요?')
        : true;
    if (ok) deleteComment(post.id, id);
  };

  const count = post.comments.length;

  if (!visible) return null;

  const sheetCard = (
          <TouchableOpacity
            style={[
              styles.sheet,
              isDesktop && styles.sheetDesktop,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
            activeOpacity={1}
            onPress={() => {}}
          >
            {/* 드래그 핸들은 바닥에서 끌어올리는 모바일 시트의 표식이다.
                데스크탑에선 떠 있는 카드라 의미가 없어 감춘다. */}
            {!isDesktop && <View style={styles.handle} />}
            <Text style={styles.title}>댓글 {count > 0 ? count : ''}</Text>

            <ScrollView
              ref={listRef}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {count === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyEmoji}>💬</Text>
                  <Text style={styles.emptyTitle}>아직 댓글이 없어요</Text>
                  <Text style={styles.emptySub}>첫 댓글을 남겨보세요! @로 친구도 태그할 수 있어요.</Text>
                </View>
              ) : (
                post.comments.map((c) => {
                  const isMine = !!c.userId && c.userId === me.id;
                  const editing = editingId === c.id;
                  return (
                    <View key={c.id} style={styles.row}>
                      <TouchableOpacity disabled={!c.userId} onPress={() => openAuthor(c.userId)}>
                        <Avatar name={c.userName} avatar={c.avatar} />
                      </TouchableOpacity>
                      <View style={styles.body}>
                        <View style={styles.metaRow}>
                          <TouchableOpacity disabled={!c.userId} onPress={() => openAuthor(c.userId)}>
                            <Text style={styles.user}>{c.userName}</Text>
                          </TouchableOpacity>
                          {c.ts ? <Text style={styles.time}>· {relTime(c.ts)}</Text> : null}
                        </View>

                        {editing ? (
                          <View style={styles.editWrap}>
                            <TextInput
                              value={editText}
                              onChangeText={setEditText}
                              style={styles.editInput}
                              multiline
                              autoFocus
                            />
                            <View style={styles.editBtns}>
                              <TouchableOpacity onPress={cancelEdit} hitSlop={6}>
                                <Text style={styles.editCancel}>취소</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={saveEdit} hitSlop={6}>
                                <Text style={styles.editSave}>저장</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <>
                            <CommentBody text={c.text} onMention={openMention} />
                            {isMine ? (
                              <View style={styles.ownActions}>
                                <TouchableOpacity onPress={() => startEdit(c)} hitSlop={6}>
                                  <Text style={styles.ownAction}>수정</Text>
                                </TouchableOpacity>
                                <Text style={styles.ownDot}>·</Text>
                                <TouchableOpacity onPress={() => confirmDelete(c.id)} hitSlop={6}>
                                  <Text style={styles.ownActionDanger}>삭제</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* @멘션 자동완성 */}
            {activeQuery !== null && (loadingSug || suggest.length > 0) && (
              <View style={styles.sugBox}>
                {loadingSug && suggest.length === 0 ? (
                  <View style={styles.sugLoading}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.sugLoadingTxt}>친구 찾는 중…</Text>
                  </View>
                ) : (
                  suggest.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.sugRow}
                      onPress={() => pickMention(u)}
                      activeOpacity={0.7}
                    >
                      <Avatar name={u.name} avatar={u.avatar} size={28} />
                      <View style={styles.sugInfo}>
                        <Text style={styles.sugName} numberOfLines={1}>{u.name}</Text>
                        <Text style={styles.sugHandle} numberOfLines={1}>{u.handle}</Text>
                      </View>
                      <Ionicons name="at" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            <View style={styles.inputRow}>
              <Avatar name={me.name} avatar={me.avatar} size={30} />
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                selection={sel}
                onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
                placeholder="댓글 달기…  @로 친구 태그"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                multiline
                onSubmitEditing={submit}
                returnKeyType="send"
                blurOnSubmit
              />
              <TouchableOpacity
                onPress={submit}
                disabled={!draft.trim()}
                style={[styles.send, !draft.trim() && styles.sendOff]}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-up" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
  );

  // 웹: 커스텀 하단 네비(position:absolute, zIndex 999) 위로 확실히 올리기 위해
  // <body> 로 포털해 zIndex 1000 을 준다. 시트는 화면 맨 아래에 앵커링해 입력창이
  // 바닥에 딱 붙게 한다(예전 RN Modal 은 zIndex 0 으로 깔리고 flex 로 인해 아래가
  // 떠 보였다).
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const createPortal = require('react-dom').createPortal as (c: ReactNode, el: Element) => any;
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheetAnchor, isDesktop && styles.sheetAnchorDesktop]}>
          {sheetCard}
        </View>
      </div>,
      document.body
    );
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          {sheetCard}
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,12,20,0.45)', justifyContent: 'flex-end' },
  backdropFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,12,20,0.45)' },
  sheetAnchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // 데스크탑에선 앵커가 화면 폭 전체라 시트도 좌우로 늘어졌다. 가운데로 모은다.
  sheetAnchorDesktop: { alignItems: 'center' },
  kav: { width: '100%' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // paddingBottom 은 세이프에어리어(제스처바) 만큼 인라인으로 준다.
    maxHeight: '88%',
    ...shadow.lifted,
  },
  // 데스크탑 — 바닥에 붙은 시트가 아니라 떠 있는 카드로. 네 모서리를 모두
  // 둥글린다(바닥에 붙지 않으므로 아래 모서리만 각지면 어색하다).
  //
  // 위치는 게시글 카드에 정확히 맞춘다. 이 시트는 <body> 로 포털돼 화면 좌표를
  // 쓰는데, 피드는 3단 레이아웃의 가운데 칼럼(사이드바·레일을 뺀 나머지) 안에서
  // 가운데 정렬되므로 화면 중심보다 (RAIL_WIDTH - SIDEBAR_WIDTH) / 2 만큼 왼쪽에
  // 있다. 그냥 화면 가운데에 두면 댓글창만 오른쪽으로 밀려 보인다.
  // 가운데 정렬된 박스에 마진을 주면 중심이 그 절반만큼 움직인다 → 마진 하나로
  // 기준선이 맞는다. 폭도 카드 거터(spacing.md)를 뺀 실제 카드 폭에 맞춘다.
  sheetDesktop: {
    width: '100%',
    maxWidth: APP_MAX_WIDTH - spacing.md * 2,
    marginRight: RAIL_WIDTH - SIDEBAR_WIDTH,
    borderRadius: radius.xl,
    marginBottom: spacing.lg,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  list: { maxHeight: 480 },
  listContent: { paddingVertical: spacing.sm, gap: spacing.lg },

  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '900' },
  body: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  user: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary },
  time: { fontSize: 12, fontWeight: '600', color: colors.textTertiary },
  cmText: { fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  mention: { color: colors.primary, fontWeight: '800' },

  ownActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  ownAction: { fontSize: 12, fontWeight: '800', color: colors.textTertiary },
  ownActionDanger: { fontSize: 12, fontWeight: '800', color: colors.danger },
  ownDot: { fontSize: 12, color: colors.textTertiary },

  editWrap: { gap: 6, marginTop: 2 },
  editInput: {
    minHeight: 38,
    maxHeight: 120,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  editBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  editCancel: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  editSave: { fontSize: 13, fontWeight: '900', color: colors.primary },

  empty: { alignItems: 'center', paddingVertical: spacing['2xl'], gap: 6 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  emptySub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 19,
  },

  sugBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 6,
    marginBottom: spacing.sm,
    gap: 2,
  },
  sugLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm },
  sugLoadingTxt: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  sugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  sugInfo: { flex: 1 },
  sugName: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary },
  sugHandle: { fontSize: 12, fontWeight: '600', color: colors.textTertiary },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
    ...({ outlineStyle: 'none' } as object),
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: colors.textTertiary, opacity: 0.5 },
});
