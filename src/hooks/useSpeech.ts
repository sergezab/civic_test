import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeech {
  /** Play a question's narration (pre-generated audio file, id-keyed). Falls
   *  back to Web Speech if the file can't load. No-op when muted. */
  play: (id: number, text: string) => void;
  /** Like play, but skips if `key` matches the last one — de-dupes auto-play
   *  (React StrictMode fires mount effects twice in dev). */
  playOnce: (key: string, id: number, text: string) => void;
  /** Stop any current narration. */
  stop: () => void;
  muted: boolean;
  toggleMute: () => void;
  /** True while audio is actively playing. */
  speaking: boolean;
  supported: boolean;
}

const AUDIO_BASE = `${import.meta.env.BASE_URL}audio/`;

function hasSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function useSpeech(): UseSpeech {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    (typeof Audio !== "undefined" || hasSpeech());

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const hardStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (hasSpeech()) window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    hardStop();
    setSpeaking(false);
  }, [hardStop]);

  // Last-resort fallback if the audio file is missing or autoplay is blocked.
  const speakFallback = useCallback((text: string) => {
    if (!hasSpeech() || mutedRef.current) return;
    const synth = window.speechSynthesis;
    try {
      synth.resume();
    } catch {
      /* no-op */
    }
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
  }, []);

  const play = useCallback(
    (id: number, text: string) => {
      if (mutedRef.current) return;
      hardStop();

      if (typeof Audio === "undefined") {
        speakFallback(text);
        return;
      }

      const audio = new Audio(`${AUDIO_BASE}q-${id}.m4a`);
      audioRef.current = audio;
      audio.onplaying = () => setSpeaking(true);
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        setSpeaking(false);
      };
      audio.onerror = () => {
        if (audioRef.current === audio) audioRef.current = null;
        setSpeaking(false);
        speakFallback(text);
      };
      audio.play().catch(() => {
        // Autoplay blocked (no user gesture yet) — try speech as a fallback.
        if (audioRef.current === audio) audioRef.current = null;
        speakFallback(text);
      });
    },
    [hardStop, speakFallback],
  );

  const playOnce = useCallback(
    (key: string, id: number, text: string) => {
      if (lastKeyRef.current === key) return;
      lastKeyRef.current = key;
      play(id, text);
    },
    [play],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        hardStop();
        setSpeaking(false);
      }
      return next;
    });
  }, [hardStop]);

  useEffect(() => {
    return () => {
      hardStop();
    };
  }, [hardStop]);

  return { play, playOnce, stop, muted, toggleMute, speaking, supported };
}
