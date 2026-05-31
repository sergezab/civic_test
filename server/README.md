# Civics Interview API

Backend for the **Interview** mode of the civics test trainer. It grades a user's
spoken answer with an LLM, transcribes audio (STT), and speaks the officer's
feedback (TTS). Runs against your Ollama; can be exposed publicly via a Cloudflare
Tunnel (see `DEPLOY.md`).

## Setup

```bash
cd server
uv venv
uv pip install -r requirements.txt
uv pip install -e ../../llm_core        # the shared LLM library
cp .env.example .env                    # adjust OLLAMA_HOST / GRADER_MODEL etc.
```

## Run

```bash
# Ollama must be reachable with the grader model pulled.
uv run uvicorn app:app --host 0.0.0.0 --port 8088
```

`config.py` auto-loads `server/.env`, so plain `uvicorn app:app` picks up your
settings. The committed `.env` may point at a LAN Ollama (e.g. a Mac Studio).

## Endpoints

- `GET  /health` → `{ ok, provider, model }`
- `POST /grade` → `{ question, acceptedAnswers: string[], transcript, questionId? }`
  → `{ verdict: "correct"|"partial"|"incorrect", feedback, correctAnswer, heard, model, fallback }`
- `POST /stt` — multipart `file` (audio) → `{ text }` (faster-whisper)
- `POST /tts` — `{ text }` → `audio/wav` (Piper, with macOS `say` fallback)

If the LLM is unavailable or returns malformed output, `/grade` falls back to a
deterministic string-match grade (`fallback: true`) so the UI always gets a verdict.
For thinking models (qwen3.x) the grade call sends `think:false` so the model
answers immediately. `/grade` also returns the same JSON when the transcript is
empty ("I didn't catch an answer").

## Configuration (`.env`)

| Var | Default | Purpose |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama endpoint |
| `GRADER_PROVIDER` / `GRADER_MODEL` | `ollama` / `qwen3.5:9b` | grading LLM |
| `GRADE_TIMEOUT` / `GRADE_MAX_TOKENS` / `GRADE_TEMPERATURE` | `45` / `300` / `0.2` | grading limits |
| `ALLOWED_ORIGINS` | `localhost:5173,127.0.0.1:5173` | CORS allow-list (direct access) |
| `RATE_LIMIT_PER_MIN` / `MAX_TRANSCRIPT_CHARS` | `30` / `600` | abuse guards |
| `TRUST_PROXY_HEADERS` | `0` | use `X-Forwarded-For` for client rate-limit keys behind a trusted proxy |
| `GRADE_CONCURRENCY` / `TTS_CONCURRENCY` / `STT_CONCURRENCY` | `1` / `1` / `1` | local model/subprocess concurrency caps |
| `LOG_LEVEL` | `INFO` | backend logger verbosity |
| `TTS_ENGINE` / `PIPER_VOICE` | `piper` / `voices/en_US-lessac-medium.onnx` | feedback voice |
| `WHISPER_MODEL` / `WHISPER_DEVICE` / `WHISPER_COMPUTE` | `base.en` / `cpu` / `int8` | STT model |

> If the first grade after idle stalls ~20–30 s, the model was **cold-loaded** into
> VRAM. Keep it resident with `OLLAMA_KEEP_ALIVE=2h` on the Ollama host, or use a
> smaller model (e.g. `llama3.2:3b`).

## Logging

All timing logs print to stdout as `[civic]` lines (see `logutil.py`) with a
configurable `LOG_LEVEL`. Each response includes an `x-request-id`; pass your own
header to correlate browser/proxy/server traces, or let the API generate one.
Logs include `grade llm=…ms`, `/grade total=…ms`, `/tts …ms`, `/stt …ms`, and a
`grade FALLBACK after …ms (reason)` line when the LLM path fails. Pair with the
frontend's `[api]`/`[iv]` console logs to localise latency.

## Frontend wiring

By default the frontend calls the API at a **relative path** through the Vite dev
proxy (or a production reverse proxy) — same origin, so no CORS and no mixed-content
when served over HTTPS. To call this server **directly** instead, set
`VITE_INTERVIEW_API_URL` (and add that origin to `ALLOWED_ORIGINS`). If the API is
unreachable, Interview mode degrades gracefully and Quiz/Flash keep working.

> **Voice (mic/STT) needs a secure browser origin** — `https://` or
> `http://localhost`. Over a plain-HTTP LAN address the mic is blocked; run the
> frontend with `npm run dev:https` for network voice.
