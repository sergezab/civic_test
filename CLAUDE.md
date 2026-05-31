# CLAUDE.md — civic_test

> **Project**: Practice tool for the U.S. USCIS 2008 civics naturalization test
> **Stack**: React 19 + TypeScript + Vite 8 frontend, with an optional FastAPI backend (`server/`) that powers Interview mode (grade / STT / TTS)
> **Repo**: https://github.com/sergezab/civic_test (public)

---

## Tooling — use Serena MCP for code

**Always use the Serena MCP server for navigating and editing code in this repo.**
Prefer its semantic tools over raw file reads / text search whenever you're working
with TypeScript or Python symbols:

- **Explore** with `get_symbols_overview`, `find_symbol`, and `find_referencing_symbols`
  instead of reading whole files. Read a symbol body only when you actually need it.
- **Edit** with `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`,
  and `rename_symbol` for symbol-level changes; use `replace_regex` / the text tools
  only for non-symbol edits.
- Plain `Edit` / `grep` is acceptable for config, Markdown, shell, and `.env` files
  (e.g. `bin/civicctl.sh`, docs) where there are no code symbols to target.

If Serena isn't initialized yet in a session, run its onboarding/initial-instructions
first, then proceed with the symbolic tools.

---

## Quick commands

```bash
pnpm dev          # frontend dev server only → http://localhost:5173
pnpm build        # type-check + bundle to dist/
pnpm test --run   # Vitest unit tests (fast, no browser)
pnpm test         # Vitest watch mode
pnpm test:e2e     # Playwright e2e (starts dev server automatically)
pnpm lint         # ESLint
```

### Service manager — `bin/civicctl.sh`

Runs **both** the frontend (Vite :5173) and the Interview backend (uvicorn :8090)
in the background with PID tracking, health checks, and logs. Use this instead of
`pnpm dev` when you need Interview mode (`?format=interview`) to work — `pnpm dev`
alone starts only the frontend, so the interview API calls fail.

```bash
bash bin/civicctl.sh start      # start backend + frontend (background)
bash bin/civicctl.sh stop       # stop both, free both ports
bash bin/civicctl.sh restart    # stop then start
bash bin/civicctl.sh status     # running state + /health + recent log tails
bash bin/civicctl.sh logs       # live colour-coded tail ([BE]/[FE]); also: logs backend|frontend
bash bin/civicctl.sh repair     # reinstall pnpm deps + verify/create server venv
```

Options (for `start`/`restart`/`status`): `--port` (backend, default 8090;
override repo-wide via the `CIVIC_BACKEND_PORT` env var or `server/.env`),
`--ui-port` (frontend, default 5173), `--no-reload`.

- Backend python: `server/.venv/bin/python` (override with `CIVIC_PY`).
- Logs / PIDs: `logs/backend.{log,pid}`, `logs/frontend.{log,pid}` (gitignored).
- Frontend → backend URL is `VITE_INTERVIEW_API_URL` (defaults to `http://localhost:8090`).

> If `http://localhost:5173/...` won't load, the Vite dev server is down — run
> `bash bin/civicctl.sh status` to see which side stopped, then `restart`.

---

## Source layout

```
src/
  App.tsx                    # root — phase state machine (start → quiz → results)
  main.tsx
  index.css                  # all styles (single file)

  data/
    questions.ts             # 100 USCIS civics questions (typed, with distractors)

  hooks/
    useSpeech.ts             # audio playback (m4a files + Web Speech API fallback)
    useBookmarks.ts          # localStorage bookmark set (Set<number>)

  utils/
    quiz.ts                  # shuffle, sample, buildChoices
    url.ts                   # readUrlParams / setUrlParams / clearUrlParams

  components/
    Header.tsx               # top bar: brand + mute toggle
    StartScreen.tsx          # pool/format selector → QuizConfig
    QuizScreen.tsx           # question + A–D choices + bookmark btn + URL stage sync
    FlashScreen.tsx          # flip-card mode + bookmark btn + URL sync
    ResultsScreen.tsx        # score + "Review saved questions" shortcut
    AnswerReveal.tsx         # official USCIS answer list
    ProgressDots.tsx         # row of colored dots showing quiz progress

  test-setup.ts              # Vitest setup (jest-dom + localStorage.clear)

e2e/
  app.spec.ts                # Playwright e2e tests

public/audio/
  q-1.m4a … q-100.m4a       # pre-generated narration files
```

---

## Key concepts

### Question types
- `choice` — has `correct` + `distractors` → A/B/C/D quiz or flash card with answer reveal
- `spoken` — "answers vary" (current officials, your state) → user says answer aloud, self-assesses

### Modes / pools / formats
| Dimension | Values |
|-----------|--------|
| `format`  | `quiz` (A–D choices + scoring) \| `flash` (flip cards, no scoring) |
| `mode`    | `test` (random `count` questions) \| `practice` (all in pool) |
| `pool`    | `all` (100) \| `senior` (20 starred ★ for 65/20 applicants) \| `bookmarks` |
| `count`   | test length: `10 \| 25 \| 50 \| 100`, plus the pool's full size; options larger than the pool are hidden. Default 10. Ignored in `practice` mode. |

The start screen shows a length selector for `test` mode; the largest option always
equals the current pool's size (e.g. `[10, 20]` for the 20-question senior pool).
`App.tsx` samples `cfg.count ?? TEST_LENGTH` questions. The pass threshold scales as
`ceil(total * 0.6)` (6 for the standard 10-question test).

### Bookmark system
- `useBookmarks` hook — `Set<number>` of question IDs in `localStorage` key `civic_bookmarks`
- Toggle button (☆/★) is shown in the top-right of every question card
- "☆ Saved (N)" pool on start screen; "Review saved questions" on results screen

### URL state
Every session writes its state to URL params for deep-linking and bug reporting:
```
/?format=quiz&mode=test&pool=all&count=10&q=42&stage=ask
```
- `q` = question ID (updated as user advances)
- `count` = test length (only written in `test` mode)
- `stage` = `ask | choosing | answered` (quiz) or `front | back` (flash)
- On page load: if `format + mode + pool` are present, auto-starts that session at `q` (honouring `count`)

### Audio
- Pre-generated `.m4a` files in `public/audio/q-{id}.m4a` (one per question)
- Falls back to `SpeechSynthesisUtterance` if file can't load
- `useSpeech.playOnce(key, id, text)` deduplicates autoplay (StrictMode safe)

---

## Adding / editing questions

All questions are in [`src/data/questions.ts`](src/data/questions.ts).

Each question needs:
```ts
{
  id: number,           // 1–100 (must match audio file q-{id}.m4a)
  category: string,     // one of the C1–C9 constants
  question: string,
  type: "choice" | "spoken",
  senior: boolean,      // true = part of the 20-question 65/20 subset
  acceptableAnswers: string[],
  // choice only:
  correct?: string,
  distractors?: string[],   // exactly 3
  // spoken only:
  guidance?: string,
  note?: string,
}
```

To regenerate audio after editing questions: `node scripts/generate-audio.mjs` (requires ElevenLabs key).

---

## Tests

Both layers run their suites in parallel across all cores. One command runs everything:

```bash
pnpm test:all        # backend (pytest-xdist) + frontend (vitest), parallel
bash bin/run_tests.sh be   # backend only      (alias: pnpm test:server)
bash bin/run_tests.sh fe   # frontend only
```

`bin/run_tests.sh` is the unified runner — backend uses `pytest -n auto --dist=loadfile`
(one test file per worker), frontend uses `vitest run` (forks a worker per file).
Toggle/limit backend parallelism with `PYTEST_XDIST=0` (serial, for debugging) or
`PYTEST_XDIST_WORKERS=N`.

> Parallelism pays off as the suite grows: worker spin-up (~1s) makes xdist *slower*
> than serial for today's ~34 tiny backend tests, but the harness scales without change.

### Frontend — Vitest (fast, no browser)
```bash
pnpm test --run      # or: pnpm test:run
```
Test files live next to source (`*.test.ts`). Vitest parallelizes files by default:
- `src/utils/quiz.test.ts` — shuffle/sample/buildChoices
- `src/utils/url.test.ts` — URL param read/write
- `src/hooks/useBookmarks.test.ts` — bookmark toggle + localStorage persistence

### Backend — pytest (`server/`)
```bash
# one-time: install dev deps into the uv venv
VIRTUAL_ENV=server/.venv uv pip install -r server/requirements-dev.txt

server/.venv/bin/python -m pytest server/tests                       # serial
server/.venv/bin/python -m pytest server/tests -n auto --dist=loadfile  # parallel
```
Network-free tests (LLM / Whisper / Piper all monkeypatched) in `server/tests/`:
- `test_config.py` — origins parsing + runtime defaults
- `test_grader.py` — JSON extraction, deterministic fallback, LLM happy/error paths
- `test_app.py` — `/health`, `/grade`, `/tts`, `/stt` via FastAPI `TestClient` + rate limiting
- `test_tts.py` — engine selection / fallback / WAV reader
- `test_stt.py` — segment joining + tempfile cleanup

Config: `server/pytest.ini` (pythonpath, 30s per-test timeout). `pytest-xdist` /
`pytest-timeout` / `pytest-cov` are the "special libraries" — in `server/requirements-dev.txt`.

### Playwright (e2e)
```bash
pnpm test:e2e          # launches dev server automatically
pnpm test:e2e --ui     # interactive UI
```
Tests in `e2e/app.spec.ts`: start screen, quiz URL state, bookmark toggle, flash card mode.

---

## After any code change

1. `pnpm test:all` — all Vitest **and** pytest suites must pass (or `pnpm test --run` for frontend-only changes)
2. `npx tsc --noEmit` — TypeScript must compile clean
3. `pnpm lint` — no lint errors
4. If you changed `questions.ts` structure, verify `buildChoices` still works
5. If you changed URL params, update `e2e/app.spec.ts` URL assertions
6. If you changed `server/`, run `bash bin/run_tests.sh be`
