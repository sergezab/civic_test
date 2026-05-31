# Conventions

## General
- No comments unless WHY is non-obvious. No docstrings.
- Single CSS file (`src/index.css`) — add styles there, not inline or in modules.
- CSS custom properties: `--navy-*`, `--bg-*`, `--ink*`, `--green*`, `--red*`, `--shadow*`, `--radius`, `--serif`, `--sans`.

## Component patterns
- Each screen component receives only what it needs; no context/global store.
- `QuizScreen` manages its own `stage` state ("ask" → "choosing" → "answered") and calls `setUrlParams({ stage })` on every change.
- `FlashScreen` manages its own `index` + `flipped` state; calls `setUrlParams({ q, stage })` on every card change.
- Bookmark button always rendered inside `.question-bar > .question-meta` div; `margin-left: auto` right-aligns it.
- `key={question.id}` on `<QuizScreen>` — forces full remount on question change (resets stage/selected state).

## URL state
- Written via `setUrlParams` (replaceState, no history entry).
- Always has: `format`, `mode`, `pool`, `q` (question id as string), `stage`.
- On app mount: if `format + mode + pool` present → auto-start quiz at `q` (moves it to front of session list).
- `clearUrlParams()` called on: home navigation, quiz completion.

## Question data (`src/data/questions.ts`)
- `type: "choice"` → must have `correct` (string) + `distractors` (string[3]).
- `type: "spoken"` → `correct`/`distractors` absent; has optional `guidance` + `note`.
- `senior: true` = part of 65/20 subset (20 questions marked ★).
- `id` must match audio file `public/audio/q-{id}.m4a`.

## Bookmark hook
- `useBookmarks()` initializes synchronously from localStorage (safe to read in mount effects).
- Storage key: `"civic_bookmarks"` (JSON number array).
- Toggle is idempotent: add if absent, remove if present.

## Tests
- Unit tests in `src/**/*.test.ts` (excluded from Playwright via `include` in `vite.config.ts`).
- `src/test-setup.ts` runs `localStorage.clear()` in `beforeEach` — no manual clear needed in unit tests.
- E2e tests must manually clear `civic_bookmarks` via `page.evaluate(() => localStorage.removeItem('civic_bookmarks'))` when bookmark state matters.
