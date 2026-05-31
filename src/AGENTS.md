# src/ — frontend (React + TypeScript)

Single-page app. **`App.tsx`** is the orchestrator: it owns the phase state
machine (`start | quiz | results`), builds a session of `Question[]` from the
chosen pool/count, syncs state to the URL (`utils/url.ts`), and renders the active
screen by `config.format` (`quiz | flash | interview`).

- **`main.tsx`** — React root; imports `index.css`.
- **`index.css`** — the entire visual system (navy/serif theme, all component
  styles). Semantic class names; no CSS-in-JS.
- **`vite-env.d.ts`** — Vite client types (`import.meta.env`).

Subfolders each have their own `AGENTS.md`:
- `components/` — the screens and presentational pieces.
- `hooks/` — speech/recognition/recorder/bookmarks (browser-API wrappers).
- `data/` — the 100-question dataset + `Question` type.
- `api/` — client for the interview backend.
- `utils/` — sampling, URL state, logging.

**Conventions:** functional components + hooks only; lift cross-screen state to
`App`; persist UI prefs in `localStorage`; every screen degrades gracefully when a
capability (mic, backend, audio) is missing.
