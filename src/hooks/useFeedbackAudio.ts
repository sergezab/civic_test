import { useCallback, useEffect, useRef } from "react";
import { synthesizeSpeech } from "../api/interview";

interface UseFeedbackAudio {
  play: (text: string, onDone?: () => void) => Promise<void>;
  stop: () => void;
}

const MAX_FEEDBACK_MS = 20_000;

function fallbackDelayMs(text: string): number {
  return Math.min(6_000, 1_600 + text.length * 35);
}

/** Plays officer feedback audio and owns every timer/object URL it creates. */
export function useFeedbackAudio(stopQuestionAudio: () => void): UseFeedbackAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const playbackIdRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanupCurrent = useCallback(() => {
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    playbackIdRef.current += 1;
    cleanupCurrent();
  }, [cleanupCurrent]);

  const play = useCallback(
    async (text: string, onDone?: () => void) => {
      stopQuestionAudio();
      const playbackId = playbackIdRef.current + 1;
      playbackIdRef.current = playbackId;
      cleanupCurrent();

      const finish = () => {
        if (!mountedRef.current || playbackIdRef.current !== playbackId) return;
        cleanupCurrent();
        onDone?.();
      };

      safetyTimerRef.current = window.setTimeout(finish, MAX_FEEDBACK_MS);

      let url: string | null;
      try {
        url = await synthesizeSpeech(text);
      } catch {
        url = null;
      }

      if (!mountedRef.current || playbackIdRef.current !== playbackId) {
        if (url) URL.revokeObjectURL(url);
        return;
      }

      if (!url) {
        fallbackTimerRef.current = window.setTimeout(finish, fallbackDelayMs(text));
        return;
      }

      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    },
    [cleanupCurrent, stopQuestionAudio],
  );

  useEffect(
    () => () => {
      mountedRef.current = false;
      stop();
    },
    [stop],
  );

  return { play, stop };
}
