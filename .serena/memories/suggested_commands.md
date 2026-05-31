# Suggested Commands

## Dev
```bash
pnpm dev            # Vite dev server → http://localhost:5173
pnpm build          # tsc --noEmit + vite build → dist/
pnpm preview        # serve dist/ locally (used by Playwright in CI)
```

## Tests
```bash
pnpm test --run           # Vitest unit tests, single run (fast, no browser, ~1s)
pnpm test                 # Vitest watch mode
pnpm test:e2e             # Playwright e2e — auto-starts pnpm dev if no server on :5173
pnpm test:e2e --ui        # Playwright interactive UI
```

## Type check + lint
```bash
npx tsc --noEmit          # TypeScript compile check (no output)
pnpm lint                 # ESLint
```

## Git / GitHub
```bash
git -C /Users/astra/dev/startups/civic_test <cmd>
# Remote: https://github.com/sergezab/civic_test.git
# Auth: macOS keychain (token stored for github.com)
```

## macOS-specific
- `pnpm` is at `/opt/homebrew/bin/pnpm` — add to PATH or use full path if not found
