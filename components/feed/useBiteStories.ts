import { groupStories } from '@/components/feed/biteGroups';
import type { BiteStory, BiteStoryGroup } from '@/components/feed/biteGroups';
import { useFeed } from '@/context/feed';

export type { BiteStory, BiteStoryGroup };

function relLabel(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

// 서버 바이트(내 것 + 팔로우한 사람 + 공개)를 화면이 쓰는 스토리 모양으로.
export function useBiteStories(): BiteStory[] {
  const { bites } = useFeed();

  return bites.map((b) => ({
    id: b.id,
    userId: b.author.id,
    name: b.author.name,
    avatar: b.author.avatar,
    image: b.image,
    caption: b.caption,
    timeLabel: relLabel(b.createdAt),
    createdAt: b.createdAt,
    isMine: !!b.author.isMe,
    overlays: b.overlays,
    filter: b.filter,
    bg: b.bg,
    fit: b.fit,
    likeCount: b.likeCount || 0,
    liked: !!b.liked,
  }));
}

/** 사람별로 묶은 스토리 — 트레이 한 칸, 뷰어 한 번 재생의 단위. */
export function useBiteStoryGroups(): BiteStoryGroup[] {
  return groupStories(useBiteStories());
}
