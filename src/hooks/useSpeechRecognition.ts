import { useCallback, useEffect, useRef, useState } from "react";
import { ilog } from "../utils/log";

// Minimal typing for the Web Speech API (not in lib.dom for all TS versions).
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}
type SRCtor = new () => SpeechRecognitionLike;

function getCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  // Speech recognition / mic are blocked on insecure origins (plain http on a
  // non-localhost host). The constructor may still exist but start() yields no
  // audio, so treat insecure contexts as unsupported.
  if (!window.isSecureContext) return null;
  const w = window as unknown as {
    SpeechRecognition?: SRCtor;
    webkitSpeechRecognition?: SRCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseSpeechRecognition {
  supported: boolean;
  listening: boolean;
  transcript: string; // final + interim, live
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/** Wrapper around the browser's SpeechRecognition (Chrome/Edge, partial Safari). */
export function useSpeechRecognition(lang = "en-US"): UseSpeechRecognition {
  const [Ctor] = useState<SRCtor | null>(() => getCtor());
  const supported = Ctor !== null;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setError(null);
  }, []);

  const start = useCallback(() => {
    if (!Ctor) return;
    finalRef.current = "";
    setTranscript("");
    setError(null);

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      let gotFinal = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res?.[0]) continue;
        const txt = res[0].transcript;
        if (res.isFinal) {
          finalRef.current += txt + " ";
          gotFinal = true;
        } else interim += txt;
      }
      if (gotFinal) ilog("stt", "final", { chars: finalRef.current.trim().length });
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (e) => {
      // Common codes: network (Chrome STT needs Google's servers), not-allowed /
      // service-not-allowed (mic permission), audio-capture (no mic), no-speech, aborted.
      const code = e.error || "unknown";
      ilog("stt", "error", { error: code });
      if (code !== "aborted" && code !== "no-speech") setError(code);
      setListening(false);
    };
    rec.onend = () => {
      ilog("stt", "end", { chars: finalRef.current.trim().length });
      setListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
      ilog("stt", "start", { lang });
      setListening(true);
    } catch (e) {
      ilog("stt", "start failed", { error: String(e) });
    }
  }, [Ctor, lang]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* not started */
    }
    setListening(false);
  }, []);

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
    },
    [],
  );

  return { supported, listening, transcript, error, start, stop, reset };
}
