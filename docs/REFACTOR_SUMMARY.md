# Refactor Summary

Implementation pass completed on 2026-05-31 after the Phase 1 review in
`docs/REVIEW.md`.

## Commits

| Commit | Summary |
|---|---|
| `dfa973f` | Stabilized red frontend gates: React hook lint issues, Vite type reference, and stale Flash E2E selector. |
| `5e93a58` | Validated URL session params and guarded empty/invalid startup sessions. |
| `153e5dd` | Extracted feedback audio lifecycle into `useFeedbackAudio`. |
| `bbc09ea` | Extracted persisted Interview preferences into `useInterviewPreferences`. |
| `4df5b12` | Refactored backend routes over `Grader`, `TtsEngine`, and `SttEngine` services with capped STT uploads and validation. |
| `3aa5a06` | Aligned tooling and CI on npm, added Prettier, backend CI gates, and removed the stale pnpm lockfile. |
| `e68a37e` | Improved accessibility states/focus/reduced-motion handling and added Interview server-down + retry E2E coverage. |
| `d5d20dd` | Added runtime frontend validation for `/grade` and `/stt` responses with Vitest coverage. |
| `1ab9aba` | Enabled strict TypeScript, exact optional properties, and unchecked-index protection. |
| `9e5c5c5` | Added backend request IDs, configurable log level, and request timing logs. |
| `65d88c5` | Added hands-free Interview startup coverage with a mocked Web Speech recognizer. |

## Verification

Every commit was followed by the required gate set:

```bash
npm run build
npm run lint
npm test -- --run
npm run test:e2e
cd server && uv run ruff check .
cd server && uv run pytest
```

Final counts:

- Vitest: 4 files, 25 tests.
- Playwright: 10 Chromium E2E tests covering Start, Quiz, Flash, Interview
  server-down, typed wrong-answer retry, and hands-free startup.
- Pytest: 37 backend tests covering endpoint validation, fallbacks, caps, request
  IDs, and grader behavior.

## Smoke

Browser smoke was performed through Playwright with mocked backend responses for
the Interview-only paths that normally require a local LLM/microphone:

- Quiz: start 10-question test, deep-link URL state, bookmark persistence.
- Flash: study 10 cards, navigation, bookmark persistence.
- Interview manual fallback: mocked healthy server, TTS unavailable, typed wrong
  answer, retry, corrected answer.
- Interview hands-free: mocked secure Web Speech recognizer, starts listening and
  exposes Pause without a real microphone.
- Backend-down path: `/health` unavailable shows the graceful Interview notice,
  while Quiz and Flash remain usable.

The real local Ollama/Piper/Whisper stack was not invoked during automated smoke;
those integrations remain behind the documented local backend setup and graceful
fallbacks.
