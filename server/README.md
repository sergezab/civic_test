# Civics Interview API

Backend for the **Interview** mode of the civics test trainer. It grades a user's
spoken answer with an LLM and (Phase 3) speaks the officer's feedback. Runs locally
against your Ollama; exposed publicly via a Cloudflare Tunnel (Phase 4).

## Setup

```bash
cd server
uv venv
uv pip install -r requirements.txt
uv pip install -e ../../llm_core        # the shared LLM library
cp .env.example .env                    # adjust if needed
```

## Run

```bash
# Ollama must be running with the grader model pulled (e.g. qwen3.5:9b)
uv run uvicorn app:app --host 0.0.0.0 --port 8088
```

## Endpoints

- `GET /health` → `{ ok, provider, model }`
- `POST /grade` → body `{ question, acceptedAnswers: string[], transcript, questionId? }`
  → `{ verdict: "correct"|"partial"|"incorrect", feedback, correctAnswer, heard, model, fallback }`
- `POST /stt` (Phase 3) — audio blob → `{ text }` (faster-whisper)
- `POST /tts` (Phase 3) — `{ text }` → `audio/wav` (Piper)

If the LLM is unavailable or returns malformed output, `/grade` falls back to a
deterministic string-match grade (`fallback: true`) so the UI always gets a verdict.

## Frontend wiring

Set `VITE_INTERVIEW_API_URL` in the frontend to this server's URL (e.g.
`http://localhost:8088` locally, or the Cloudflare Tunnel URL in production).
If unset or unreachable, Interview mode degrades gracefully and Quiz/Flash keep working.
