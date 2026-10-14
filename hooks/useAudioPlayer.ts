'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Book, Chapter, StoredPlayerState, SleepTimerOption, PlaybackRate } from '../types';

const STORAGE_KEY = 'bible_player_state';
const SAVE_INTERVAL_MS = 2000;

function getAudioUrl(folder: string, file: string): string {
  const envBase = process.env.NEXT_PUBLIC_AUDIO_BASE_URL?.trim();
  let base = envBase || 'https://gabbalb.github.io/PlayerBibbia/Bibbia/Bibbia%20mp3%20Interconfessionale%20-%20Copia';
  let cleanBase = base.replace(/\/+$/, '');

  // If the user provided just the repository URL https://gabbalb.github.io/PlayerBibbia
  if (cleanBase.endsWith('/PlayerBibbia')) {
    cleanBase = `${cleanBase}/Bibbia/Bibbia%20mp3%20Interconfessionale%20-%20Copia`;
  }

  // Ensure any raw spaces in the base URL are properly encoded
  cleanBase = cleanBase.replace(/ /g, '%20');

  return `${cleanBase}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
}

export function useAudioPlayer() {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBookIndex, setCurrentBookIndex] = useState<number>(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sleep Timer state
  const [sleepTimerOption, setSleepTimerOption] = useState<SleepTimerOption>('off');
  const [sleepTimerSecondsLeft, setSleepTimerSecondsLeft] = useState<number | null>(null);

  // Single global HTMLAudioElement ref
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const sleepTimerEndRef = useRef<number | null>(null);
  const isFadingOutRef = useRef<boolean>(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Persistent references to latest state to avoid stale closures in event listeners
  const stateRef = useRef({
    books,
    currentBookIndex,
    currentChapterIndex,
    currentTime,
    duration,
    playbackRate,
    isPlaying,
    sleepTimerOption,
  });

  useEffect(() => {
    stateRef.current = {
      books,
      currentBookIndex,
      currentChapterIndex,
      currentTime,
      duration,
      playbackRate,
      isPlaying,
      sleepTimerOption,
    };
  }, [books, currentBookIndex, currentChapterIndex, currentTime, duration, playbackRate, isPlaying, sleepTimerOption]);

  // Save state immediately to localStorage
  const saveStateToStorage = useCallback((exactTime?: number) => {
    const { books, currentBookIndex, currentChapterIndex, playbackRate, currentTime: storedTime } = stateRef.current;
    if (!books.length || !books[currentBookIndex]) return;

    const book = books[currentBookIndex];
    const timeToSave = exactTime !== undefined ? exactTime : storedTime;

    const stateToSave: StoredPlayerState = {
      bookId: book.id,
      chapterIndex: currentChapterIndex,
      currentTime: Math.floor(timeToSave),
      playbackRate,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch {
      // Silently catch quota or privacy mode errors
    }
  }, []);

  // Screen Wake Lock helper
  const acquireWakeLock = useCallback(async () => {
    if (typeof window === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      if (!wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Silently ignore wake lock failures
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Silently ignore
      }
      wakeLockRef.current = null;
    }
  }, []);

  // Update Media Session Lock Screen Metadata
  const updateMediaSessionMetadata = useCallback((book: Book, chapter: Chapter) => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Capitolo ${chapter.chapter}`,
        artist: book.title,
        album: 'Bibbia Audio',
        artwork: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      });
    } catch {
      // Silently catch unsupported metadata attributes
    }
  }, []);

  // Sync Media Session Lock Screen position state
  const syncMediaSessionPosition = useCallback((audio: HTMLAudioElement) => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) {
      return;
    }

    if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.min(Math.max(0, audio.currentTime), audio.duration),
        });
      } catch {
        // Ignore rapid position state errors
      }
    }
  }, []);

  // Perform sleep timer fade-out completion
  const completeSleepTimer = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setIsPlaying(false);

    // Smooth rewind by 10 seconds so listener resumes where consciousness faded
    const targetRewindTime = Math.max(0, audio.currentTime - 10);
    audio.currentTime = targetRewindTime;
    setCurrentTime(targetRewindTime);

    // Restore volume for next session
    audio.volume = 1.0;
    isFadingOutRef.current = false;

    // Reset sleep timer state
    setSleepTimerOption('off');
    setSleepTimerSecondsLeft(null);
    sleepTimerEndRef.current = null;

    saveStateToStorage(targetRewindTime);
    releaseWakeLock();
  }, [saveStateToStorage, releaseWakeLock]);

  // Setup single HTMLAudioElement once on client mount
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const handlePlay = () => {
      setIsPlaying(true);
      acquireWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
      releaseWakeLock();
      saveStateToStorage();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    };

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);

      // Debounced write to localStorage every 2 seconds during active playback
      const now = Date.now();
      if (now - lastSaveTimeRef.current >= SAVE_INTERVAL_MS) {
        lastSaveTimeRef.current = now;
        saveStateToStorage(time);
        syncMediaSessionPosition(audio);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      syncMediaSessionPosition(audio);
    };

    const handleDurationChange = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
        syncMediaSessionPosition(audio);
      }
    };

    // Stalled / Network error retry logic
    const handleNetworkRetry = () => {
      if (audio.paused) return;
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

      retryTimeoutRef.current = setTimeout(() => {
        const resumeTime = audio.currentTime;
        audio.load();
        audio.currentTime = resumeTime;
        audio.play().catch(() => {});
      }, 3000);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('waiting', handleNetworkRetry);
    audio.addEventListener('stalled', handleNetworkRetry);
    audio.addEventListener('error', handleNetworkRetry);
    audio.addEventListener('canplay', handleCanPlay);

    // Save state on tab hidden / background / close
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveStateToStorage();
      } else if (document.visibilityState === 'visible' && !audio.paused) {
        acquireWakeLock();
      }
    };

    const handlePageHide = () => {
      saveStateToStorage();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      audio.pause();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('waiting', handleNetworkRetry);
      audio.removeEventListener('stalled', handleNetworkRetry);
      audio.removeEventListener('error', handleNetworkRetry);
      audio.removeEventListener('canplay', handleCanPlay);

      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);

      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      releaseWakeLock();
    };
  }, [acquireWakeLock, releaseWakeLock, saveStateToStorage, syncMediaSessionPosition]);

  // Load manifest & initialize cold start state
  useEffect(() => {
    let isCancelled = false;

    async function loadManifestAndRestoreState() {
      try {
        const res = await fetch('/manifest.json');
        if (!res.ok) throw new Error('Manifest not found');
        const manifestBooks: Book[] = await res.json();

        if (isCancelled || !manifestBooks.length) return;

        setBooks(manifestBooks);

        // Read saved state from localStorage
        let savedBookIndex = 0;
        let savedChapterIndex = 0;
        let savedTime = 0;
        let savedRate: PlaybackRate = 1.0;

        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed: StoredPlayerState = JSON.parse(raw);
            const foundBookIdx = manifestBooks.findIndex((b) => b.id === parsed.bookId);
            if (foundBookIdx !== -1) {
              savedBookIndex = foundBookIdx;
              const targetBook = manifestBooks[foundBookIdx];
              if (parsed.chapterIndex >= 0 && parsed.chapterIndex < targetBook.chapters.length) {
                savedChapterIndex = parsed.chapterIndex;
              }
            }
            if (typeof parsed.currentTime === 'number' && parsed.currentTime >= 0) {
              savedTime = parsed.currentTime;
            }
            if ([0.85, 0.9, 1.0, 1.15].includes(parsed.playbackRate)) {
              savedRate = parsed.playbackRate as PlaybackRate;
            }
          }
        } catch {
          // Ignore parse errors
        }

        setCurrentBookIndex(savedBookIndex);
        setCurrentChapterIndex(savedChapterIndex);
        setPlaybackRateState(savedRate);
        setCurrentTime(savedTime);

        const initialBook = manifestBooks[savedBookIndex];
        const initialChapter = initialBook.chapters[savedChapterIndex];

        if (audioRef.current && initialBook && initialChapter) {
          const audio = audioRef.current;
          audio.src = getAudioUrl(initialBook.folder, initialChapter.file);
          audio.playbackRate = savedRate;

          // Set starting position once metadata is ready
          const onInitMetadata = () => {
            if (savedTime > 0 && savedTime < audio.duration) {
              audio.currentTime = savedTime;
              setCurrentTime(savedTime);
            }
            audio.removeEventListener('loadedmetadata', onInitMetadata);
          };
          audio.addEventListener('loadedmetadata', onInitMetadata);
          updateMediaSessionMetadata(initialBook, initialChapter);
        }
      } catch (err) {
        console.error('Failed to load bible manifest:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadManifestAndRestoreState();

    return () => {
      isCancelled = true;
    };
  }, [updateMediaSessionMetadata]);

  // Navigate to specific book and chapter
  const loadTrack = useCallback((bookIdx: number, chapIdx: number, shouldPlay: boolean = false, startTime: number = 0) => {
    const currentBooks = stateRef.current.books;
    if (!currentBooks.length || !currentBooks[bookIdx]) return;

    const targetBook = currentBooks[bookIdx];
    const targetChapter = targetBook.chapters[chapIdx];
    if (!targetChapter) return;

    const audio = audioRef.current;
    if (!audio) return;

    setIsLoading(true);
    setCurrentBookIndex(bookIdx);
    setCurrentChapterIndex(chapIdx);
    setCurrentTime(startTime);

    // Single HTMLAudioElement reuse: mutate .src directly
    const nextUrl = getAudioUrl(targetBook.folder, targetChapter.file);
    audio.src = nextUrl;
    audio.playbackRate = stateRef.current.playbackRate;
    audio.volume = 1.0;
    isFadingOutRef.current = false;

    updateMediaSessionMetadata(targetBook, targetChapter);

    const onReadyToPlay = () => {
      if (startTime > 0) {
        audio.currentTime = startTime;
      }
      if (shouldPlay) {
        audio.play().catch(() => {
          setIsPlaying(false);
        });
      }
      audio.removeEventListener('canplay', onReadyToPlay);
    };

    audio.addEventListener('canplay', onReadyToPlay);
    saveStateToStorage(startTime);
  }, [updateMediaSessionMetadata, saveStateToStorage]);

  // Advance to next chapter (or Book N+1, Chapter 1)
  const nextTrack = useCallback((autoPlay: boolean = true) => {
    const { books, currentBookIndex, currentChapterIndex } = stateRef.current;
    if (!books.length) return;

    const currentBook = books[currentBookIndex];
    if (currentChapterIndex + 1 < currentBook.chapters.length) {
      loadTrack(currentBookIndex, currentChapterIndex + 1, autoPlay, 0);
    } else if (currentBookIndex + 1 < books.length) {
      // Advance to next book
      loadTrack(currentBookIndex + 1, 0, autoPlay, 0);
    } else {
      // End of Bible reached, loop back to start or pause
      loadTrack(0, 0, false, 0);
    }
  }, [loadTrack]);

  // Go to previous chapter (or restart current chapter if > 3 seconds in)
  const previousTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    const { books, currentBookIndex, currentChapterIndex } = stateRef.current;
    if (!books.length) return;

    if (currentChapterIndex > 0) {
      loadTrack(currentBookIndex, currentChapterIndex - 1, stateRef.current.isPlaying, 0);
    } else if (currentBookIndex > 0) {
      const prevBook = books[currentBookIndex - 1];
      loadTrack(currentBookIndex - 1, prevBook.chapters.length - 1, stateRef.current.isPlaying, 0);
    } else {
      // Already at first chapter
      if (audio) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }
    }
  }, [loadTrack]);

  // Bind audio ended listener to handle auto-advance or sleep timer 'end_of_chapter'
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      const { sleepTimerOption } = stateRef.current;
      if (sleepTimerOption === 'end_of_chapter') {
        completeSleepTimer();
      } else {
        nextTrack(true);
      }
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [completeSleepTimer, nextTrack]);

  // Media Session action handlers
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const offset = details.seekOffset || 15;
        if (audioRef.current) {
          const target = Math.max(0, audioRef.current.currentTime - offset);
          audioRef.current.currentTime = target;
          setCurrentTime(target);
        }
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const offset = details.seekOffset || 15;
        if (audioRef.current) {
          const target = Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + offset);
          audioRef.current.currentTime = target;
          setCurrentTime(target);
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        previousTrack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        nextTrack(true);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (audioRef.current && details.seekTime !== undefined) {
          audioRef.current.currentTime = details.seekTime;
          setCurrentTime(details.seekTime);
        }
      });
    } catch {
      // Catch unsupported action handlers gracefully
    }
  }, [nextTrack, previousTrack]);

  // Sleep Timer Countdown & Smooth 10s Fade-Out Effect
  useEffect(() => {
    if (sleepTimerOption === 'off') {
      setSleepTimerSecondsLeft(null);
      sleepTimerEndRef.current = null;
      if (audioRef.current) {
        audioRef.current.volume = 1.0;
      }
      isFadingOutRef.current = false;
      return;
    }

    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;

      let remainingSec = 0;

      if (sleepTimerOption === 'end_of_chapter') {
        const d = audio.duration || 0;
        const c = audio.currentTime || 0;
        remainingSec = Math.max(0, Math.ceil(d - c));
      } else if (sleepTimerEndRef.current) {
        const diffMs = sleepTimerEndRef.current - Date.now();
        remainingSec = Math.max(0, Math.ceil(diffMs / 1000));
      }

      setSleepTimerSecondsLeft(remainingSec);

      // Smooth fade-out in the last 10 seconds
      if (remainingSec <= 10 && remainingSec > 0) {
        isFadingOutRef.current = true;
        const volumeFactor = Math.max(0, remainingSec / 10);
        audio.volume = volumeFactor;
      } else if (remainingSec > 10) {
        if (audio.volume < 1.0) {
          audio.volume = 1.0;
        }
        isFadingOutRef.current = false;
      }

      // Timer expired
      if (remainingSec === 0) {
        completeSleepTimer();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [sleepTimerOption, completeSleepTimer]);

  // User Actions
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      if (!audio.src || audio.src === window.location.href) {
        const { books, currentBookIndex, currentChapterIndex } = stateRef.current;
        const b = books[currentBookIndex];
        const c = b?.chapters[currentChapterIndex];
        if (b && c) {
          audio.src = getAudioUrl(b.folder, c.file);
        }
      }
      audio.play().catch((err) => {
        console.error('Playback error:', err);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, []);

  const seekRelative = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
    audio.currentTime = target;
    setCurrentTime(target);
    saveStateToStorage(target);
  }, [saveStateToStorage]);

  const seekAbsolute = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(audio.duration || 0, time));
    audio.currentTime = target;
    setCurrentTime(target);
    saveStateToStorage(target);
  }, [saveStateToStorage]);

  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = rate;
    }
    setPlaybackRateState(rate);
    saveStateToStorage();
  }, [saveStateToStorage]);

  const setSleepTimer = useCallback((option: SleepTimerOption) => {
    setSleepTimerOption(option);
    const audio = audioRef.current;
    if (audio) {
      audio.volume = 1.0;
    }
    isFadingOutRef.current = false;

    if (option === 'off') {
      sleepTimerEndRef.current = null;
      setSleepTimerSecondsLeft(null);
    } else if (option === 'end_of_chapter') {
      sleepTimerEndRef.current = null;
      if (audio && audio.duration) {
        const remaining = Math.max(0, Math.ceil(audio.duration - audio.currentTime));
        setSleepTimerSecondsLeft(remaining);
      }
    } else {
      const minutesMap: Record<string, number> = {
        '15m': 15,
        '30m': 30,
        '45m': 45,
        '60m': 60,
      };
      const minutes = minutesMap[option] || 15;
      const targetTime = Date.now() + minutes * 60 * 1000;
      sleepTimerEndRef.current = targetTime;
      setSleepTimerSecondsLeft(minutes * 60);
    }
  }, []);

  const selectBookAndChapter = useCallback((bookIdx: number, chapIdx: number) => {
    loadTrack(bookIdx, chapIdx, true, 0);
  }, [loadTrack]);

  const currentBook = books[currentBookIndex] || null;
  const currentChapter = currentBook?.chapters[currentChapterIndex] || null;

  return {
    books,
    currentBook,
    currentChapter,
    currentBookIndex,
    currentChapterIndex,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    isLoading,
    sleepTimerOption,
    sleepTimerSecondsLeft,
    togglePlay,
    seekRelative,
    seekAbsolute,
    nextTrack,
    previousTrack,
    setPlaybackRate,
    setSleepTimer,
    selectBookAndChapter,
  };
}
