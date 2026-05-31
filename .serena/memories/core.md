# civic_test — Core

Pure TypeScript/React frontend. No backend. No database. State: in-memory + localStorage.

## Source map

```
src/
  App.tsx                  # root — phase state machine: "start" | "quiz" | "results"
  index.css                # all styles (single CSS file, no CSS modules)
  main.tsx                 # Vite entry
  data/questions.ts        # 100 USCIS civics questions, typed, with A/B/C/D distractors
  hooks/
    useSpeech.ts           # audio: m4a file playback + Web Speech API fallback
    useBookmarks.ts        # Set<number> of question IDs in localStorage
  utils/
    quiz.ts                # shuffle, sample, buildChoices
    url.ts                 # readUrlParams / setUrlParams / clearUrlParams
  components/
    StartScreen.tsx        # pool + format selector → QuizConfig
    QuizScreen.tsx         # A–D choices + bookmark btn; manages own stage state
    FlashScreen.tsx        # flip-card mode; manages own index + flipped state
    ResultsScreen.tsx      # score display + "Review saved questions" shortcut
    Header.tsx             # brand button (→ home) + mute toggle
    AnswerReveal.tsx       # official USCIS acceptable answers list
    ProgressDots.tsx       # colored dot row for quiz progress
  test-setup.ts            # Vitest globals: jest-dom + localStorage.clear()
e2e/app.spec.ts            # Playwright e2e tests
public/audio/q-{1..100}.m4a  # pre-generated narration, one per question
```

## Invariants

- `questions` array index ≠ question `id`. Always look up by `q.id`, never by array index.
- Audio files are keyed by question `id`: `public/audio/q-{id}.m4a`.
- `TEST_LENGTH = 10` (number of questions in test mode) — defined in `App.tsx`.
- Bookmark storage key: `"civic_bookmarks"` (JSON array of number IDs).
- URL params written on every navigation: `format`, `mode`, `pool`, `q`, `stage`.

## Key types (see `mem:tech_stack` for stack, `mem:conventions` for patterns)

- `QuizConfig = { pool: Pool, mode: Mode, format: Format }` — from `StartScreen.tsx`
- `Pool = "all" | "senior" | "bookmarks"`
- `Mode = "test" | "practice"`
- `Format = "quiz" | "flash"`
- `Phase = "start" | "quiz" | "results"` — `App.tsx` state machine
- `Stage = "ask" | "choosing" | "answered"` — internal to `QuizScreen`
- Flash stage written to URL: `"front"` | `"back"`
