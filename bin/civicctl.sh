#!/usr/bin/env bash
# Civic Test — Service Manager (backend + frontend)
#
# Usage:
#   bash bin/civicctl.sh start            # start backend (uvicorn) + frontend (vite) in background
#   bash bin/civicctl.sh stop             # stop both services
#   bash bin/civicctl.sh restart          # stop then start
#   bash bin/civicctl.sh status           # show running status + health + recent log lines
#   bash bin/civicctl.sh logs             # tail both logs live (colour-coded)
#   bash bin/civicctl.sh logs backend     # backend log only
#   bash bin/civicctl.sh logs frontend    # frontend log only
#   bash bin/civicctl.sh repair           # reinstall frontend deps + verify backend venv
#   bash bin/civicctl.sh help
#
# Options (apply to start/restart):
#   --port PORT        backend port (default: 8090, env: CIVIC_BACKEND_PORT)
#   --ui-port PORT     frontend port (default: 5173)
#   --no-reload        disable uvicorn auto-reload
#
# Related:
#   server/app.py      <- FastAPI app entry point (uvicorn app:app)
#   server/.venv       <- backend virtualenv (python + uvicorn)
#   src/api/interview.ts <- frontend talks to the backend at VITE_INTERVIEW_API_URL

set -uo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# Backend python: prefer the project venv, override with CIVIC_PY.
PY="${CIVIC_PY:-${REPO_ROOT}/server/.venv/bin/python}"

LOG_DIR="$REPO_ROOT/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
DISPATCH_LOG="$LOG_DIR/frontend-dispatch.log"
BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"
DISPATCH_PID_FILE="$LOG_DIR/frontend-dispatch.pid"
DISPATCH_SCRIPT="$REPO_ROOT/bin/dev-https-dispatcher.mjs"

SERVER_DIR="$REPO_ROOT/server"

# ── Defaults ─────────────────────────────────────────────────────────────────
# Backend port. Defaults to 8090.
# Precedence: --port flag > CIVIC_BACKEND_PORT env > server/.env > 8090 default.
# server/.env can set the repo-wide default for civicctl runs.
if [ -z "${CIVIC_BACKEND_PORT:-}" ] && [ -f "$SERVER_DIR/.env" ]; then
    _env_port=$(grep -E '^[[:space:]]*CIVIC_BACKEND_PORT=' "$SERVER_DIR/.env" 2>/dev/null \
        | tail -n1 | cut -d= -f2 | tr -d '[:space:]')
    [ -n "$_env_port" ] && CIVIC_BACKEND_PORT="$_env_port"
fi
PORT="${CIVIC_BACKEND_PORT:-8090}"
UI_PORT=5173
UI_HOST="0.0.0.0"   # bind wildcard so http://<host>.lan:5173 works on the LAN
RELOAD="--reload"
UI_HTTPS=0          # --https → serve Vite over self-signed TLS (mic needs secure ctx)

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

info() { echo -e "${CYAN}▸${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }

# ── Helpers ──────────────────────────────────────────────────────────────────
is_running() {
    local pid_file="$1"
    [ -f "$pid_file" ] || return 1
    local pid; pid=$(cat "$pid_file" 2>/dev/null || true)
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    # A dead reloader parent can linger as a zombie that still passes kill -0.
    local stat=""
    if command -v ps >/dev/null 2>&1; then
        stat=$(ps -o stat= -p "$pid" 2>/dev/null | awk 'NR==1 {print $1}')
    fi
    case "$stat" in Z*|*Z*) return 1 ;; esac
    return 0
}

kill_service() {
    local name="$1" pid_file="$2"
    if is_running "$pid_file"; then
        local pid; pid=$(cat "$pid_file")
        info "Stopping $name (PID $pid)…"
        pkill -P "$pid" 2>/dev/null || true   # children first (uvicorn reloader / vite)
        kill "$pid" 2>/dev/null || true
        local i=0
        while kill -0 "$pid" 2>/dev/null && [ $i -lt 10 ]; do sleep 0.5; ((i++)); done
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        rm -f "$pid_file"
        ok "$name stopped"
    else
        warn "$name is not running"
        rm -f "$pid_file"
    fi
}

# Free a port of any orphans (uvicorn --reload / vite spawn children that can
# outlive the tracked PID).
free_port() {
    local port="$1" label="$2"
    local pids; pids=$(lsof -ti :"$port" 2>/dev/null || true)
    [ -z "$pids" ] && return 0
    info "Cleaning up orphan ${label} process(es) on port ${port}…"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null || true
}

parse_options() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --port)      PORT="$2"; shift 2 ;;
            --port=*)    PORT="${1#--port=}"; shift ;;
            --ui-port)   UI_PORT="$2"; shift 2 ;;
            --ui-port=*) UI_PORT="${1#--ui-port=}"; shift ;;
            --no-reload) RELOAD=""; shift ;;
            --https)     UI_HTTPS=1; shift ;;
            --http)      UI_HTTPS=0; shift ;;
            *)           shift ;;
        esac
    done
}

mkdir -p "$LOG_DIR"

# ── Commands ─────────────────────────────────────────────────────────────────
cmd_start() {
    parse_options "$@"

    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║   Civic Test — Starting Services      ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════╝${NC}"
    echo ""

    # In --https mode Vite binds an internal loopback port; a small TCP
    # dispatcher fronts UI_PORT, forwarding TLS bytes and replying 301 to
    # plain-HTTP so http://host:PORT/ doesn't ERR_EMPTY_RESPONSE.
    local UI_INTERNAL_PORT=$((UI_PORT + 100))
    local VITE_BIND_HOST="$UI_HOST"
    local VITE_BIND_PORT="$UI_PORT"
    if [[ "$UI_HTTPS" == "1" ]]; then
        VITE_BIND_HOST="127.0.0.1"
        VITE_BIND_PORT="$UI_INTERNAL_PORT"
    fi

    # Sweep any orphan listeners (children of a previous run that outlived their
    # PID file) so the new processes can bind cleanly instead of falling back to
    # localhost-only or failing with "Address already in use".
    is_running "$BACKEND_PID_FILE"  || free_port "$PORT"    "backend"
    is_running "$DISPATCH_PID_FILE" || free_port "$UI_PORT" "dispatcher"
    is_running "$FRONTEND_PID_FILE" || free_port "$VITE_BIND_PORT" "frontend"

    # ── Backend (uvicorn) ────────────────────────────────────────────────────
    if is_running "$BACKEND_PID_FILE"; then
        warn "Backend already running (PID $(cat "$BACKEND_PID_FILE"))"
    elif [[ ! -x "$PY" ]]; then
        fail "Backend python not found at: $PY"
        echo "  Create the venv: python3 -m venv --prompt civictest server/.venv && server/.venv/bin/pip install -r server/requirements.txt" >&2
        echo "  Or set CIVIC_PY to a python with fastapi+uvicorn installed." >&2
    elif ! "$PY" -c "import fastapi, uvicorn" 2>/dev/null; then
        fail "fastapi/uvicorn not installed in $PY"
        echo "  Run: $PY -m pip install -r server/requirements.txt   (or: bash bin/civicctl.sh repair)" >&2
    else
        info "Starting backend (uvicorn on :${PORT})…"
        {
            echo ""
            echo "════════════════════════════════════════"
            echo "  SESSION STARTED: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "  Port: $PORT  Reload: ${RELOAD:-disabled}"
            echo "════════════════════════════════════════"
        } >> "$BACKEND_LOG"
        (
            cd "$SERVER_DIR" || exit 1
            # shellcheck disable=SC2086
            nohup "$PY" -m uvicorn app:app $RELOAD \
                --host 0.0.0.0 --port "$PORT" --log-level info \
                >> "$BACKEND_LOG" 2>&1 &
            echo $! > "$BACKEND_PID_FILE"
        )
        ok "Backend started  →  PID $(cat "$BACKEND_PID_FILE")  log: logs/backend.log"
    fi

    # ── Frontend (Vite) ──────────────────────────────────────────────────────
    if is_running "$FRONTEND_PID_FILE"; then
        warn "Frontend already running (PID $(cat "$FRONTEND_PID_FILE"))"
    else
        if [[ ! -d "${REPO_ROOT}/node_modules" ]]; then
            info "Installing frontend dependencies (npm install)…"
            (cd "$REPO_ROOT" && npm install)
        fi
        local scheme="http"
        [[ "$UI_HTTPS" == "1" ]] && scheme="https"
        local API_PROXY_TARGET="http://localhost:${PORT}"
        info "Starting frontend (Vite on ${VITE_BIND_HOST}:${VITE_BIND_PORT}, scheme=${scheme}, API proxy=${API_PROXY_TARGET})…"
        {
            echo ""
            echo "════════════════════════════════════════"
            echo "  SESSION STARTED: $(date '+%Y-%m-%d %H:%M:%S')"
            echo "  Bind:   ${VITE_BIND_HOST}:${VITE_BIND_PORT}  Scheme: ${scheme}"
            echo "  API:    ${API_PROXY_TARGET}"
            echo "════════════════════════════════════════"
        } >> "$FRONTEND_LOG"
        (
            cd "$REPO_ROOT" || exit 1
            # HTTPS=1 makes vite.config.ts enable the basicSsl plugin (self-signed cert).
            API_PROXY="$API_PROXY_TARGET" HTTPS="$UI_HTTPS" nohup npm exec --no -- vite --host "$VITE_BIND_HOST" --port "$VITE_BIND_PORT" --strictPort \
                >> "$FRONTEND_LOG" 2>&1 &
            echo $! > "$FRONTEND_PID_FILE"
        )
        ok "Frontend started →  PID $(cat "$FRONTEND_PID_FILE")  log: logs/frontend.log"
    fi

    # ── HTTPS dispatcher (only when --https) ─────────────────────────────────
    if [[ "$UI_HTTPS" == "1" ]]; then
        if is_running "$DISPATCH_PID_FILE"; then
            warn "Dispatcher already running (PID $(cat "$DISPATCH_PID_FILE"))"
        else
            info "Starting HTTPS dispatcher (:${UI_PORT} → 127.0.0.1:${UI_INTERNAL_PORT}, HTTP→301)…"
            {
                echo ""
                echo "════════════════════════════════════════"
                echo "  SESSION STARTED: $(date '+%Y-%m-%d %H:%M:%S')"
                echo "  Public: ${UI_HOST}:${UI_PORT}  →  127.0.0.1:${UI_INTERNAL_PORT}"
                echo "════════════════════════════════════════"
            } >> "$DISPATCH_LOG"
            (
                cd "$REPO_ROOT" || exit 1
                PUBLIC_PORT="$UI_PORT" UPSTREAM_PORT="$UI_INTERNAL_PORT" BIND_HOST="$UI_HOST" \
                    nohup node "$DISPATCH_SCRIPT" >> "$DISPATCH_LOG" 2>&1 &
                echo $! > "$DISPATCH_PID_FILE"
            )
            ok "Dispatcher started → PID $(cat "$DISPATCH_PID_FILE")  log: logs/frontend-dispatch.log"
        fi
    fi

    # ── Health probe ─────────────────────────────────────────────────────────
    echo ""
    info "Waiting for services to be ready…"
    sleep 3
    local be_ok=false fe_ok=false
    local fe_scheme="http"
    [[ "$UI_HTTPS" == "1" ]] && fe_scheme="https"
    curl -sf --max-time 3 "http://localhost:${PORT}/health" &>/dev/null && be_ok=true
    # -k: self-signed cert when UI_HTTPS=1 (basicSsl plugin).
    curl -skf --max-time 3 "${fe_scheme}://localhost:${UI_PORT}" &>/dev/null && fe_ok=true
    echo ""
    $be_ok && ok "Backend  →  http://localhost:${PORT}  (docs: http://localhost:${PORT}/docs)" \
           || warn "Backend not responding yet — check: bash bin/civicctl.sh logs backend"
    $fe_ok && ok "Frontend →  ${fe_scheme}://localhost:${UI_PORT}" \
           || warn "Frontend not responding yet — check: bash bin/civicctl.sh logs frontend"
    if [[ "$UI_HTTPS" == "1" ]]; then
        echo -e "${DIM}  LAN: ${fe_scheme}://$(hostname -s).lan:${UI_PORT}  (self-signed cert — accept the browser warning)${NC}"
        echo -e "${DIM}       http:// on the same port → 301 redirect to https://${NC}"
    fi
    echo ""
}

cmd_stop() {
    echo ""
    info "Stopping Civic Test services…"
    kill_service "Backend"  "$BACKEND_PID_FILE"
    free_port "$PORT" "backend"
    kill_service "Dispatcher" "$DISPATCH_PID_FILE"
    kill_service "Frontend"   "$FRONTEND_PID_FILE"
    free_port "$UI_PORT" "frontend"
    free_port $((UI_PORT + 100)) "frontend(internal)"
    echo ""
}

cmd_restart() { cmd_stop; sleep 1; cmd_start "$@"; }

cmd_status() {
    parse_options "$@"
    echo ""
    echo -e "${BOLD}── Civic Test — Service Status ──${NC}"
    echo ""

    if is_running "$BACKEND_PID_FILE"; then
        ok "Backend   running  (PID $(cat "$BACKEND_PID_FILE"))"
        local health
        health=$(curl -sf --max-time 2 "http://localhost:${PORT}/health" 2>/dev/null || echo "")
        [ -n "$health" ] && echo -e "           ${DIM}health: $health${NC}" \
                         || warn "          /health not responding on :${PORT}"
    else
        rm -f "$BACKEND_PID_FILE"; fail "Backend   stopped"
    fi
    echo ""
    if is_running "$FRONTEND_PID_FILE"; then
        ok "Frontend  running  (PID $(cat "$FRONTEND_PID_FILE"))"
        # Detect scheme by probing http first, then https (covers --https mode).
        local fe_url="http://localhost:${UI_PORT}"
        if ! curl -sf --max-time 2 "$fe_url" &>/dev/null; then
            curl -skf --max-time 2 "https://localhost:${UI_PORT}" &>/dev/null && fe_url="https://localhost:${UI_PORT}"
        fi
        curl -skf --max-time 2 "$fe_url" &>/dev/null \
            && echo -e "           ${DIM}${fe_url} responding${NC}" \
            || warn "          Frontend not responding on :${UI_PORT}"
    else
        rm -f "$FRONTEND_PID_FILE"; fail "Frontend  stopped"
    fi

    echo ""
    echo -e "${BOLD}── Recent Logs ──${NC}"
    [ -f "$BACKEND_LOG" ]  && { echo ""; echo -e "${CYAN}backend (last 6 lines):${NC}";  tail -6 "$BACKEND_LOG"  | sed 's/^/  /'; }
    [ -f "$FRONTEND_LOG" ] && { echo ""; echo -e "${CYAN}frontend (last 6 lines):${NC}"; tail -6 "$FRONTEND_LOG" | sed 's/^/  /'; }
    echo ""
    echo -e "${DIM}Live logs: bash bin/civicctl.sh logs${NC}"
    echo ""
}

cmd_repair() {
    echo ""
    echo -e "${BOLD}── Civic Test — Repair Environment ──${NC}"
    echo ""
    if is_running "$BACKEND_PID_FILE" || is_running "$FRONTEND_PID_FILE"; then
        info "Stopping running services before repair…"
        kill_service "Backend"  "$BACKEND_PID_FILE"
        kill_service "Frontend" "$FRONTEND_PID_FILE"
        echo ""
    fi
    local errors=0

    info "Verifying backend venv ($PY)…"
    if [[ ! -x "$PY" ]]; then
        warn "venv missing — creating server/.venv…"
        if python3 -m venv --prompt civictest "$SERVER_DIR/.venv"; then PY="$SERVER_DIR/.venv/bin/python"; ok "venv created"
        else fail "could not create venv"; ((errors++)); fi
    fi
    if [[ -x "$PY" ]]; then
        info "Installing backend requirements…"
        if "$PY" -m pip install -r "$SERVER_DIR/requirements.txt" 2>&1 | tail -4; then
            ok "Backend deps installed/verified"
        else fail "pip install failed"; ((errors++)); fi
    fi
    echo ""

    info "Reinstalling frontend dependencies…"
    rm -rf "$REPO_ROOT/node_modules"
    if (cd "$REPO_ROOT" && npm install); then ok "Frontend deps installed"
    else fail "npm install failed"; ((errors++)); fi

    echo ""
    [ "$errors" -eq 0 ] && ok "Repair complete — run: bash bin/civicctl.sh start" \
                        || fail "Repair finished with $errors error(s)"
    echo ""
}

cmd_logs() {
    local target="${1:-both}"
    echo ""
    case "$target" in
        backend)
            echo -e "${CYAN}${BOLD}── Backend log (Ctrl+C to exit) ──${NC}"; echo ""
            tail -f "$BACKEND_LOG" ;;
        frontend)
            echo -e "${CYAN}${BOLD}── Frontend log (Ctrl+C to exit) ──${NC}"; echo ""
            tail -f "$FRONTEND_LOG" ;;
        both|*)
            echo -e "${CYAN}${BOLD}── Backend + Frontend logs (Ctrl+C to exit) ──${NC}"
            echo -e "${DIM}  backend lines prefixed [BE] | frontend [FE]${NC}"; echo ""
            (tail -f "$BACKEND_LOG"  | sed "s/^/${GREEN}[BE]${NC} /") & TAIL_BE=$!
            (tail -f "$FRONTEND_LOG" | sed "s/^/${CYAN}[FE]${NC} /") & TAIL_FE=$!
            trap "kill $TAIL_BE $TAIL_FE 2>/dev/null; echo ''; exit 0" INT TERM
            wait ;;
    esac
}

cmd_help() {
    echo ""
    echo -e "${BOLD}Civic Test — Service Manager (civicctl)${NC}"
    echo ""
    echo "  Usage: bash bin/civicctl.sh <command> [options]"
    echo ""
    echo "  Commands:"
    echo "    start             Start backend (uvicorn) + frontend (vite) in background"
    echo "    stop              Stop both services"
    echo "    restart           Stop then start"
    echo "    status            Show running status + health + recent logs"
    echo "    logs [be|fe]      Tail logs live (colour-coded)"
    echo "    repair            Reinstall frontend deps + verify backend venv"
    echo "    help              Show this message"
    echo ""
    echo "  Options (for start/restart/status):"
    echo "    --port PORT       Backend port (default: 8090, env: CIVIC_BACKEND_PORT)"
    echo "    --ui-port PORT    Frontend port (default: 5173)"
    echo "    --no-reload       Disable uvicorn auto-reload"
    echo "    --https           Serve frontend over self-signed TLS (mic needs secure ctx)"
    echo ""
    echo "  Logs: logs/backend.log  logs/frontend.log"
    echo "  PIDs: logs/backend.pid  logs/frontend.pid"
    echo ""
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
CMD="${1:-help}"; shift 2>/dev/null || true
case "$CMD" in
    start)   cmd_start "$@" ;;
    stop)    cmd_stop ;;
    restart) cmd_restart "$@" ;;
    status)  cmd_status "$@" ;;
    logs)    cmd_logs "$@" ;;
    repair)  cmd_repair ;;
    help|--help|-h) cmd_help ;;
    *) fail "Unknown command: $CMD"; cmd_help; exit 2 ;;
esac
