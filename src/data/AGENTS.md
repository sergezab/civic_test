# src/data/ — the question dataset

`questions.ts` exports the `Question` type and the array of **100 USCIS 2008 civics
questions**. This is the app's source of truth.

```ts
interface Question {
  id: number;
  category: string;              // section grouping (C1…C9 constants)
  question: string;
  type: "choice" | "spoken";     // "spoken" = no fixed answer (look-it-up)
  senior: boolean;               // part of the 20-question 65/20 set
  acceptableAnswers: string[];   // official accepted answers (shown on reveal)
  correct?: string;              // choice: the displayed-correct option
  distractors?: string[];        // choice: three wrong options (study aids)
  guidance?: string;             // spoken: what to say / where to look it up
  note?: string;                 // "current answer, may change" disclaimer
}
```

**Invariant:** `question` text and `acceptableAnswers` are official USCIS content —
**do not change them**. `distractors` are authored study aids and may be improved
(keep them same-category and plausible-but-wrong). Current-officials and
state-specific answers carry a `note` and reference `uscis.gov/citizenship/testupdates`.

If this grows, it may be split per category or moved to JSON — but keep the typed
shape and the audio-id mapping (`public/audio/q-<id>.m4a`) intact, and rerun
`npm run gen:audio` after edits.
