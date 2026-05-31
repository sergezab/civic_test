# src/hooks/ — browser-API wrappers

Thin, well-typed hooks that isolate flaky browser APIs so components stay simple.

| File | Role |
|---|---|
| `useSpeech.ts` | Plays pre-generated question audio (`/audio/q-<id>.m4a`) via `HTMLAudioElement`, with a Web Speech (`speechSynthesis`) fallback. `play(id,text,onEnd?)`, `playOnce(key,…)` (StrictMode de-dupe), `stop`, `muted`/`toggleMute`, `speaking`. Mute still fires `onEnd` so the hands-free loop never stalls. |
| `useSpeechRecognition.ts` | Wraps `webkitSpeechRecognition` (STT in-browser). Returns `supported` (false on insecure origins — `window.isSecureContext`), `listening`, live `transcript`, `start/stop/reset`. |
| `useRecorder.ts` | `MediaRecorder` capture for the server-side Whisper fallback (browsers without Web Speech). `supported` gated on secure context + `getUserMedia`. |
| `useFeedbackAudio.ts` | Owns officer-feedback TTS playback, object URLs, timers, stale completion cleanup, and text-only fallback timing. |
| `useInterviewPreferences.ts` | Persists Interview mode, retry preference, and answer timer (`iv-*` localStorage keys). |
| `useBookmarks.ts` | Saved-question set in `localStorage`. Has a unit test (`useBookmarks.test.ts`). |

**Conventions:** one hook per browser capability; report `supported` honestly
(including secure-context); never throw — degrade. When refactoring the speech
stack, preserve the StrictMode de-dupe and the "only cancel when actually
speaking" rule (a synchronous `cancel()`+`speak()` hangs Chrome).
