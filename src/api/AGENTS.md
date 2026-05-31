# src/api/ — interview backend client

`interview.ts` is the only place the frontend talks to the FastAPI backend.

- **Base URL:** `import.meta.env.VITE_INTERVIEW_API_URL` or **`""`** (relative →
  Vite dev proxy / same-origin reverse proxy). Keep this default so HTTPS works
  without mixed-content.
- **`checkHealth(signal)`** → `boolean` (drives the "server down" screen).
- **`gradeAnswer(question, acceptedAnswers, transcript, questionId?)`** →
  `GradeResult { verdict: "correct"|"partial"|"incorrect", feedback, correctAnswer,
  heard, model, fallback }`; backend JSON is validated at runtime before the type
  is returned.
- **`transcribeAudio(blob)`** → `string` (POST audio to `/stt`).
- **`synthesizeSpeech(text)`** → object-URL `string | null` (POST `/tts`; **12 s
  abort timeout** so a stalled TTS can't hang the hands-free loop; returns null →
  caller falls back to text).

**Conventions:** every call is timed and logged via `utils/log.ts` (`[api]`);
network failures resolve to a safe value (null/throw caught by the caller) rather
than crashing. Don't introduce a second fetch path — extend this client.
