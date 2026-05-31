# Preparing for the Oath — U.S. Civics Test Trainer

A practice app for the **U.S. naturalization civics test (2008 version)**. It reads
each question aloud and lets you study in three ways — multiple-choice **Quiz**,
**Flash cards**, and a spoken **Interview** where an AI USCIS officer grades your
answers by voice and replies with spoken feedback.

All 100 official civics questions are included, with current officials' answers
(President, Vice President, Speaker, etc.) and Utah-specific answers (senators,
governor, capital) filled in from `uscis.gov/citizenship/testupdates`.

---

## Three study modes

| Mode | What it does |
|------|--------------|
| **Quiz** | Hear the question, pick **A–D**, get instant feedback and the official accepted answers. Mirrors the Smithsonian "Preparing for the Oath" flow. |
| **Flash cards** | Hear the question, recall the answer out loud, then **flip** the card to check it. No scoring — pure review, with Prev/Next navigation. |
| **Interview** | **Speak** your answer; an LLM grades it like a real officer (accepting paraphrases), tells you the verdict, and **speaks** feedback back. Real-exam scoring: 6 of 10 to pass, with early stop. The closest practice to the actual oral test. |

### Shared features
- **Read-aloud audio** for every question (pre-generated, reliable — see below).
- **Mute / Repeat** controls.
- **Question sets:** All 100 · the 20-question **65/20** senior set · your **★ Saved** bookmarks.
- **Bookmarks** — star any question while studying and review just those later.
- **Shareable/resumable URL state** — the current mode, set, and question are encoded in the URL.
- **Test (10 questions, pass = 6/10)** or **Practice (whole set)** for each mode.

---

## Architecture

```
┌────────────────────────────┐         ┌─────────────────────────────────────┐
│  Frontend (React + Vite)   │         │  Interview backend (FastAPI, server/)│
│  • Quiz / Flash / Interview │  HTTPS  │  • POST /grade  → llm_core → Ollama   │
│  • pre-generated question   │ ──────► │  • POST /tts    → Piper (say fallback)│
│    audio (public/audio)     │         │  • POST /stt    → faster-whisper      │
│  • Web Speech / MediaRecorder│        │  • /health, rate limit, CORS          │
└────────────────────────────┘         └─────────────────────────────────────┘
        static host                       runs on your Mac (Cloudflare Tunnel
   (Vercel / Pages / Netlify)              exposes it publicly, all models local)
```

- **Quiz and Flash modes are fully static** — they need no backend.
- **Interview mode** calls the backend. If the backend is unreachable, Interview
  mode shows a friendly notice and the other two modes keep working.

---

## Project structure

```
civic_test/
├── src/
│   ├── App.tsx                  # orchestrates phases (start / quiz / results) + URL state
│   ├── data/questions.ts        # the 100 civics questions, answers, distractors, notes
│   ├── components/
│   │   ├── StartScreen.tsx       # format + question-set picker
│   │   ├── QuizScreen.tsx        # A/B/C/D quiz flow
│   │   ├── FlashScreen.tsx       # flip-card flow
│   │   ├── InterviewScreen.tsx   # spoken interview flow
│   │   ├── AnswerReveal.tsx      # shared accepted-answers panel
│   │   ├── ResultsScreen.tsx     # quiz results
│   │   ├── Header.tsx · ProgressDots.tsx
│   ├── hooks/
│   │   ├── useSpeech.ts           # plays pre-generated question audio (+ Web Speech fallback)
│   │   ├── useSpeechRecognition.ts# Web Speech API (speech-to-text in browser)
│   │   ├── useRecorder.ts         # MediaRecorder → server STT fallback
│   │   └── useBookmarks.ts        # saved questions (localStorage)
│   ├── api/interview.ts          # client for /grade, /tts, /stt
│   └── utils/ quiz.ts · url.ts
├── public/audio/                 # q-1.m4a … q-100.m4a (macOS `say` voice)
├── scripts/generate-audio.mjs    # regenerates the question audio
├── server/                       # Interview backend (FastAPI) — see server/README.md
└── server/DEPLOY.md              # public deployment runbook (Cloudflare Tunnel)
```

---

## Quick start

### 1. Frontend (Quiz + Flash work standalone)
```bash
npm install
npm run dev          # http://localhost:5173
```

### 2. Interview backend (for the Interview mode)
```bash
cd server
uv venv
uv pip install -r requirements.txt
uv pip install -e ../../llm_core     # shared LLM library
uv run uvicorn app:app --port 8088
```
Requirements: **Ollama** running with the grader model pulled (`qwen3.5:9b` by
default). Piper TTS and faster-whisper STT install via `requirements.txt`; the
Piper voice lives in `server/voices/`.

The frontend finds the backend at `VITE_INTERVIEW_API_URL` (defaults to
`http://localhost:8088`). See `.env.example`.

---

## How each piece works

### Question audio (read-aloud)
Question audio is **pre-generated** into `public/audio/q-<id>.m4a` using the macOS
`say` voice, then played as static files. This is deliberate — the browser's live
Web Speech synthesis proved unreliable, whereas static audio plays consistently
everywhere. Regenerate after editing questions:
```bash
npm run gen:audio          # node scripts/generate-audio.mjs  (macOS: say + afconvert)
```

### The questions data (`src/data/questions.ts`)
Each entry has the question, the **officially accepted answers**, and for
multiple-choice it adds three hand-written **distractors** (USCIS doesn't publish
wrong answers). Questions whose answers change (current officials) or are
state-specific carry a **note** with the current answer and a reminder to verify
at `uscis.gov/citizenship/testupdates`. "Name your U.S. Representative" stays a
spoken/look-it-up card because it depends on your exact address.

### Interview grading (the LLM)
The backend sends the question, accepted answers, and your transcribed answer to a
local LLM (via `llm_core` → Ollama, with `think:false` for speed) and asks for a
strict JSON verdict: `correct | partial | incorrect`, a one-sentence spoken
feedback, and the best answer to say. It accepts **paraphrases and synonyms** like
a real officer. If the LLM is down or replies with junk, a deterministic
string-match grader takes over so you always get a verdict.

### Speech in / out
- **Speech-to-text:** Web Speech API in Chrome/Edge; **MediaRecorder → `/stt`
  (faster-whisper)** fallback for Safari/Firefox; typed input always available.
  You can **edit the transcript** before submitting, so a mis-hearing never costs
  you a question.
- **Text-to-speech (feedback):** **Piper** on the backend (macOS `say` fallback),
  returned as WAV and played in the browser. Text is always shown too.

---

## Backend API

Base URL = `VITE_INTERVIEW_API_URL`.

| Method · Path | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ ok, provider, model }` |
| `POST /grade` | `{ question, acceptedAnswers[], transcript, questionId? }` | `{ verdict, feedback, correctAnswer, heard, model, fallback }` |
| `POST /tts` | `{ text }` | `audio/wav` |
| `POST /stt` | multipart `file` (audio) | `{ text }` |

### Configuration (env, `server/.env.example`)
| Var | Default | Purpose |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |
| `GRADER_PROVIDER` / `GRADER_MODEL` | `ollama` / `qwen3.5:9b` | grading LLM |
| `GRADE_TIMEOUT` / `GRADE_MAX_TOKENS` | `45` / `300` | grading limits |
| `ALLOWED_ORIGINS` | `localhost:5173` | CORS allow-list |
| `RATE_LIMIT_PER_MIN` | `30` | per-IP request cap |
| `TTS_ENGINE` / `PIPER_VOICE` | `piper` / bundled | feedback voice |
| `WHISPER_MODEL` / `_DEVICE` / `_COMPUTE` | `base.en` / `cpu` / `int8` | STT model |

> Tip: for faster grading, point `GRADER_MODEL` at a small non-reasoning model
> (e.g. `llama3.2:3b`) — grading civics answers doesn't need a large model.

---

## Deployment

The intended setup: static frontend on a free host + the API on your Mac exposed
via a **Cloudflare Tunnel** (all models stay local and free). Full runbook:
[`server/DEPLOY.md`](server/DEPLOY.md). Hardening already in place: per-IP rate
limiting, CORS lock, request/audio caps, injection-resistant grading, and graceful
degradation when the backend or TTS/STT is unavailable.

---

## Browser support
- **Quiz / Flash:** all modern browsers.
- **Interview speech-in:** best in **Chrome/Edge** (Web Speech API). Safari/Firefox
  use the server-side Whisper fallback; typing works anywhere.
- **Audio playback:** all modern browsers (m4a/AAC + WAV).

## Privacy
Spoken answers are transcribed and graded only to produce feedback; **audio is not
stored**. With Web Speech, transcription happens via the browser's provider; the
Whisper fallback transcribes on your own backend.

## Tech stack
React 19 · TypeScript · Vite · Vitest + Playwright · FastAPI · llm_core/Ollama ·
Piper TTS · faster-whisper.

## Disclaimer
A study tool based on the USCIS 2008 civics test. Answers about current officials
change — always verify at **uscis.gov/citizenship/testupdates**. Not affiliated
with USCIS or the Smithsonian.
