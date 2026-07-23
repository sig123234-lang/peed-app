import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Post, useFeed } from '@/context/feed';
import { useShell } from '@/context/shell';
import { colors, gradients, mono, radius, shadow, spacing } from '@/theme';

/** ₩12,345 style, Hermes-safe (no Intl). */
const money = (n: number) =>
  `₩${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Stable pseudo receipt number derived from the post id. */
const receiptNo = (id: string) => {
  let digits = '';
  for (let i = 0; i < id.length; i++) digits += id.charCodeAt(i).toString();
  digits = (digits + '00000000').slice(0, 6);
  return `2026-${digits.slice(0, 2)}-${digits.slice(2, 6)}`;
};

function ScoreChip({ rating }: { rating: number }) {
  return (
    <LinearGradient
      colors={gradients.brandDiagonal}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.scoreChip}
    >
      <Text style={styles.scoreStar}>★</Text>
      <Text style={styles.scoreText}>{rating.toFixed(1)}</Text>
    </LinearGradient>
  );
}

function Barcode({ id }: { id: string }) {
  const src = (id + 'PEEDBACK').repeat(4);
  const bars = Array.from({ length: 30 }, (_, i) => {
    const c = src.charCodeAt(i % src.length) + i * 7;
    return { w: (c % 3) + 1, on: c % 4 !== 0 };
  });
  return (
    <View style={styles.barcode}>
      {bars.map((b, i) => (
        <View
          key={i}
          style={{
            width: b.w,
            height: 22,
            backgroundColor: b.on ? colors.paperInk : 'transparent',
            marginRight: 1.5,
          }}
        />
      ))}
    </View>
  );
}

function ReceiptRow({
  label,
  value,
  emphasize,
  accent,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  accent?: string;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.rLabel, emphasize && styles.rLabelStrong]}>
        {label}
      </Text>
      <View style={styles.leader} />
      <Text
        style={[
          styles.rValue,
          emphasize && styles.rValueStrong,
          accent ? { color: accent } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { toggleSave, toggleFollow, addComment } = useFeed();
  const { viewUser } = useShell();
  const { author } = post;
  const showFollow = !author.isMe;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const submitComment = () => {
    const t = draft.trim();
    if (!t) return;
    addComment(post.id, t);
    setDraft('');
  };

  return (
    <View style={[styles.card, post.isBurning && styles.cardBurning]}>
      {post.isBurning && (
        <LinearGradient
          colors={gradients.hot}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.burnStrip}
        >
          <Text style={styles.burnStripText}>🔥 버닝 매장 인증</Text>
          <Text style={styles.burnStripPb}>+{post.earnedPb} PB</Text>
        </LinearGradient>
      )}

      {/* compact receipt header */}
      <View style={styles.header}>
        <Text style={styles.kicker}>★ PEED REVIEW RECEIPT ★</Text>
        <View style={styles.merchantRow}>
          <Text style={styles.merchant} numberOfLines={1}>
            {post.store}
          </Text>
          <ScoreChip rating={post.rating} />
        </View>
        <Text style={styles.meta}>
          {post.category} · {post.location} · NO.{receiptNo(post.id)}
        </Text>
      </View>

      <View style={styles.dashedBold} />

      {/* author (compact single row) */}
      <View style={styles.authorRow}>
        <TouchableOpacity
          style={styles.authorTap}
          activeOpacity={0.7}
          onPress={() => !author.isMe && viewUser(author.id)}
        >
          <Image source={author.avatar} style={styles.avatar} contentFit="cover" />
          <Text style={styles.authorName}>{author.name}</Text>
          <Text style={styles.authorHandle} numberOfLines={1}>
            {author.handle} · {post.timeLabel}
          </Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {showFollow && (
          <TouchableOpacity
            onPress={() => toggleFollow(author.id)}
            style={[styles.followBtn, author.isFollowing && styles.followingBtn]}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.followText,
                author.isFollowing && styles.followingText,
              ]}
            >
              {author.isFollowing ? '팔로잉' : '팔로우'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* the dish */}
      <Image source={post.image} style={styles.photo} contentFit="cover" />

      {/* caption */}
      <View style={styles.captionWrap}>
        <Text style={styles.caption} numberOfLines={2}>
          {post.caption}
        </Text>
        {post.tags.length > 0 && (
          <Text style={styles.tags} numberOfLines={1}>
            {post.tags.map((t) => `#${t}`).join(' ')}
          </Text>
        )}
      </View>

      {/* transaction lines (trimmed) */}
      <View style={styles.receipt}>
        <ReceiptRow label="인원" value={`${post.people}인`} />
        <View style={styles.dashedBold} />
        <ReceiptRow label="합 계" value={money(post.price)} emphasize />
      </View>

      <Perforation />

      {/* barcode + actions */}
      <Barcode id={post.id} />
      <Text style={styles.barNo}>감사합니다 :) · NO.{receiptNo(post.id)}</Text>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.commentBtn}
          onPress={() => setCommentsOpen(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.textSecondary}
          />
          <Text style={styles.commentCount}>{post.comments.length}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => toggleSave(post.id)}
          style={[styles.saveBtn, post.saved && styles.saveBtnActive]}
          activeOpacity={0.85}
        >
          <Ionicons
            name={post.saved ? 'bookmark' : 'bookmark-outline'}
            size={15}
            color={post.saved ? colors.white : colors.coralDeep}
          />
          <Text style={[styles.saveText, post.saved && styles.saveTextActive]}>
            찜 {post.saveCount}
          </Text>
        </TouchableOpacity>
      </View>

      {/* comments */}
      <Modal
        visible={commentsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCommentsOpen(false)}
      >
        <TouchableOpacity
          style={styles.cmBackdrop}
          activeOpacity={1}
          onPress={() => setCommentsOpen(false)}
        >
          <TouchableOpacity style={styles.cmSheet} activeOpacity={1}>
            <View style={styles.cmHandle} />
            <Text style={styles.cmTitle}>댓글 {post.comments.length}</Text>

            <View style={styles.cmList}>
              {post.comments.length === 0 ? (
                <Text style={styles.cmEmpty}>첫 댓글을 남겨보세요!</Text>
              ) : (
                post.comments.map((c) => (
                  <View key={c.id} style={styles.cmRow}>
                    <Text style={styles.cmUser}>{c.userName}</Text>
                    <Text style={styles.cmText}>{c.text}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.cmInputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="댓글 달기…"
                placeholderTextColor={colors.textTertiary}
                style={styles.cmInput}
                onSubmitEditing={submitComment}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={submitComment} style={styles.cmSend} activeOpacity={0.8}>
                <Ionicons name="arrow-up" size={18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Perforation() {
  return (
    <View style={styles.perfWrap}>
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={styles.perfLine} />
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

const CARD_PAD = spacing.lg;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#EFE8D8',
    ...shadow.soft,
  },
  cardBurning: {
    borderWidth: 1.5,
    borderColor: '#FFD7D7',
  },

  /* burning strip */
  burnStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PAD,
    paddingVertical: spacing.sm,
  },
  burnStripText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  burnStripPb: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },

  /* header */
  header: {
    alignItems: 'center',
    paddingHorizontal: CARD_PAD,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  kicker: {
    fontFamily: mono,
    fontSize: 10.5,
    letterSpacing: 1,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 6,
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  merchant: {
    fontFamily: mono,
    fontSize: 19,
    fontWeight: '800',
    color: colors.paperInk,
    letterSpacing: 0.3,
  },
  meta: {
    fontFamily: mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
  },

  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  scoreStar: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '800',
  },
  scoreText: {
    color: colors.white,
    fontSize: 12.5,
    fontWeight: '800',
  },

  dashedBold: {
    marginHorizontal: CARD_PAD,
    marginVertical: spacing.sm,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },

  /* author */
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CARD_PAD,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  authorTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
  },
  authorName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.paperInk,
  },
  authorHandle: {
    fontFamily: mono,
    fontSize: 11,
    color: colors.textTertiary,
  },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  followingBtn: {
    backgroundColor: colors.surfaceAlt,
  },
  followText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  followingText: {
    color: colors.textSecondary,
  },

  /* photo */
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.md,
  },

  /* caption */
  captionWrap: {
    paddingHorizontal: CARD_PAD,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.paperInk,
    fontWeight: '500',
  },
  tags: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 4,
  },

  /* receipt lines */
  receipt: {
    paddingHorizontal: CARD_PAD,
    paddingTop: spacing.sm,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 2,
  },
  rLabel: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.textSecondary,
  },
  rLabelStrong: {
    fontSize: 13.5,
    color: colors.paperInk,
    fontWeight: '800',
  },
  leader: {
    flex: 1,
    marginHorizontal: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },
  rValue: {
    fontFamily: mono,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.paperInk,
  },
  rValueStrong: {
    fontSize: 16,
    fontWeight: '800',
  },

  /* perforation */
  perfWrap: {
    height: 16,
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  perfLine: {
    marginHorizontal: 14,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
  },
  notch: {
    position: 'absolute',
    top: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surface,
  },
  notchLeft: {
    left: -9,
  },
  notchRight: {
    right: -9,
  },

  /* barcode */
  barcode: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: CARD_PAD,
    marginBottom: 5,
  },
  barNo: {
    fontFamily: mono,
    fontSize: 10.5,
    letterSpacing: 0.5,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  /* actions */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    paddingHorizontal: CARD_PAD,
  },
  commentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentCount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.coralSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  saveBtnActive: {
    backgroundColor: colors.coral,
  },
  saveText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.coralDeep,
  },
  saveTextActive: {
    color: colors.white,
  },

  /* comments modal */
  cmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,18,34,0.45)',
    justifyContent: 'flex-end',
  },
  cmSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
    maxHeight: '75%',
  },
  cmHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: spacing.md,
  },
  cmTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  cmList: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  cmEmpty: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  cmRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  cmUser: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cmText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 19,
  },
  cmInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  cmInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cmSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
