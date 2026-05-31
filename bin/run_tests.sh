#!/usr/bin/env bash
# Fast parallel test runner — backend (pytest-xdist) + frontend (vitest).
#
# Both layers run their tests across all cores:
#   - backend:  pytest -n auto --dist=loadfile  (one test file per worker)
#   - frontend: vitest run                       (vitest forks a worker per file)
#
# Usage:
#   bash bin/run_tests.sh            # backend + frontend
#   bash bin/run_tests.sh be         # backend only (pytest)
#   bash bin/run_tests.sh fe         # frontend only (vitest)
#   bash bin/run_tests.sh --help
#
# Env:
#   PYTEST_XDIST=0              run backend serially (easier to debug)
#   PYTEST_XDIST_WORKERS=4     explicit backend worker count (default: auto)
#   CIVIC_PY=/path/to/python   backend interpreter (default: server/.venv/bin/python)

set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

PY="${CIVIC_PY:-${REPO_ROOT}/server/.venv/bin/python}"

# ── Colours ──────────────────────────────────────────────────────────────────
G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[34m'; D=$'\033[2m'; N=$'\033[0m'
hdr()  { echo ""; echo "${B}── $* ──${N}"; }
ok()   { echo "${G}✓${N} $*"; }
fail() { echo "${R}✗${N} $*"; }
warn() { echo "${Y}⚠${N} $*"; }

# Whole seconds elapsed since $1 (epoch). pytest/vitest print their own precise
# durations; this is just the wall-clock for the wrapper line.
elapsed() { echo "$(( $(date +%s) - $1 ))s"; }

run_backend() {
    hdr "Backend (pytest)"
    if [[ ! -x "$PY" ]]; then
        warn "backend python not found at $PY — skipping (set CIVIC_PY or create server/.venv)"
        return 0
    fi
    if ! "$PY" -c "import pytest" 2>/dev/null; then
        warn "pytest not installed — run: VIRTUAL_ENV=server/.venv uv pip install -r server/requirements-dev.txt"
        return 0
    fi

    local xdist=()
    if [ "${PYTEST_XDIST:-1}" != "0" ] && "$PY" -c "import xdist" 2>/dev/null; then
        xdist=(-n "${PYTEST_XDIST_WORKERS:-auto}" --dist=loadfile)
        echo "${D}parallel: pytest ${xdist[*]}${N}"
    else
        echo "${D}serial (xdist disabled or unavailable)${N}"
    fi

    local t0; t0=$(date +%s)
    # ${arr[@]+"${arr[@]}"} = safe empty-array expansion under `set -u` (bash 3.2).
    if "$PY" -m pytest server/tests ${xdist[@]+"${xdist[@]}"}; then
        ok "backend passed ($(elapsed "$t0"))"
        return 0
    else
        fail "backend FAILED ($(elapsed "$t0"))"
        return 1
    fi
}

run_frontend() {
    hdr "Frontend (vitest)"
    local t0; t0=$(date +%s)
    if pnpm exec vitest run; then
        ok "frontend passed ($(elapsed "$t0"))"
        return 0
    else
        fail "frontend FAILED ($(elapsed "$t0"))"
        return 1
    fi
}

case "${1:-all}" in
    be|backend)  run_backend; exit $? ;;
    fe|frontend) run_frontend; exit $? ;;
    -h|--help)
        sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        exit 0 ;;
    all|"")
        rc=0
        run_backend  || rc=1
        run_frontend || rc=1
        hdr "Summary"
        [ "$rc" -eq 0 ] && ok "all suites passed" || fail "one or more suites failed"
        exit $rc ;;
    *)
        fail "unknown target: $1 (use: be | fe | all)"; exit 2 ;;
esac
