# Deploying the public site

Architecture: a **static frontend** (host anywhere) talks to the **interview API**
running on your Mac, exposed to the internet through a **Cloudflare Tunnel**. The
LLM (Ollama), TTS (Piper) and STT (faster-whisper) all run locally and free.

```
visitor browser ──HTTPS──> Cloudflare Tunnel ──> localhost:8088 (FastAPI)
                                                    ├─ llm_core → Ollama (grade)
                                                    ├─ Piper (tts)
                                                    └─ faster-whisper (stt)
```

## 1. Run the API on your Mac

```bash
cd server
uv run uvicorn app:app --host 127.0.0.1 --port 8088
# Ollama must be running with the grader model (qwen3.5:9b) pulled.
```

## 2. Expose it with a Cloudflare Tunnel

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8088
# → prints a public https URL, e.g. https://random-words.trycloudflare.com
```

> ⚠️ This exposes the API (and your local models) to the internet. Keep the
> rate limit on (`RATE_LIMIT_PER_MIN`), and consider a named tunnel + Cloudflare
> Access if you want auth. Quick tunnels are ephemeral; use a **named tunnel**
> with your own domain for a stable URL.

## 3. Point the frontend at the tunnel and build

```bash
# from the project root
echo "VITE_INTERVIEW_API_URL=https://<your-tunnel>.trycloudflare.com" > .env.production.local
npm run build      # outputs dist/
```

Deploy `dist/` to any static host (Cloudflare Pages, Vercel, Netlify, GitHub Pages).

## 4. Lock CORS to your site origin

On the API host, set the allowed origin(s) before starting uvicorn:

```bash
export ALLOWED_ORIGINS="https://your-site.pages.dev"
```

## Hardening already in place

- Per-IP rate limiting (`RATE_LIMIT_PER_MIN`, default 30/min).
- Request caps: transcript length, accepted-answer count, max audio bytes.
- CORS restricted to `ALLOWED_ORIGINS`.
- Graceful degradation: if the API is down, Interview mode shows a notice and
  Quiz/Flash modes keep working; if TTS/STT fail, the UI falls back to text.
- The grader is injection-resistant (treats the transcript as data) and never
  hard-fails (deterministic fallback grade).

## Notes

- Uptime depends on your Mac being awake and online. For always-on, run the API
  on a small Linux box (point `OLLAMA_HOST` at a reachable Ollama, or set
  `GRADER_PROVIDER`/keys for a cloud model via llm_core) and skip the tunnel.
- Cost is $0 on local models. If you switch to a cloud provider for scale, add a
  daily spend cap (the pattern in `_LLM_ROUTER`'s `lib/llm_gateway.py`).
