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

function speechFallbackDelayMs(text: string): number {
  return Math.min(14_000, 2_500 + text.length * 45);
}

function hasBrowserSpeech(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/** Plays officer feedback audio and owns every timer/object URL it creates. */
export function useFeedbackAudio(stopQuestionAudio: () => void): UseFeedbackAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const speechFallbackRef = useRef(false);
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
    if (speechFallbackRef.current && hasBrowserSpeech()) {
      window.speechSynthesis.cancel();
      speechFallbackRef.current = false;
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
      let finished = false;

      const finish = () => {
        if (finished || !mountedRef.current || playbackIdRef.current !== playbackId) return;
        finished = true;
        cleanupCurrent();
        onDone?.();
      };

      safetyTimerRef.current = window.setTimeout(finish, MAX_FEEDBACK_MS);

      const startTextOnlyFallback = () => {
        fallbackTimerRef.current = window.setTimeout(finish, fallbackDelayMs(text));
      };

      const startBrowserSpeechFallback = () => {
        if (!hasBrowserSpeech()) {
          startTextOnlyFallback();
          return;
        }

        const synth = window.speechSynthesis;
        try {
          synth.resume();
        } catch {
          /* no-op */
        }
        if (synth.speaking || synth.pending) synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.95;
        utterance.onstart = () => {
          speechFallbackRef.current = true;
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        speechFallbackRef.current = true;
        try {
          synth.speak(utterance);
        } catch {
          speechFallbackRef.current = false;
          startTextOnlyFallback();
          return;
        }
        fallbackTimerRef.current = window.setTimeout(finish, speechFallbackDelayMs(text));
      };

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
        startBrowserSpeechFallback();
        return;
      }

      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = finish;
      let fellBack = false;
      const fallbackFromAudio = () => {
        if (finished || fellBack) return;
        fellBack = true;
        if (audioRef.current === audio) {
          audio.onended = null;
          audio.onerror = null;
          audio.pause();
          audioRef.current = null;
        }
        if (objectUrlRef.current === url) {
          URL.revokeObjectURL(url);
          objectUrlRef.current = null;
        }
        startBrowserSpeechFallback();
      };
      audio.onerror = fallbackFromAudio;
      audio.play().catch(fallbackFromAudio);
    },
    [cleanupCurrent, stopQuestionAudio],
  );

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        stop();
      };
    },
    [stop],
  );

  return { play, stop };
}
