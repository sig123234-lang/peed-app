import type { BiteImageFit, BiteOverlay } from '@/context/feed';

// 타입만 가져온다(런타임 의존 없음) — 그래야 이 묶음 규칙을 화면 없이 그대로
// 돌려볼 수 있다.

// A single fullscreen story shown in the Bite viewer.
export type BiteStory = {
  id: string;
  userId: string;
  name: string;
  avatar: any;
  image?: any;
  caption: string;
  timeLabel: string;
  createdAt: number;
  isMine: boolean;
  overlays?: BiteOverlay[];
  filter?: string;
  bg?: string[];
  fit?: BiteImageFit;
  likeCount?: number;
  liked?: boolean;
};

// 한 사람이 올린 스토리 묶음. 트레이는 사람당 한 칸만 띄우고, 그 칸을 누르면
// 그 사람이 올린 것들이 올린 순서대로 이어서 재생된다(인스타와 같은 방식).
export type BiteStoryGroup = {
  userId: string;
  name: string;
  avatar: any;
  isMine: boolean;
  items: BiteStory[];
  cover?: any; // 트레이 타일에 깔리는 사진 — 가장 최근 것
  coverBg?: string[]; // 사진이 하나도 없는 묶음의 대체 배경(텍스트 스토리 색)
  latestAt: number;
};

/**
 * 스토리를 올린 사람별로 묶는다.
 *
 * 순서는 내 것 먼저, 그다음 최근에 올린 사람 순. 묶음 안에서는 오래된 것부터
 * 재생한다 — 스토리는 시간 순으로 따라가야 이야기가 이어진다.
 */
export function groupStories(stories: BiteStory[]): BiteStoryGroup[] {
  const byUser = new Map<string, BiteStoryGroup>();
  for (const s of stories) {
    const g = byUser.get(s.userId);
    if (!g) {
      byUser.set(s.userId, {
        userId: s.userId,
        name: s.name,
        avatar: s.avatar,
        isMine: s.isMine,
        items: [s],
        cover: s.image,
        latestAt: s.createdAt,
      });
      continue;
    }
    g.items.push(s);
    if (s.createdAt > g.latestAt) {
      g.latestAt = s.createdAt;
      g.cover = s.image; // 표지는 가장 최근 것
    }
  }

  const groups = Array.from(byUser.values());
  for (const g of groups) {
    g.items.sort((a, b) => a.createdAt - b.createdAt); // 올린 순서대로 재생
    // 최근 것이 사진 없는 텍스트 스토리면 표지가 비어 검은 칸이 된다 —
    // 묶음 안에서 사진이 있는 가장 최근 것을 표지로 쓰고, 그것도 없으면
    // 텍스트 스토리의 배경색을 대신 깐다.
    if (!g.cover) {
      for (let i = g.items.length - 1; i >= 0; i -= 1) {
        if (g.items[i].image) {
          g.cover = g.items[i].image;
          break;
        }
      }
    }
    if (!g.cover) g.coverBg = g.items[g.items.length - 1]?.bg;
  }
  groups.sort((a, b) => {
    if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
    return b.latestAt - a.latestAt;
  });
  return groups;
}
