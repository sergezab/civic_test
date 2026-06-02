import { useCallback, useEffect, useRef } from "react";
import { synthesizeSpeech } from "../api/interview";
import { isIOSLike } from "../utils/platform";

interface UseFeedbackAudio {
  play: (text: string, onDone?: () => void) => Promise<void>;
  prime: () => void;
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

type WebKitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext || (window as WebKitAudioWindow).webkitAudioContext || null;
}

/** Plays officer feedback audio and owns every timer/object URL it creates. */
export function useFeedbackAudio(stopQuestionAudio: () => void): UseFeedbackAudio {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const speechFallbackRef = useRef(false);
  const speechPrimedRef = useRef(false);
  const playbackIdRef = useRef(0);
  const mountedRef = useRef(true);
  const preferAudioContextRef = useRef(isIOSLike());

  const getAudioContext = useCallback(() => {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    if (!audioContextRef.current) audioContextRef.current = new Ctor();
    return audioContextRef.current;
  }, []);

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
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      try {
        audioSourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      try {
        audioSourceRef.current.disconnect();
      } catch {
        /* already disconnected */
      }
      audioSourceRef.current = null;
    }
    if (audioGainRef.current) {
      try {
        audioGainRef.current.disconnect();
      } catch {
        /* already disconnected */
      }
      audioGainRef.current = null;
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

  const prime = useCallback(() => {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);

    if (!hasBrowserSpeech() || speechPrimedRef.current) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) return;
    try {
      synth.resume();
      const utterance = new SpeechSynthesisUtterance(" ");
      utterance.lang = "en-US";
      utterance.volume = 0;
      utterance.onend = () => {
        speechPrimedRef.current = true;
      };
      utterance.onerror = () => {
        speechPrimedRef.current = true;
      };
      synth.speak(utterance);
      speechPrimedRef.current = true;
    } catch {
      speechPrimedRef.current = true;
    }
  }, [getAudioContext]);

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
        utterance.volume = 1;
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

      const playWithAudioContext = async (url: string): Promise<boolean> => {
        const ctx = getAudioContext();
        if (!ctx) return false;
        try {
          if (ctx.state === "suspended") await ctx.resume();
          const response = await fetch(url);
          const audioData = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(audioData.slice(0));
          if (!mountedRef.current || playbackIdRef.current !== playbackId) return true;

          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          // Piper feedback can be noticeably quieter than question narration on
          // iPad speakers. A modest gain keeps it audible without clipping most voices.
          gain.gain.value = preferAudioContextRef.current ? 1.8 : 1;
          source.connect(gain);
          gain.connect(ctx.destination);
          audioSourceRef.current = source;
          audioGainRef.current = gain;
          source.onended = finish;
          source.start(0);
          return true;
        } catch {
          return false;
        }
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
      if (preferAudioContextRef.current && (await playWithAudioContext(url))) return;

      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 1;
      audio.setAttribute?.("playsinline", "true");
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
    [cleanupCurrent, getAudioContext, stopQuestionAudio],
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

  return { play, prime, stop };
}
