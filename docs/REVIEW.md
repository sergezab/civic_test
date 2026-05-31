# Code review — first pass

Reviewer: maintainer pass before handing to Codex. Scope: `src/**` (React + TS) and
`server/*.py` (FastAPI). Severity: **P0** breaks prod · **P1** important · **P2**
should-fix · **P3** nice-to-have. Each item has a fix + rough effort (S/M/L).

## Overall

Solid, genuinely working app with thoughtful resilience. The biggest gaps are
(1) a correctness inconsistency introduced by the new variable test length, (2) one
oversized component, and (3) thin automated test coverage + backend hardening for
"heavy multi-user." None are P0 — the app builds, runs, and degrades gracefully.

### Strengths (keep these)
- **Graceful degradation everywhere** — backend down, mic/secure-context missing,
  TTS/STT unavailable all have real fallbacks; the app never dead-ends.
- **Never-raise grader** with a deterministic string-match fallback so `/grade`
  always returns a verdict; treats the transcript as untrusted (injection-safe).
- **Secure-context handling** + Vite proxy avoids the mic/mixed-content trap.
- **Structured timing logs** (`[iv]`/`[api]`/`[civic]`) — real observability.
- **URL-encoded session state**, committed question audio (offline Quiz/Flash),
  unit tests + Playwright e2e + CI already present.

---

## P1 — important

### 1. Pass threshold is hardcoded 6/10 but test length is now variable
`StartScreen.tsx` lets the user pick 10/25/50/100 questions (`count`), and
`App.tsx` honors it (`sample(pool, cfg.count ?? TEST_LENGTH)`). But the pass logic
and copy still assume 10:
- `ResultsScreen.tsx`: `threshold = mode === "test" ? 6 : Math.ceil(total*0.6)` and
  the message "You need 6 of 10 correct to pass" — a 25-question test still needs
  only 6 and mislabels itself.
- `InterviewScreen.tsx`: `PASS_MARK = 6`, the medallion, "6 of 10" copy, and the
  early-stop math (`wrong > deck.length - PASS_MARK`) all assume 10.
**Why it matters:** wrong scoring + misleading copy — exactly what a reviewer
catches. **Fix:** either (a) lock `count = 10` for `mode === "test"` and only vary
length for `practice` (closest to the real exam), or (b) derive the threshold from
length (`ceil(total * 0.6)`) and template all "N of M" copy. Pick one and apply
consistently across both screens. **Effort:** S–M.

### 2. `InterviewScreen.tsx` is a ~800-line God-component
It owns mode (auto/manual), STT (web-speech + recorder + typed), silence detection,
the per-answer countdown, the retry state machine, grading, TTS playback, results,
and drill — plus ~10 refs to dodge stale closures.
**Why it matters:** hard to test/maintain; the refs are a smell that the state
should be a reducer/state-machine. **Fix:** extract `useInterview` (a reducer or
xstate-style machine for stage/attempt/outcome), `useAnswerCapture` (web-speech +
recorder + countdown behind one API), and split the results view into its own
component. Behavior-preserving. **Effort:** L.

### 3. Thin automated coverage on the risky parts
Unit tests exist for `useBookmarks`, `quiz`, `url`; e2e has one happy path. Nothing
covers the grader JSON parsing/fallback, the interview state machine, the speech
hooks, or any backend route.
**Why it matters:** the most complex/fragile logic is untested. **Fix:** add
`pytest` for `grader` (valid JSON, `<think>`-wrapped output, malformed → fallback,
empty transcript) and endpoint validation; vitest for `buildChoices`, outcome
derivation, and a grader-response parser if extracted; Playwright flows for
server-down, insecure-context, and retry. **Effort:** M–L.

---

## P2 — should fix

### 4. In-memory rate limiter leaks and is per-process
`app.py` `_hits: dict[str, deque]` is never pruned of idle IPs (unbounded memory
over time) and only works within one uvicorn worker. **Fix:** evict empty/idle
entries (or use a TTL/`cachetools`), and for multi-worker use a shared store
(Redis) or document single-worker. **Effort:** S (in-proc) / M (shared).

### 5. Backend blocking I/O with no concurrency control / warm-up
`grader._ollama_chat` (sync `requests`), Piper (`subprocess`), and Whisper all run
in FastAPI's threadpool; a cold/slow model ties up a worker, and there's no
concurrency cap or model warm-up. For "heavy multi-user" this is the bottleneck.
**Fix:** async client (`httpx.AsyncClient`) or an explicit bounded worker pool +
queue; warm the model on startup; surface a "busy" state. **Effort:** M.

### 6. `useRecorder` doesn't stop the mic stream on unmount
`stop()` stops tracks on `onstop`, but there's no unmount cleanup — navigating away
mid-recording leaves the MediaStream (and the browser mic indicator) active.
**Fix:** `useEffect(() => () => stream?.getTracks().forEach(t => t.stop()), [])`
via a ref. **Effort:** S.

### 7. No `prefers-reduced-motion` for the blink/pulse animations
`.rec-dot` and `.mic-btn.is-recording` (and others) animate unconditionally — an
accessibility/comfort issue for a public site. **Fix:** wrap animations in
`@media (prefers-reduced-motion: no-preference)`. **Effort:** S.

### 8. No formatter / Python lint+format config
ESLint is set up but there's no Prettier, and Python has no `ruff`/`black`. **Fix:**
add Prettier + `ruff` (lint+format), wire into CI. **Effort:** S.

### 9. The per-answer timer setting only applies to Manual mode
`answerSecs` drives the manual countdown; Hands-free uses fixed `SILENCE_MS` /
`NO_SPEECH_MS` and ignores the configured limit. **Fix:** use `answerSecs` as the
hands-free hard cap too (silence still ends earlier). **Effort:** S.

---

## P3 — nice to have

### 10. URL params aren't validated before use
`App.tsx` casts `{format, mode, pool} as QuizConfig` straight from the query string.
A bad `?format=…` renders no screen → blank content. **Fix:** validate against the
allowed unions; fall back to the start screen otherwise. (Also: `count` isn't
captured in the URL, so deep links always start at 10.) **Effort:** S.

### 11. Object-URL leak on the TTS safety-timeout path
In `InterviewScreen.playFeedback`, the 20 s safety `finish()` doesn't
`URL.revokeObjectURL` (only the normal `done` path does). Rare, small leak. **Fix:**
revoke in `finish` too. **Effort:** S.

### 12. Whisper lazy-load isn't thread-safe
`stt._get_model()` is check-then-set; two simultaneous first requests could load the
model twice. **Fix:** guard with a `threading.Lock`. **Effort:** S.

### 13. Magic numbers scattered
`PASS_MARK`, `SILENCE_MS`, `NO_SPEECH_MS`, the 20 s/12 s timeouts, audio-time options
live inline. **Fix:** centralize per area (a small `constants.ts` / config) so they
read as deliberate. **Effort:** S.

### 14. Tooling assumption: `gen:audio` needs Node ≥ 22.18 / 23.6
`scripts/generate-audio.mjs` imports a `.ts` data module via Node type-stripping.
**Fix:** document the Node floor (or pre-export `questions.json`). **Effort:** S.

---

## Suggested sequence
1. **#1** (scoring vs. count) — correctness, small, high-visibility.
2. **#6, #11, #7, #9, #10, #12** — quick resilience/a11y wins (mostly S).
3. **#8** — add Prettier + ruff, format once, wire CI (locks style before big diffs).
4. **#2** — decompose `InterviewScreen` into `useInterview` + `useAnswerCapture`.
5. **#3** — backfill tests around grader, the new hooks, and key e2e flows.
6. **#4, #5** — backend hardening for concurrency/scale.

Each step must keep `npm run build`, `npm run lint`, and the test suites green, and
preserve the invariants in root `AGENTS.md`.
