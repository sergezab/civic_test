# Deploying the public site

Architecture: a **static frontend** (host anywhere) talks to the **interview API**
running on your Mac, exposed to the internet through a **Cloudflare Tunnel**. The
LLM (Ollama), TTS (Piper) and STT (faster-whisper) all run locally and free.

```
visitor browser ──HTTPS──> Cloudflare Tunnel ──> localhost:8090 (FastAPI)
                                                    ├─ llm_core → Ollama (grade)
                                                    ├─ Piper (tts)
                                                    └─ faster-whisper (stt)
```

> **Voice needs HTTPS end-to-end.** The mic + speech recognition only work on a
> secure origin, and an HTTPS page can't call an HTTP API (mixed content). The setup
> below is all HTTPS (static host + Cloudflare Tunnel), so voice works. For LAN
> testing without a tunnel, run the frontend with `npm run dev:https` and accept the
> self-signed cert once.

## Model backends & auto-start (Ollama + MLX)

The grader can run on **Ollama** (default) or a local **MLX** server (Apple-Silicon,
often faster). Both are long-running local services that auto-start at login:

| Backend | Port | Auto-start mechanism | Notes |
|---------|------|----------------------|-------|
| Ollama | 11434 | Homebrew LaunchAgent (`brew services`) | Default grader (`GRADER_PROVIDER=ollama`). |
| MLX server | 8088 | per-user LaunchAgent in `~/Library/LaunchAgents/` | Select with `GRADER_PROVIDER=mlx` (see below). |

To grade on MLX instead of Ollama, set in `server/.env`:

```bash
GRADER_PROVIDER=mlx
MLX_BASE_URL=http://localhost:8088   # base URL or /v1 URL both work
GRADER_MODEL=<model id the MLX server serves>   # GET {MLX_BASE_URL}/v1/models
# MLX_API_KEY=...   # optional — only if the server is secured behind a tunnel
```

The grader calls the MLX server's OpenAI-compatible `/v1/chat/completions`
directly (the shared `llm_core` has no MLX provider, so — like Ollama — civic_test
talks to it directly). If MLX is unreachable or returns junk, grading falls back
to deterministic string matching, same as every other provider.

> **Backend port:** civic_test defaults to **8090**. Start with
> `bash bin/civicctl.sh start`, override per-run with
> `bash bin/civicctl.sh start --port <PORT>`, or change the repo-wide default
> with `CIVIC_BACKEND_PORT` in `server/.env`.

### New-machine setup

```bash
# Ollama (default grader)
brew install ollama
brew services start ollama
ollama pull "$GRADER_MODEL"        # see server/.env (default qwen3.5:9b)

# MLX server (optional, faster grading)
python3 -m venv ~/mlx-env
~/mlx-env/bin/pip install mlx-lm mlx-vlm mlx-audio fastapi "uvicorn[standard]"

# Set this to your actual LaunchAgent plist if you named it differently.
PLIST="$HOME/Library/LaunchAgents/com.astra.mlx-vlm.plist"
LABEL="$(/usr/libexec/PlistBuddy -c 'Print :Label' "$PLIST")"

launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL"
```

> **No `source ~/mlx-env/bin/activate` needed.** Calling the venv's binary by its
> absolute path (`~/mlx-env/bin/pip`) installs into the venv just like activating
> would, without mutating your shell. At runtime the server is launched by launchd
> (the plist points straight at `~/mlx-env/bin/python`), so there's no shell to
> activate either. Activate it yourself only if you want to run the server by hand.

MLX loads the model into VRAM on the **first** request, so that grade can take
~20–30 s; subsequent grades are fast.

### Manage / troubleshoot

```bash
# Ollama
brew services list                 # is ollama running?
brew services restart ollama

# MLX server
PLIST="$HOME/Library/LaunchAgents/com.astra.mlx-vlm.plist"  # or your plist path
LABEL="$(/usr/libexec/PlistBuddy -c 'Print :Label' "$PLIST")"

launchctl list | grep -F "$LABEL"      # running? empty output means not loaded
launchctl print "gui/$(id -u)/$LABEL"  # richer status

# Reload after editing the plist. `bootout` may fail if the job is not loaded yet;
# that is okay if the following `bootstrap` succeeds.
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"  # restart now
tail -f ~/Library/Logs/mlx-vlm.err.log   # startup / crash logs
```

**Common issues**

- **8090 already in use** — find the holder with
  `lsof -nP -iTCP:8090 -sTCP:LISTEN`; run the civic_test API on another `--port`
  (or set `CIVIC_BACKEND_PORT`).
- **Slow first grade (~20–30 s)** — model loading into VRAM. For Ollama set
  `OLLAMA_KEEP_ALIVE=2h` to keep it warm; watch the `[civic] grade llm=…ms` log.
- **MLX agent has a non-zero exit code** in `launchctl list` — usually a missing
  `~/mlx-env` venv or `mlx_vlm` not installed; read `~/Library/Logs/mlx-vlm.err.log`.
  After editing the plist, run `bootout`, `bootstrap`, then `kickstart` to apply
  changes.
- **Your plist or service label is named differently** — set `PLIST` to the actual
  file under `~/Library/LaunchAgents/`. The commands derive `LABEL` from the
  plist, so they work even when the label is not `com.astra.mlx-vlm`.
- **`launchctl unload -w ...` fails with `Unload failed: 5: Input/output error`** —
  `load` / `unload` are legacy commands and can be opaque on current macOS.
  Do not retry a `~/Library/LaunchAgents/...` plist with `sudo`; that switches to
  the LaunchDaemons/root domain and produces warnings like "Expecting a
  LaunchDaemons path since the command was run as root." Use the `gui/$(id -u)`
  commands above instead. `bootout` can also fail with error 5 when the job is not
  loaded; continue with `bootstrap`. If `bootstrap` and `kickstart` succeed and
  the log shows "Uvicorn running", the service is up. If `bootstrap` fails,
  validate the plist with `plutil -lint "$PLIST"` and inspect
  `~/Library/Logs/mlx-vlm.err.log`.

## 1. Run the API on your Mac

```bash
cd server
uv run uvicorn app:app --host 127.0.0.1 --port 8090
# Ollama reachable with your grader model pulled (see server/.env: OLLAMA_HOST / GRADER_MODEL).
```

## 2. Expose it with a Cloudflare Tunnel

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8090
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

> Alternative: serve the API under the **same origin** as the site (a reverse proxy
> mapping `/grade`, `/tts`, `/stt`, `/health` → the tunnel). Then leave
> `VITE_INTERVIEW_API_URL` unset (relative paths) — no CORS needed.

## 4. Lock CORS to your site origin

On the API host, set the allowed origin(s) before starting uvicorn:

```bash
export ALLOWED_ORIGINS="https://your-site.pages.dev"
```

## Hardening already in place

- Per-IP rate limiting (`RATE_LIMIT_PER_MIN`, default 30/min).
- Request caps: transcript length, accepted-answer count, max audio bytes.
- CORS restricted to `ALLOWED_ORIGINS`.
- `x-request-id` is echoed on every response and logged with request timing.
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
- First grade after idle can take ~20–30 s while the model loads into VRAM. Set
  `OLLAMA_KEEP_ALIVE=2h` on the Ollama host (or use a smaller model) to keep it warm.
  Watch the `[civic] grade llm=…ms` log to confirm.
