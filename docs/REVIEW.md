# Repository Review

Phase 1 review of the civics-test trainer as a public, multi-user, portfolio-grade web app. No refactor code has been started.

## Baseline Verification

Run on 2026-05-31 from a clean tracked worktree:

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run build` | Pass | TypeScript build and Vite production build succeeded. |
| `npm run lint` | Fail | 9 errors, 2 warnings from React hooks/compiler lint and `vite.config.ts`. |
| `npm test -- --run` | Pass | 20 Vitest tests passed. |
| `npm run test:e2e` | Fail | 6 passed, 1 failed: Flash test waits for `.flash-nav`, which does not exist. |
| `uv run ruff check .` | Pass | Backend Ruff succeeded. |
| `uv run pytest` | Pass | 34 backend tests passed, 1 Starlette/httpx deprecation warning. |

## Prioritized Findings

### P1 - Verification Gates Are Red

- **Location:** `src/App.tsx:74`, `src/components/FlashScreen.tsx:30`, `src/components/InterviewScreen.tsx:185`, `src/components/InterviewScreen.tsx:258`, `src/components/InterviewScreen.tsx:425`, `src/hooks/useSpeechRecognition.ts:47`, `vite.config.ts:1`, `e2e/app.spec.ts:63`
- **Why it matters:** The requested delivery bar requires green build, lint, unit, E2E, and backend gates after every commit. The current baseline already fails lint and Playwright. This makes every later refactor harder to trust and would fail or mask regressions in CI once lint is added.
- **Proposed fix:** First stabilization commit: resolve current lint errors intentionally, remove stale/unused suppressions, replace the triple-slash Vitest reference with import-style typing, and update the Flash E2E assertion to target real accessible UI or restore the expected navigation wrapper.
- **Effort:** Small.

### P1 - `InterviewScreen` Is a God Component With Too Many State Axes

- **Location:** `src/components/InterviewScreen.tsx:64`
- **Why it matters:** One 848-line component owns server reachability, manual and hands-free modes, retry policy, countdowns, speech recognition, MediaRecorder fallback, TTS feedback playback, scoring, transcript logs, localStorage, and rendering. The many booleans and refs allow impossible intermediate states and make races hard to reason about.
- **Proposed fix:** Extract a typed interview state machine hook (`useInterviewSession`), media hooks (`useInterviewFeedbackAudio`, `useInterviewAnswerCapture`), and presentational pieces (`InterviewControls`, `InterviewQuestion`, `InterviewResult`, `InterviewSummary`). Use discriminated unions for stage-specific state and keep React components functional.
- **Effort:** Large.

### P1 - Feedback Audio Cleanup Is Still Not Centralized

- **Location:** `src/components/InterviewScreen.tsx:199`, `src/components/InterviewScreen.tsx:220`, `src/components/InterviewScreen.tsx:227`, `src/components/InterviewScreen.tsx:232`, `src/components/InterviewScreen.tsx:402`
- **Why it matters:** `playFeedback` has several completion paths, but `stopFeedbackAudio` only pauses the element and clears handlers. The safety timeout and synthetic fallback timeout are local variables that cannot be cleared from pause/unmount paths, and stale completions can still call `onDone` after the component has moved on.
- **Proposed fix:** Move feedback playback into a hook that tracks the audio element, object URL, safety timer, fallback timer, and mounted flag in refs. Cleanup should pause, clear handlers, revoke URLs immediately when possible, clear timers, and ignore stale completions.
- **Effort:** Small to medium.

### P1 - `/stt` Reads the Entire Upload Before Enforcing the Size Cap

- **Location:** `server/app.py:119`
- **Why it matters:** The route checks `MAX_AUDIO_BYTES` after `await file.read()`, so an oversized multipart body is already in memory. A public deployment can be memory-pressured before returning 413.
- **Proposed fix:** Stream the upload in bounded chunks or read `MAX_AUDIO_BYTES + 1` bytes and reject immediately when the cap is exceeded. Also validate allowed audio content types/extensions before sending to Whisper.
- **Effort:** Medium.

### P1 - Backend Heavyweight Paths Are Thin Functions, Not Production Services

- **Location:** `server/app.py:64`, `server/grader.py:58`, `server/tts.py:31`, `server/stt.py:13`
- **Why it matters:** FastAPI routes call module functions directly; Ollama calls use one-off blocking `requests.post`, TTS spawns subprocesses per request, and the Whisper singleton is an untyped module global without a load lock. Under concurrent users, first STT calls can race model loading and grade/TTS calls can overload local resources.
- **Proposed fix:** Introduce `Grader`, `TtsEngine`, and `SttEngine` service classes as app-level singletons. Use a shared HTTP client/session for Ollama, lazy model loading guarded by a lock, bounded concurrency/semaphores for model and subprocess work, and optional startup warm-up hooks.
- **Effort:** Large.

### P2 - API Contracts Are Documented but Not Strongly Modeled

- **Location:** `server/app.py:48`, `server/app.py:55`, `server/app.py:92`, `server/grader.py:49`, `server/grader.py:58`, `server/grader.py:105`, `server/grader.py:136`, `src/api/interview.ts:50`
- **Why it matters:** Request bodies have few Pydantic constraints, responses are untyped `dict`s, grader internals return free-form dictionaries, and the frontend trusts `await r.json() as GradeResult`. Malformed or oversized inputs and unexpected backend responses can propagate into brittle UI states.
- **Proposed fix:** Add Pydantic request and response models with length/count constraints and a `Literal` verdict. Mirror that with TypeScript runtime validation or a small local type guard before returning `GradeResult`.
- **Effort:** Medium.

### P2 - URL State Can Start Invalid or Empty Sessions

- **Location:** `src/utils/url.ts:10`, `src/App.tsx:71`, `src/App.tsx:73`, `src/App.tsx:39`, `src/App.tsx:50`
- **Why it matters:** URL params are parsed as arbitrary strings and cast to `QuizConfig`. A deep link to an empty bookmark pool or invalid count can put the app into `phase="quiz"` with an empty session and no rendered screen. This breaks the promised shareable/resumable URL behavior.
- **Proposed fix:** Parse URL params into validated unions, clamp counts, reject invalid modes/formats/pools, and guard `startQuiz` against empty pools with a friendly return to Start.
- **Effort:** Small.

### P2 - Speech Recognition Errors and Final Transcript Timing Are Fragile

- **Location:** `src/hooks/useSpeechRecognition.ts:82`, `src/hooks/useSpeechRecognition.ts:88`, `src/components/InterviewScreen.tsx:394`, `src/components/InterviewScreen.tsx:685`
- **Why it matters:** Recognition errors set hook state but the interview UI ignores `rec.error`; the stage can remain `"listening"` and eventually submit an empty transcript. Manual submit calls `rec.stop()` and immediately grades `transcriptRef.current`, which can miss a final `onresult` event delivered after stop.
- **Proposed fix:** Model recognition lifecycle explicitly (`idle | starting | listening | stopping | error`), surface errors in the UI, and wait for stop/finalization before grading or route the user to the editable transcript fallback.
- **Effort:** Medium.

### P2 - Public Rate Limiting and CORS Are Not Yet Production-Grade

- **Location:** `server/app.py:26`, `server/app.py:33`, `server/app.py:66`, `server/app.py:97`, `server/app.py:115`
- **Why it matters:** The in-memory limiter is single-process and keys on `request.client.host`, which is often the tunnel/reverse-proxy IP in public deployment. That can either throttle all users together or give a false sense of abuse protection. CORS allows all request headers.
- **Proposed fix:** Add a configurable trusted-proxy strategy for client IP extraction, per-endpoint limits, and a production-ready limiter backend if multi-process deployment is expected. Restrict CORS headers to the actual JSON/multipart needs.
- **Effort:** Medium.

### P2 - Accessibility Is Present but Incomplete

- **Location:** `src/components/StartScreen.tsx:69`, `src/components/StartScreen.tsx:97`, `src/components/ProgressDots.tsx:9`, `src/components/InterviewScreen.tsx:711`, `src/components/InterviewScreen.tsx:734`, `src/index.css:780`, `src/index.css:740`, `src/index.css:876`
- **Why it matters:** Custom segmented controls expose only visual active state, progress dots are hidden from assistive tech without an equivalent list/progress semantics, result changes are not announced or focus-managed, textarea focus removes the default outline, and recording animations do not respect `prefers-reduced-motion`.
- **Proposed fix:** Add `aria-pressed` or proper radio/tab semantics for segmented controls, accessible progress text/list semantics, `aria-live` regions for grading/results, focus management after stage changes, `:focus-visible` styling, and reduced-motion CSS.
- **Effort:** Medium.

### P2 - Type Safety Is Below the Stated Standard

- **Location:** `tsconfig.app.json:18`, `tsconfig.node.json:17`, `src/api/interview.ts:50`, `server/grader.py:49`, `server/grader.py:58`, `server/grader.py:136`, `server/app.py:56`
- **Why it matters:** The frontend TypeScript config enables unused/fallthrough checks but does not enable `strict`, `exactOptionalPropertyTypes`, or `noUncheckedIndexedAccess`. Backend functions use broad `dict`/`list[dict]` types and there is no mypy/pyright gate.
- **Proposed fix:** Enable strict TypeScript in small steps, add precise frontend unions and response guards, introduce Python typed models and service protocols, and add a Python type checker once annotations are meaningful.
- **Effort:** Medium.

### P2 - Test Coverage Misses the Highest-Risk User Flows

- **Location:** `e2e/app.spec.ts:24`, `e2e/app.spec.ts:58`, `server/tests/test_app.py:40`, `server/tests/test_grader.py:64`
- **Why it matters:** The existing frontend unit tests cover pure utilities/bookmarks, and E2E covers Start, Quiz, and part of Flash. There is no Playwright coverage for Interview server-down, insecure-context fallback, typed answer flow, wrong-answer retry, hands-free control states, or transcript summary. Backend tests are good for fallback basics but do not cover prompt-injection-like transcript text, model malformed JSON edge cases beyond verdict, or validation boundaries.
- **Proposed fix:** Add focused Vitest tests for new interview hooks/state reducers, Playwright mocks for `/health`, `/grade`, `/tts`, and `/stt`, and pytest cases for validation caps, rate limits, prompt-injection text, and service error fallbacks.
- **Effort:** Large.

### P2 - Tooling and CI Do Not Match the Desired Gates

- **Location:** `.github/workflows/tests.yml:22`, `.github/workflows/tests.yml:33`, `.github/workflows/tests.yml:56`, `package.json:5`
- **Why it matters:** CI runs pnpm unit and E2E only; it does not run `npm run lint`, backend Ruff, backend pytest, type-only checks as a distinct job, or formatting. The repo has both `package-lock.json` and `pnpm-lock.yaml` but no `packageManager`, while the README documents npm commands and CI uses pnpm.
- **Proposed fix:** Pick npm or pnpm and document it consistently, remove the other lockfile, add Prettier plus format check, add backend dev tooling (`ruff format` or Black, type check), and update CI to run every required gate.
- **Effort:** Medium.

### P3 - Logging Is Useful but Not Structured or Configurable Enough

- **Location:** `src/utils/log.ts:4`, `src/utils/log.ts:11`, `server/logutil.py:9`, `server/app.py:80`, `server/grader.py:168`
- **Why it matters:** Logs are helpful during development, but they are formatted strings without request IDs, levels, structured fields, or environment-controlled verbosity. Multi-user debugging through a tunnel will be harder than necessary.
- **Proposed fix:** Keep the lightweight approach but add log levels, a request ID middleware, structured key/value formatting, and documented env flags for client and server verbosity.
- **Effort:** Small to medium.

### P3 - Documentation Has Drift From the Implementation

- **Location:** `server/app.py:3`, `server/requirements.txt:9`, `README.md:181`, `server/DEPLOY.md:62`
- **Why it matters:** Some docs still refer to phased implementation while STT/TTS are present, and the public hardening section overstates readiness relative to current rate-limit/upload/concurrency gaps. Senior-review readers notice stale comments quickly.
- **Proposed fix:** Update module docstrings, requirements comments, README, deployment notes, and AGENTS docs after the refactor lands.
- **Effort:** Small.

### P3 - Frontend Performance Can Be Tightened After Architecture Work

- **Location:** `src/App.tsx:20`, `src/components/ProgressDots.tsx:14`, `src/components/InterviewScreen.tsx:568`
- **Why it matters:** Current scale is small, but session-level state changes can re-render broad screen subtrees, `ProgressDots` renders up to 100 elements, and Interview recomputes summary counts from logs during render. This is not urgent, but the refactor is a chance to keep render work predictable.
- **Proposed fix:** Memoize derived session summaries where meaningful, keep child props stable, and use reducer selectors after the Interview state extraction. Avoid premature complexity.
- **Effort:** Small.

## Sequenced Refactor Plan

1. **Stabilize the baseline gates.** Fix lint errors and the stale Flash E2E selector without changing behavior. Run all frontend and backend gates.
2. **Normalize tooling and CI.** Choose one package manager, add missing format/lint/type/backend jobs to CI, and keep docs aligned with the actual commands.
3. **Make URL/session startup safe.** Add validated URL parsing, empty-pool handling, and unit tests for invalid/deep-link cases.
4. **Extract Interview state without behavior changes.** Move scoring, retry, stage transitions, localStorage prefs, and transcript logging into typed hooks/reducers with Vitest coverage.
5. **Fix media lifecycle and recognition resilience.** Extract feedback audio and answer capture hooks; close object URL/timer/stream leaks; handle speech recognition errors and final transcript timing.
6. **Improve Interview accessibility and E2E coverage.** Add live regions, focus management, keyboard-friendly controls, reduced motion, and Playwright tests for server-down, insecure-context, typed fallback, wrong answer + retry, and summary flows.
7. **Refactor backend into services.** Introduce `Grader`, `TtsEngine`, and `SttEngine` singletons behind thin routes; preserve `/health`, `/grade`, `/tts`, and `/stt` contracts.
8. **Harden backend validation and concurrency.** Add Pydantic request/response models, bounded upload reads, proxy-aware rate limiting, concurrency guards, and pytest coverage for caps/fallbacks/injection-like transcripts.
9. **Tighten type safety.** Enable stricter TypeScript checks incrementally and add a Python type-check gate once service types are in place.
10. **Refresh documentation and final smoke test.** Update README/DEPLOY/AGENTS comments, write `docs/REFACTOR_SUMMARY.md`, then manually verify Quiz, Flash, and Interview manual/hands-free flows including wrong-answer retry.
