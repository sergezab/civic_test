# Task Completion Checklist

Run these after any code change before considering a task done:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Unit tests
pnpm test --run

# 3. Lint
pnpm lint
```

All three must be clean (zero errors). Fix failures before reporting done.

## Conditional
- If `src/data/questions.ts` structure changed → verify `buildChoices` still works (run unit tests, check `quiz.test.ts`).
- If URL param names/values changed → update assertions in `e2e/app.spec.ts`.
- If new localStorage key added → document in `mem:conventions` and add to `src/test-setup.ts` clear list if needed.
- If new npm dep added → `pnpm install` and commit updated `pnpm-lock.yaml`.
