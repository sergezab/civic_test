# src/utils/ — pure helpers

Framework-free utilities (unit-tested where logic is non-trivial).

| File | Role | Test |
|---|---|---|
| `quiz.ts` | `shuffle`, `sample(n)`, `buildChoices(question)` (shuffled A–D), `LETTERS`. | `quiz.test.ts` |
| `url.ts` | Read/write/clear the URL query state (`format/mode/pool/q/stage`) for shareable, resumable sessions. | `url.test.ts` |
| `log.ts` | `ilog(scope, msg, data?)`, `now()`, `since(start)` — timestamped console diagnostics, on in dev or via `localStorage.ivDebug=1`. | — |

**Conventions:** keep these pure and side-effect-free (except `url.ts`/`log.ts`
which intentionally touch `window`); they should be trivially testable. Co-locate
`*.test.ts` next to the source.
