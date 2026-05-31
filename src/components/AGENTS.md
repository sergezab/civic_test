# src/components/ — screens & UI pieces

Presentational + interaction components. They receive state/callbacks from
`App.tsx` (and the shared `useSpeech` instance) as props; they don't own
cross-screen state.

| File | Role |
|---|---|
| `StartScreen.tsx` | Picks **format** (quiz/flash/interview), **question set** (all / 65-20 / saved), and test **count**. Emits `QuizConfig` (the exported config type). |
| `QuizScreen.tsx` | Multiple-choice flow: read aloud → choose A–D → feedback + accepted answers. Two-step (`ask → choosing → answered`). |
| `FlashScreen.tsx` | Flip-card flow: question → reveal → prev/next, no scoring. |
| `InterviewScreen.tsx` | The spoken interview — **the most complex component**: Manual vs Hands-free modes, silence detection, per-answer countdown, retry flow (outcomes correct/review/missed), grading via `api/interview`, spoken feedback, transcript review + drill. Read it with `hooks/AGENTS.md`. |
| `ResultsScreen.tsx` | Quiz/flash results, pass logic, bookmark-review CTA. |
| `AnswerReveal.tsx` | Shared "accepted answers + note" panel (used by Quiz & Flash). |
| `Header.tsx` | Brand + mute toggle. |
| `ProgressDots.tsx` | Quiz progress dots (✓/✕/current). |

**Conventions:** keep components focused; extract shared UI (like `AnswerReveal`)
rather than duplicating; class names map to `src/index.css`. `InterviewScreen`
uses refs for any value read inside timers/audio callbacks (StrictMode + async).
