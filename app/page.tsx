'use client';

import React, { useState, useMemo } from 'react';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { SleepTimerOption, PlaybackRate } from '../types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  ChevronDown,
  X,
  Moon,
  ArrowLeft,
} from 'lucide-react';

function formatTimestamp(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) {
    return '00:00';
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS: PlaybackRate[] = [0.85, 0.9, 1.0, 1.15];

const SLEEP_OPTIONS: { id: SleepTimerOption; label: string }[] = [
  { id: 'off', label: 'Disattivato' },
  { id: '15m', label: '15 minuti' },
  { id: '30m', label: '30 minuti' },
  { id: '45m', label: '45 minuti' },
  { id: '60m', label: '60 minuti' },
  { id: 'end_of_chapter', label: 'Fine capitolo' },
];

export default function BiblePlayerPage() {
  const {
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
  } = useAudioPlayer();

  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);
  const [selectedBookIndexForModal, setSelectedBookIndexForModal] = useState<number>(0);
  const [selectorStep, setSelectorStep] = useState<'book' | 'chapter'>('book');
  const [isSleepModalOpen, setIsSleepModalOpen] = useState<boolean>(false);

  const [scrubberValue, setScrubberValue] = useState<number | null>(null);

  const displayTime = scrubberValue !== null ? scrubberValue : currentTime;
  const remainingTime = Math.max(0, (duration || 0) - displayTime);

  const openBookSelector = () => {
    setSelectedBookIndexForModal(currentBookIndex);
    setSelectorStep('book');
    setIsSelectorOpen(true);
  };

  const handleBookSelected = (index: number) => {
    setSelectedBookIndexForModal(index);
    setSelectorStep('chapter');
  };

  const handleChapterSelected = (chapIndex: number) => {
    selectBookAndChapter(selectedBookIndexForModal, chapIndex);
    setIsSelectorOpen(false);
  };

  const cyclePlaybackRate = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    setPlaybackRate(SPEED_OPTIONS[nextIndex]);
  };

  const activeSleepLabel = useMemo(() => {
    if (sleepTimerOption === 'off' || sleepTimerSecondsLeft === null) return null;
    return formatTimestamp(sleepTimerSecondsLeft);
  }, [sleepTimerOption, sleepTimerSecondsLeft]);

  return (
    <main className="flex flex-col justify-between h-[100dvh] max-w-[480px] mx-auto px-5 py-4 bg-background text-textPrimary select-none">
      {/* Top Bar: Minimal Book & Chapter Selector */}
      <header className="pt-2 flex justify-center items-center">
        <button
          type="button"
          onClick={openBookSelector}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-border text-sm font-medium text-textPrimary hover:border-neutral-600 active:scale-95 transition"
          aria-label="Seleziona libro e capitolo"
        >
          <span>
            {currentBook ? `${currentBook.title} · Cap. ${currentChapter?.chapter ?? 1}` : 'Caricamento...'}
          </span>
          <ChevronDown className="w-4 h-4 text-textSecondary" strokeWidth={1.5} />
        </button>
      </header>

      {/* Center Area: Dim-Friendly OLED Information Display */}
      <section className="flex flex-col items-center justify-center text-center my-auto py-8">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-textPrimary">
          {currentBook ? currentBook.title : 'Bibbia'}
        </h1>
        <p className="text-lg text-textSecondary font-normal mt-2 tabular-nums">
          {currentChapter ? `Capitolo ${currentChapter.chapter}` : ''}
        </p>

        {activeSleepLabel && (
          <div className="mt-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-xs text-textSecondary tabular-nums">
            <Moon className="w-3.5 h-3.5 text-textSecondary" strokeWidth={1.5} />
            <span>Timer: {activeSleepLabel}</span>
          </div>
        )}
      </section>

      {/* Bottom Controls Area (Reachable with thumb) */}
      <footer className="flex flex-col pb-6">
        {/* Scrubber & Timestamps */}
        <div className="w-full flex flex-col gap-2 mb-6">
          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.5}
            value={displayTime}
            onChange={(e) => setScrubberValue(parseFloat(e.target.value))}
            onMouseUp={() => {
              if (scrubberValue !== null) {
                seekAbsolute(scrubberValue);
                setScrubberValue(null);
              }
            }}
            onTouchEnd={() => {
              if (scrubberValue !== null) {
                seekAbsolute(scrubberValue);
                setScrubberValue(null);
              }
            }}
            aria-label="Avanzamento traccia"
            className="w-full"
          />
          <div className="flex justify-between text-xs text-textSecondary tabular-nums font-mono px-0.5">
            <span>{formatTimestamp(displayTime)}</span>
            <span>-{formatTimestamp(remainingTime)}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-between px-2 mb-8">
          <button
            type="button"
            onClick={() => seekRelative(-15)}
            className="flex flex-col items-center justify-center w-11 h-11 rounded-full text-textSecondary hover:text-textPrimary active:scale-95 transition"
            aria-label="Riavvolgi 15 secondi"
          >
            <RotateCcw className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10px] font-mono leading-none mt-0.5">15</span>
          </button>

          <button
            type="button"
            onClick={previousTrack}
            className="flex items-center justify-center w-12 h-12 rounded-full text-textSecondary hover:text-textPrimary active:scale-95 transition"
            aria-label="Capitolo precedente"
          >
            <SkipBack className="w-6 h-6" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={isLoading && !currentBook}
            className="flex items-center justify-center w-16 h-16 rounded-full bg-textPrimary text-black active:scale-95 transition shadow-lg"
            aria-label={isPlaying ? 'Pausa' : 'Riproduci'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-black" strokeWidth={1.5} />
            ) : (
              <Play className="w-7 h-7 fill-black ml-1" strokeWidth={1.5} />
            )}
          </button>

          <button
            type="button"
            onClick={() => nextTrack(true)}
            className="flex items-center justify-center w-12 h-12 rounded-full text-textSecondary hover:text-textPrimary active:scale-95 transition"
            aria-label="Capitolo successivo"
          >
            <SkipForward className="w-6 h-6" strokeWidth={1.5} />
          </button>

          <button
            type="button"
            onClick={() => seekRelative(15)}
            className="flex flex-col items-center justify-center w-11 h-11 rounded-full text-textSecondary hover:text-textPrimary active:scale-95 transition"
            aria-label="Avanza 15 secondi"
          >
            <RotateCw className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10px] font-mono leading-none mt-0.5">15</span>
          </button>
        </div>

        {/* Bottom Utility Bar: Playback Speed & Sleep Timer */}
        <div className="flex items-center justify-between border-t border-border pt-4 px-2">
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface border border-border text-xs font-mono text-textPrimary hover:border-neutral-600 active:scale-95 transition"
            aria-label="Velocità di riproduzione"
          >
            <span className="text-textSecondary">Velocità:</span>
            <span>{playbackRate.toFixed(2)}x</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSleepModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition active:scale-95 ${
              sleepTimerOption !== 'off'
                ? 'bg-surface border-textPrimary text-textPrimary'
                : 'bg-surface border-border text-textSecondary hover:text-textPrimary'
            }`}
            aria-label="Timer spegnimento"
          >
            <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span>
              {activeSleepLabel ? `Timer (${activeSleepLabel})` : 'Timer'}
            </span>
          </button>
        </div>
      </footer>

      {/* Book & Chapter Selection Modal */}
      {isSelectorOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-surface border-t border-border rounded-t-2xl max-w-[480px] w-full mx-auto max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              {selectorStep === 'chapter' ? (
                <button
                  type="button"
                  onClick={() => setSelectorStep('book')}
                  className="flex items-center gap-1 text-sm text-textSecondary hover:text-textPrimary"
                >
                  <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                  <span>Libri</span>
                </button>
              ) : (
                <span className="text-sm font-medium text-textPrimary">Seleziona Libro</span>
              )}

              {selectorStep === 'chapter' && (
                <span className="text-sm font-medium text-textPrimary">
                  {books[selectedBookIndexForModal]?.title}
                </span>
              )}

              <button
                type="button"
                onClick={() => setIsSelectorOpen(false)}
                className="p-1 text-textSecondary hover:text-textPrimary"
                aria-label="Chiudi"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {selectorStep === 'book' ? (
                <div className="grid grid-cols-2 gap-2">
                  {books.map((book, idx) => {
                    const isCurrent = idx === currentBookIndex;
                    return (
                      <button
                        key={book.id}
                        type="button"
                        onClick={() => handleBookSelected(idx)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition ${
                          isCurrent
                            ? 'bg-neutral-800 border-textPrimary text-textPrimary font-semibold'
                            : 'bg-surfaceSubtle border-border text-textPrimary hover:border-neutral-600'
                        }`}
                      >
                        <span className="text-textSecondary font-mono">{book.id}</span>
                        <span className="truncate">{book.title}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  {books[selectedBookIndexForModal]?.chapters.map((chap, cIdx) => {
                    const isCurrent =
                      selectedBookIndexForModal === currentBookIndex && cIdx === currentChapterIndex;
                    return (
                      <button
                        key={chap.chapter}
                        type="button"
                        onClick={() => handleChapterSelected(cIdx)}
                        className={`h-11 rounded-lg border flex items-center justify-center text-sm font-mono transition ${
                          isCurrent
                            ? 'bg-textPrimary text-black border-textPrimary font-semibold'
                            : 'bg-surfaceSubtle border-border text-textPrimary hover:border-neutral-600'
                        }`}
                      >
                        {chap.chapter}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sleep Timer Selector Modal */}
      {isSleepModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-surface border-t border-border rounded-t-2xl max-w-[480px] w-full mx-auto p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-sm font-medium text-textPrimary">Timer spegnimento</span>
              <button
                type="button"
                onClick={() => setIsSleepModalOpen(false)}
                className="p-1 text-textSecondary hover:text-textPrimary"
                aria-label="Chiudi"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {SLEEP_OPTIONS.map((opt) => {
                const isActive = sleepTimerOption === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSleepTimer(opt.id);
                      setIsSleepModalOpen(false);
                    }}
                    className={`py-3 px-4 rounded-lg border text-sm font-medium transition text-center ${
                      isActive
                        ? 'bg-neutral-800 border-textPrimary text-textPrimary'
                        : 'bg-surfaceSubtle border-border text-textSecondary hover:text-textPrimary'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
