export interface Chapter {
  chapter: number;
  file: string;
}

export interface Book {
  id: string;
  title: string;
  folder: string;
  chapters: Chapter[];
}

export interface StoredPlayerState {
  bookId: string;
  chapterIndex: number;
  currentTime: number;
  playbackRate: number;
  updatedAt: number;
}

export type SleepTimerOption = 'off' | '15m' | '30m' | '45m' | '60m' | 'end_of_chapter';

export type PlaybackRate = 0.85 | 0.9 | 1.0 | 1.15;
