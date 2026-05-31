# Tech Stack

- **React 19** + **TypeScript ~6** + **Vite 8** — pure frontend SPA
- **Package manager**: pnpm (use `/opt/homebrew/bin/pnpm`)
- **Test — unit**: Vitest 4 (`jsdom` env, globals, `@testing-library/react`, `@testing-library/jest-dom`)
- **Test — e2e**: Playwright 1.x (`e2e/`, chromium only, `playwright.config.ts`)
- **Lint**: ESLint 10 + `typescript-eslint` + `eslint-plugin-react-hooks`
- **No CSS framework** — single `src/index.css` with CSS custom properties (`--navy-*`, `--bg-*`, etc.)
- **No routing library** — URL state via `window.history.replaceState` only
- **No state management library** — React useState/useCallback + localStorage
- **Audio**: pre-generated `.m4a` files in `public/audio/`; `useSpeech` hook handles playback + Web Speech API fallback
- **CI**: GitHub Actions (`.github/workflows/tests.yml`): `unit` job (Vitest) + `e2e` job (Playwright against `pnpm preview`)
- **Repo**: https://github.com/sergezab/civic_test (public)

## Version pins that matter
- Vite 8 — `vite.config.ts` doubles as Vitest config via `/// <reference types="vitest" />`
- TypeScript ~6 — strict mode on via `tsconfig.app.json`
