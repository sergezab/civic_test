# Codex prompt — full review & refactor

Paste the block below to Codex (run it from the repo root). It first reads the
repo's own context (`AGENTS.md` files), then reviews, then refactors in small,
verified steps — without breaking behavior.

---

You are a staff-level engineer doing a rigorous review and refactor of this
repository so it reads as a **portfolio-grade, production-quality** example of a
publicly deployed, multi-user web app. Treat it as code you'd be proud to show in a
senior interview at a top engineering org.

**First, build context. Read these before changing anything:**
- `AGENTS.md` (root) and the `AGENTS.md` in `src/`, `src/components/`, `src/hooks/`,
  `src/data/`, `src/api/`, `src/utils/`, and `server/`.
- `README.md`, `server/README.md`, `server/DEPLOY.md`.
Then skim the actual source: `src/**` (React + TypeScript) and `server/*.py`
(FastAPI). It's a USCIS civics-test trainer with three modes (Quiz, Flash cards,
and a voice **Interview** graded by a local LLM with Piper TTS + Whisper STT).

## Work in two phases

**Phase 1 — Review (no code changes yet).** Produce `docs/REVIEW.md`: a prioritized
findings report. For each finding give: severity (P0 blocker → P3 nit), the
file:line, why it matters, and the proposed fix + rough effort. Cover every
dimension below. End with a ranked, sequenced refactor plan.

**Phase 2 — Refactor.** Execute the plan in **small, self-contained, behavior-
preserving commits**, each with a clear message. After every commit run the
verification gates and keep them green. Update tests and docs alongside code. Do
not produce one giant diff.

## Review dimensions (the rubric)

1. **Correctness & resilience** — real bugs, race conditions, leaked timers/
   listeners/object-URLs, error paths. The app must stay usable when the backend,
   mic, TTS, STT, or model is unavailable; keep every existing fallback.
2. **Architecture & separation of concerns** — clear module boundaries; no
   God-components. `InterviewScreen.tsx` is large — extract cohesive hooks
   (e.g. an interview state machine / answer-capture hook) and presentational
   pieces without changing behavior. On the backend, prefer a thin route layer
   over small **service classes** (Grader, TtsEngine, SttEngine) with the Whisper
   model / provider clients as **singletons**.
3. **Type safety** — strict TS with precise types (no `any`); discriminated unions
   for stages/outcomes. Python: complete type hints; consider `mypy`/`pyright` and
   Pydantic models for all request/response bodies.
4. **Logging & observability** — consistent, leveled, structured logs (client
   `[iv]`/`[api]`, server `[civic]`); timing around slow paths; no noisy logs in
   hot loops. Make verbosity configurable.
5. **Security** — input validation + size caps; prompt-injection safety (treat the
   transcript as data); CORS scoping; rate limiting; absolutely no secrets in the
   repo; safe handling of user audio (don't persist).
6. **Performance (heavy, multi-user)** — avoid needless re-renders (memoization,
   stable callbacks, keys); debounce/throttle; backend concurrency limits and
   model warm-up; cache where safe. Note any O(n²)/blocking work.
7. **Accessibility** — it's a public site: semantic HTML, labels, focus
   management, `aria-live` for status, keyboard operability, color-contrast,
   `prefers-reduced-motion` for the blinking/pulse animations.
8. **Testing** — expand **vitest** unit coverage (hooks, grader-parsing, utils) and
   **Playwright** e2e for each mode's happy path + key failures (server down,
   insecure-context, retry). Add backend tests (`pytest`) for grader JSON parsing,
   fallback, and endpoint validation.
9. **Documentation & comments** — file/module headers, TSDoc/JSDoc on exported
   APIs, Python docstrings, and comments that explain **why** for non-obvious logic
   (StrictMode de-dupe, the Web-Speech cancel/speak hang, `think:false`, the
   silence-detection timing). Keep `AGENTS.md`/`README` accurate.
10. **Readability & naming** — intention-revealing names, small functions, no dead
    code, consistent style.
11. **Tooling & consistency** — ESLint clean; add **Prettier** if absent; add
    **ruff** + **black** (or **ruff format**) for Python; ensure CI runs lint +
    types + tests. Pin/justify dependencies; remove unused ones.
12. **Config & 12-factor** — all environment via env/`.env` with documented
    `.env.example`; sensible defaults; no hardcoded hosts.

## Apply patterns with judgment (important)

The goal is **idiomatic excellence, not cargo-cult OOP.** Use classes/singletons
where they genuinely fit (backend service objects, the lazily-loaded Whisper model,
a provider client). Do **not** convert React function components to classes or wrap
trivial logic in classes — idiomatic hooks/functions are the standard here. A
reviewer should see good judgment, not pattern overuse.

## Hard constraints — do not break

- The three modes, the grading behavior, and the UX flows must be preserved
  (verify each manually). 
- Honor every **invariant** in root `AGENTS.md`: the USCIS question text +
  `acceptableAnswers` are fixed; the `/health` `/grade` `/tts` `/stt` contracts and
  the relative-API-base/proxy default; the secure-context handling; Ollama
  `think:false` + deterministic fallback (`/grade` never hard-fails); no secrets in
  git; don't commit `server/voices/` or build artifacts.
- Keep the app runnable at every commit. No new heavyweight dependencies without a
  one-line justification in the commit.

## Verification gates (must pass after each commit)

```bash
npm run build      # tsc -b && vite build (type check is the gate)
npm run lint
npm test
npm run test:e2e   # if the dev server + backend are available
# backend (if you add Python tooling/tests):
cd server && uv run ruff check . && uv run pytest
```
Also smoke-test by running `npm run dev` + the backend and exercising Quiz, Flash,
and Interview (manual + hands-free, including a wrong answer + retry).

## Deliverables
1. `docs/REVIEW.md` — the prioritized findings + sequenced plan.
2. A series of focused refactor commits implementing the plan, gates green.
3. Updated/expanded tests and documentation.
4. A short `docs/REFACTOR_SUMMARY.md` — what changed, why, and any follow-ups left.

Begin with Phase 1 and show me `docs/REVIEW.md` before starting Phase 2.
