import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/feed/CommentsSheet';
import { initialAvatar, type Post, useFeed, won } from '@/context/feed';
import { useShell } from '@/context/shell';
import { useIsDesktop } from '@/hooks/use-is-desktop';
import { colors, gradients, radius, shadow, spacing } from '@/theme';

/* 게시물 상세 — 그리드에서 게시물을 눌렀을 때 열린다.
   예전에는 화면을 꽉 채우는 모달 안에 사진과 항목 나열만 있어서, 데스크탑에선
   내용이 왼쪽에 몰리고 오른쪽이 텅 비었고 작성자·댓글·찜으로 갈 길이 없었다.

   구조를 인스타그램/페이스북의 게시물 보기에 맞춘다.
     · 데스크탑 — 가운데 띄운 다이얼로그. 왼쪽 사진, 오른쪽 정보·댓글 단.
     · 모바일   — 위에서 아래로 한 줄기(작성자 → 사진 → 액션 → 본문 → 댓글).
   내용 자체는 PEED 의 영수증 성격을 유지한다(인원·결제금액·적립 PB). */

const DIALOG_MAX_W = 1040;
const SIDE_PANE_W = 400;
const PREVIEW_COMMENTS = 3;

function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, accent && styles.infoValueAccent]}>{value}</Text>
    </View>
  );
}

export function PostDetail({
  post,
  visible,
  onClose,
  onOpenMenu,
}: {
  post: Post | null;
  visible: boolean;
  onClose: () => void;
  onOpenMenu?: () => void;
}) {
  const isDesktop = useIsDesktop();
  const { toggleSave } = useFeed();
  const { viewUser } = useShell();
  const [commentsOpen, setCommentsOpen] = useState(false);

  if (!post) return null;

  const { author } = post;
  const commentCount = post.comments.length;

  const burnStrip = post.isBurning ? (
    <LinearGradient
      colors={gradients.hot}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.burnStrip}
    >
      <Text style={styles.burnStripText}>🔥 버닝 매장 인증</Text>
      <Text style={styles.burnStripPb}>+{post.earnedPb} PB</Text>
    </LinearGradient>
  ) : null;

  const authorRow = (
    <View style={styles.authorRow}>
      <TouchableOpacity
        style={styles.authorTap}
        activeOpacity={0.7}
        onPress={() => {
          if (author.isMe) return;
          // 프로필로 넘어갈 땐 상세를 닫는다 — 모달이 겹쳐 쌓이면 뒤로가기가 꼬인다.
          onClose();
          viewUser(author.id);
        }}
      >
        <Image
          source={author.avatar || initialAvatar(author.name)}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={styles.authorText}>
          <Text style={styles.authorName} numberOfLines={1}>
            {author.name}
          </Text>
          <Text style={styles.authorMeta} numberOfLines={1}>
            {author.handle} · {post.timeLabel}
          </Text>
        </View>
      </TouchableOpacity>
      {onOpenMenu && (
        <TouchableOpacity onPress={onOpenMenu} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  // 사진은 잘라내지 않고 전체를 보여준다(contain) — 상세는 '크게 확인하는' 자리다.
  const photo = post.image ? (
    <Image source={post.image} style={styles.photo} contentFit="contain" />
  ) : (
    <View style={styles.noPhoto}>
      <Ionicons name="reader-outline" size={22} color={colors.textTertiary} />
      <Text style={styles.noPhotoText}>사진 없이 남긴 리뷰</Text>
    </View>
  );

  const actions = (
    <View style={styles.actions}>
      <TouchableOpacity
        style={styles.actionBtn}
        onPress={() => setCommentsOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons name="chatbubble-outline" size={19} color={colors.textPrimary} />
        <Text style={styles.actionText}>댓글 {commentCount}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveBtn, post.saved && styles.saveBtnOn]}
        onPress={() => toggleSave(post.id)}
        activeOpacity={0.85}
      >
        <Ionicons
          name={post.saved ? 'bookmark' : 'bookmark-outline'}
          size={16}
          color={post.saved ? colors.white : colors.coralDeep}
        />
        <Text style={[styles.saveText, post.saved && styles.saveTextOn]}>
          찜 {post.saveCount}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // 스크롤 컨테이너는 화면 종류마다 달라서(데스크탑은 오른쪽 단만, 모바일은 페이지
  // 전체) 내용은 순수 View 로 두고 감싸는 쪽에서 스크롤을 준다. ScrollView 를
  // 중첩하면 세로 제스처가 서로 잡아먹는다.
  const infoBody = (
    <View style={styles.infoBody}>
      <View style={styles.titleRow}>
        <Text style={styles.store} numberOfLines={2}>
          {post.store}
        </Text>
        <View style={styles.score}>
          <Text style={styles.scoreText}>★ {Number(post.rating || 0).toFixed(1)}</Text>
        </View>
      </View>

      <Text style={styles.meta} numberOfLines={2}>
        {[post.category, post.location].filter(Boolean).join(' · ')}
      </Text>

      {post.isPrivate && (
        <View style={styles.privateChip}>
          <Ionicons name="lock-closed" size={11} color={colors.textSecondary} />
          <Text style={styles.privateChipText}>나만 보기</Text>
        </View>
      )}

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

      {post.tags.length > 0 && (
        <Text style={styles.tags}>{post.tags.map((t) => `#${t}`).join(' ')}</Text>
      )}

      <View style={styles.receipt}>
        <InfoRow label="인원" value={`${post.people}인`} />
        <InfoRow label="결제금액" value={won(post.price)} />
        <View style={styles.receiptDash} />
        <InfoRow label="PEEDBACK 적립" value={`+${post.earnedPb} PB`} accent />
      </View>

      {/* 도장 패스포트 도장 — 이 글로 도장이 찍힌 지역 */}
      {post.stampRegion ? (
        <View style={styles.stampWrap}>
          <View style={styles.stamp}>
            <Text style={styles.stampRegion} numberOfLines={1}>
              {post.stampRegion}
            </Text>
            <Text style={styles.stampWord}>도 장</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.commentsBlock}>
        <Text style={styles.commentsHead}>댓글 {commentCount}</Text>

        {commentCount === 0 ? (
          <TouchableOpacity onPress={() => setCommentsOpen(true)} activeOpacity={0.7}>
            <Text style={styles.commentsEmpty}>아직 댓글이 없어요. 첫 댓글을 남겨보세요.</Text>
          </TouchableOpacity>
        ) : (
          post.comments.slice(0, PREVIEW_COMMENTS).map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Text style={styles.commentWho} numberOfLines={1}>
                {c.userName}
              </Text>
              <Text style={styles.commentText} numberOfLines={2}>
                {c.text}
              </Text>
            </View>
          ))
        )}

        {commentCount > PREVIEW_COMMENTS && (
          <TouchableOpacity onPress={() => setCommentsOpen(true)} activeOpacity={0.7}>
            <Text style={styles.commentsMore}>댓글 {commentCount}개 모두 보기</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // 상세는 화면 정중앙에 뜨므로 댓글창도 피드 보정 없이 가운데로 맞춘다.
  const comments = (
    <CommentsSheet
      post={post}
      visible={commentsOpen}
      onClose={() => setCommentsOpen(false)}
      centered
    />
  );

  /* ------------------------------------------------------------ 데스크탑 */
  if (isDesktop) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          {/* 다이얼로그 안을 눌렀을 때 닫히지 않도록 이벤트를 여기서 멈춘다. */}
          <Pressable style={styles.dialog} onPress={() => {}}>
            {post.image && <View style={styles.photoPane}>{photo}</View>}

            <View style={[styles.sidePane, !post.image && styles.sidePaneSolo]}>
              {burnStrip}
              {authorRow}
              <View style={styles.divider} />
              <ScrollView style={styles.sideScroll} showsVerticalScrollIndicator={false}>
                {infoBody}
              </ScrollView>
              <View style={styles.divider} />
              {actions}
            </View>
          </Pressable>
        </Pressable>

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={10} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color={colors.white} />
        </TouchableOpacity>

        {comments}
      </Modal>
    );
  }

  /* -------------------------------------------------------------- 모바일 */
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.mobile} edges={['top', 'bottom']}>
        <View style={styles.mobileHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.mobileTitle}>게시물</Text>
          {onOpenMenu ? (
            <TouchableOpacity onPress={onOpenMenu} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.mobileScroll}>
          {burnStrip}
          {authorRow}
          <View style={styles.mobilePhoto}>{photo}</View>
          {actions}
          <View style={styles.divider} />
          {infoBody}
        </ScrollView>
      </SafeAreaView>

      {comments}
    </Modal>
  );
}

const styles = StyleSheet.create({
  /* ---------------------------------------------------------- 데스크탑 */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,10,20,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  dialog: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: DIALOG_MAX_W,
    height: '100%',
    maxHeight: 720,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.lifted,
  },
  // 사진 칸 — 어두운 바닥에 사진을 통째로 얹는다. 세로/가로 어느 사진이 와도
  // 잘리지 않고, 남는 자리는 배경으로 조용히 채워진다.
  photoPane: {
    flex: 1,
    backgroundColor: '#151221',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePane: {
    width: SIDE_PANE_W,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  // 사진 없는 리뷰는 사진 칸을 통째로 빼고 정보 단만 남긴다(가로로 늘리지 않는다).
  sidePaneSolo: { width: 480, borderLeftWidth: 0 },
  sideScroll: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.xl,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },

  /* ------------------------------------------------------------ 모바일 */
  mobile: { flex: 1, backgroundColor: colors.card },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  mobileTitle: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  headerSpacer: { width: 22 },
  mobileScroll: { paddingBottom: spacing['3xl'] },
  mobilePhoto: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#151221',
  },

  /* ------------------------------------------------------------- 공통 */
  burnStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  burnStripText: { color: colors.white, fontSize: 12.5, fontWeight: '900' },
  burnStripPb: { color: colors.white, fontSize: 12.5, fontWeight: '900' },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  authorTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  authorText: { flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt },
  authorName: { fontSize: 14.5, fontWeight: '800', color: colors.textPrimary },
  authorMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 1 },
  iconBtn: { padding: 4 },

  photo: { width: '100%', height: '100%' },
  noPhoto: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  noPhotoText: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },

  divider: { height: 1, backgroundColor: colors.line },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.coralDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  saveBtnOn: { backgroundColor: colors.coralDeep },
  saveText: { fontSize: 12.5, fontWeight: '800', color: colors.coralDeep },
  saveTextOn: { color: colors.white },

  infoBody: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  store: { flex: 1, fontSize: 19, fontWeight: '900', color: colors.textPrimary },
  score: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  scoreText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  meta: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, marginTop: 3 },

  privateChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  privateChipText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },

  caption: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  tags: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 6 },

  receipt: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  receiptDash: {
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: colors.lineStrong,
    marginVertical: 2,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  infoLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  infoValue: { flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  infoValueAccent: { color: colors.tangerine },

  // 도장 — 피드 카드와 같은 표식(고무도장처럼 살짝 기울인 잉크 테두리).
  stampWrap: { alignItems: 'flex-end', marginTop: spacing.md, marginRight: 4 },
  stamp: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: colors.coralDeep,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(240,66,79,0.04)',
    transform: [{ rotate: '-7deg' }],
    opacity: 0.92,
  },
  stampRegion: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, color: colors.coralDeep },
  stampWord: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.coralDeep,
    marginTop: 1,
  },

  commentsBlock: { marginTop: spacing.lg, gap: 6 },
  commentsHead: { fontSize: 13, fontWeight: '900', color: colors.textPrimary },
  commentsEmpty: { fontSize: 12.5, fontWeight: '600', color: colors.textTertiary, marginTop: 2 },
  commentRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  commentWho: { fontSize: 12.5, fontWeight: '800', color: colors.textPrimary, maxWidth: 110 },
  commentText: { flex: 1, fontSize: 12.5, fontWeight: '500', color: colors.textSecondary, lineHeight: 18 },
  commentsMore: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
});
