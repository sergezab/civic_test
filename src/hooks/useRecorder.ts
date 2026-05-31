import { useCallback, useRef, useState } from "react";

export interface UseRecorder {
  supported: boolean;
  recording: boolean;
  error: string | null;
  start: () => Promise<boolean>;
  stop: () => Promise<Blob | null>;
}

/** Records mic audio via MediaRecorder for the server-side Whisper fallback
 *  (used in browsers without the Web Speech API, e.g. Safari/Firefox). */
export function useRecorder(): UseRecorder {
  const supported =
    typeof window !== "undefined" &&
    window.isSecureContext && // getUserMedia is blocked on insecure origins
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!supported) return false;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mrRef.current = mr;
      mr.start();
      setRecording(true);
      return true;
    } catch {
      setError("Microphone permission denied or unavailable.");
      return false;
    }
  }, [supported]);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const mr = mrRef.current;
        if (!mr) {
          resolve(null);
          return;
        }
        mr.onstop = () => {
          const blob = chunksRef.current.length
            ? new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" })
            : null;
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          setRecording(false);
          resolve(blob);
        };
        try {
          mr.stop();
        } catch {
          resolve(null);
        }
      }),
    [],
  );

  return { supported, recording, error, start, stop };
}
