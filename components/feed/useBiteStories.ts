import { BiteOverlay, useFeed } from '@/context/feed';

// A single fullscreen story shown in the Bite viewer. Built from real server
// bites (mine + people I follow + public), newest first.
export type BiteStory = {
  id: string;
  userId: string;
  name: string;
  avatar: any;
  image?: any;
  caption: string;
  timeLabel: string;
  isMine: boolean;
  overlays?: BiteOverlay[];
  filter?: string;
  bg?: string[];
};

function relLabel(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export function useBiteStories(): BiteStory[] {
  const { bites } = useFeed();

  return bites.map((b) => ({
    id: b.id,
    userId: b.author.id,
    name: b.author.isMe ? '내 스토리' : b.author.name,
    avatar: b.author.avatar,
    image: b.image,
    caption: b.caption,
    timeLabel: relLabel(b.createdAt),
    isMine: !!b.author.isMe,
    overlays: b.overlays,
    filter: b.filter,
    bg: b.bg,
  }));
}
