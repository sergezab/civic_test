# AGENTS.md — working in this repo

> Context for coding agents (Codex/Claude) and human contributors. Product/user
> docs live in [`README.md`](README.md); deployment in [`server/DEPLOY.md`](server/DEPLOY.md).
> Each major folder has its own `AGENTS.md` with local detail.

## What this is

A U.S. citizenship **civics-test trainer** (USCIS 2008, 100 questions) with three
study modes — **Quiz** (multiple choice), **Flash cards**, and a spoken
**Interview** where a local LLM grades your voice answers and replies with spoken
feedback. Frontend is a React + Vite SPA; the Interview mode also needs a small
FastAPI backend (`server/`) that talks to a local **Ollama** model, **Piper** TTS,
and **faster-whisper** STT.

```
civic_test/
├── src/            React + TypeScript frontend (see src/AGENTS.md)
├── server/         FastAPI interview backend (see server/AGENTS.md)
├── public/audio/   pre-generated question narration (q-<id>.m4a, committed)
├── scripts/        generate-audio.mjs (Piper → m4a)
├── docs/           screenshots + this repo's extra docs
├── e2e/            Playwright end-to-end tests
└── .github/        CI (tests.yml)
```

## Commands

**Frontend** (Node ≥ 20):
```bash
npm install
npm run dev          # http://localhost:5173  (API via dev proxy)
npm run dev:https    # https://<host>:5173     (needed for mic over the LAN)
npm run build        # tsc -b && vite build  ← must pass; the type check is the gate
npm run lint         # eslint
npm test             # vitest (unit: hooks/utils)
npm run test:e2e     # playwright
npm run gen:audio    # regenerate public/audio via Piper (needs server venv)
```

**Backend** (`server/`, Python ≥ 3.11, uses `uv`):
```bash
cd server
uv venv && uv pip install -r requirements.txt && uv pip install -e ../../llm_core
uv run uvicorn app:app --port 8090        # config auto-loaded from server/.env
```

## Conventions

- **TypeScript:** strict; **functional components + hooks only** (no class
  components — idiomatic React is the standard here). Shared types are exported
  from the module that owns them (e.g. `QuizConfig` from `StartScreen.tsx`,
  `Question` from `data/questions.ts`).
- **State:** `App.tsx` is the single orchestrator (phase machine + URL state).
  Screen components are self-contained; cross-screen state is lifted to `App`.
  Persisted UI prefs use `localStorage` keys prefixed `iv-` (interview) / bookmarks.
- **CSS:** one global stylesheet (`src/index.css`) with semantic class names; no
  CSS-in-JS. Keep the navy/serif visual system.
- **Python:** type hints + module/function docstrings; never raise out of request
  handlers (return graceful JSON / fallbacks). Shared logger in `logutil.py`.
- **Logging:** client → `src/utils/log.ts` (`[iv]`/`[api]`, on in dev or
  `localStorage.ivDebug=1`); server → `logutil.log` (`[civic]`). Add timing logs
  for anything that can be slow.
- **Errors:** degrade gracefully. The app must stay usable if the backend, TTS,
  STT, mic, or model is unavailable (each already has a fallback — preserve them).

## Invariants — do NOT break

1. **Question dataset** (`src/data/questions.ts`): the questions and
   `acceptableAnswers` are official USCIS content — don't alter wording/answers.
   `distractors` are study aids and may be improved.
2. **API contracts:** `/health`, `/grade`, `/tts`, `/stt` request/response shapes
   (see `server/AGENTS.md`). The frontend calls them at a **relative path** by
   default (Vite proxy / same-origin); `VITE_INTERVIEW_API_URL` overrides.
3. **Secure-context requirement:** mic + Web Speech only work on `https`/`localhost`
   (handled via `window.isSecureContext` checks + `npm run dev:https`).
4. **Grading:** local Ollama via direct `/api/chat` with `think:false` (reasoning
   models otherwise emit no answer); deterministic string-match fallback so
   `/grade` never hard-fails. `server/.env` configures host/model.
5. **No secrets in git.** `.env*` are ignored except `*.example`. Don't commit the
   Piper model (`server/voices/`) or build artifacts.

## Gotchas

- **React StrictMode double-fires effects** in dev → audio/recognition effects use
  ref-based de-dupe (`playOnce`, `lastReadRef`) and refs for values read inside
  timers/callbacks. Keep that pattern when touching the interview loop.
- **Web Speech `cancel()`+`speak()` in the same tick hangs** in Chrome — the
  speech hook only cancels when actually speaking.
- **Cold model load:** first grade after idle can take ~20–30 s (model loads into
  VRAM). Not a bug — see the `OLLAMA_KEEP_ALIVE` tip in README/DEPLOY.
- **`dev:https`** uses a self-signed cert (accept once in the browser).

## Testing & CI
Unit tests with **vitest** (`*.test.ts` next to the code), e2e with **Playwright**
(`e2e/`), run in CI (`.github/workflows/tests.yml`). Add/extend tests with changes;
`npm run build` (type check) and `npm run lint` must pass.
