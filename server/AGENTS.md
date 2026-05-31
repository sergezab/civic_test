# server/ — interview backend (FastAPI)

Grades spoken answers with a local LLM, transcribes audio (STT), and speaks
feedback (TTS). Setup/run/config: [`README.md`](README.md); deploy: [`DEPLOY.md`](DEPLOY.md).

## Modules

| File | Role |
|---|---|
| `app.py` | Thin FastAPI route layer: Pydantic models, CORS, in-memory per-IP rate limit, capped uploads, request IDs, and timing logs. |
| `grader.py` | `Grader` service singleton. Blocks obvious prompt-injection/tool-abuse transcripts before the LLM, builds the officer prompt, calls Ollama `/api/chat` directly with `think:false`, parses strict JSON, and falls back to deterministic string matching. Never raises. |
| `tts.py` | `TtsEngine` service singleton. Text→speech via **Piper** (`voices/*.onnx`) with a macOS `say` fallback → WAV bytes. |
| `stt.py` | `SttEngine` service singleton. Speech→text via **faster-whisper** with locked lazy model loading. |
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
- **Treat the transcript as untrusted data**: block injection/tool/file/secret-abuse
  attempts before the LLM and keep the grading prompt tightly scoped to USCIS
  civics evaluation.
- **Log timing** for `/grade` (`grade llm=…ms` + `total`), `/tts`, `/stt`, and
  request lines with `x-request-id`.
- Secrets only via env (`server/.env`, git-ignored); `.env.example` documents all
  keys. The `llm_core` dependency is a local editable install (`../../llm_core`).

## Refactor notes for agents
The backend now follows the intended shape: thin routes over **service singletons**
(`Grader`, `TtsEngine`, `SttEngine`) with bounded concurrency and Pydantic
request/response models. Preserve the `think:false` behavior, the never-raise
grade contract, capped uploads, and the deterministic fallback.
