# server/ — interview backend (FastAPI)

Grades spoken answers with a local LLM, transcribes audio (STT), and speaks
feedback (TTS). Setup/run/config: [`README.md`](README.md); deploy: [`DEPLOY.md`](DEPLOY.md).

## Modules

| File | Role |
|---|---|
| `app.py` | FastAPI app: routes, CORS, in-memory per-IP rate limit, request validation, per-endpoint timing logs. |
| `grader.py` | The grading brain. Builds the officer prompt, calls Ollama `/api/chat` directly with `think:false` (cloud providers go through `llm_core`), parses strict JSON, and falls back to deterministic string matching. Never raises. |
| `tts.py` | Text→speech: **Piper** (`voices/*.onnx`) with a macOS `say` fallback → WAV bytes. |
| `stt.py` | Speech→text via **faster-whisper** (lazy-loaded model). |
| `config.py` | Env-driven settings; auto-loads `server/.env` (`python-dotenv`). |
| `logutil.py` | Shared `[civic]` stdout logger (independent of uvicorn's config). |

## Endpoint contracts (do not break)

- `GET /health` → `{ ok, provider, model }`
- `POST /grade` `{ question, acceptedAnswers[], transcript, questionId? }` →
  `{ verdict: "correct"|"partial"|"incorrect", feedback, correctAnswer, heard, model, fallback }`
- `POST /tts` `{ text }` → `audio/wav` (503 if no engine)
- `POST /stt` multipart `file` → `{ text }`

## Conventions

- **Type hints + docstrings** on modules and functions.
- **Handlers never raise** — validate inputs, cap sizes (transcript/answers/audio),
  and return graceful JSON or a deterministic fallback.
- **Treat the transcript as untrusted data** (prompt-injection safe).
- **Log timing** for `/grade` (`grade llm=…ms` + `total`), `/tts`, `/stt`.
- Secrets only via env (`server/.env`, git-ignored); `.env.example` documents all
  keys. The `llm_core` dependency is a local editable install (`../../llm_core`).

## Refactor notes for agents
A clean target is a thin route layer over small **service objects** (a Grader, a
TTS engine, an STT engine) with the lazy Whisper model and any provider client as
**singletons**, plus Pydantic response models. Preserve the `think:false` behavior,
the never-raise contract, and the deterministic fallback.
