#!/usr/bin/env bash
#
# run-all.sh — start every service in this project with one command.
#
#   Backend  (Node/Express)      http://localhost:8081
#   Frontend (Next.js)           http://localhost:3000
#   Module A (FastAPI)           http://localhost:8001
#   Module B (FastAPI)           http://localhost:8002
#   Module C backend (Flask)     http://localhost:8003
#   Module C frontend (Vite)     http://localhost:5173
#   Module D (FastAPI)           http://localhost:8004
#
# Usage:
#   ./run-all.sh              start everything (logs streamed to logs/)
#   ./run-all.sh --install    (re)install all dependencies, then start
#   ./run-all.sh --no-install skip the auto-install check
#
# Press Ctrl+C once to stop all services cleanly.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

INSTALL=auto
case "${1:-}" in
  --install)    INSTALL=force ;;
  --no-install) INSTALL=skip ;;
esac

PIDS=()
NAMES=()

# ---- OS detection ------------------------------------------------------------
IS_WIN=false
case "$OSTYPE" in
  msys*|cygwin*|win32*) IS_WIN=true ;;
esac

# ---- Python executable -------------------------------------------------------
PYTHON3=""
if $IS_WIN; then
  # Convert LOCALAPPDATA to a POSIX path Git Bash can use
  if command -v cygpath &>/dev/null; then
    _lad="$(cygpath -u "$LOCALAPPDATA")"
  else
    _lad="$LOCALAPPDATA"
  fi
  for _p in \
    "$_lad/Programs/Python/Python313/python.exe" \
    "$_lad/Programs/Python/Python312/python.exe" \
    "$_lad/Programs/Python/Python311/python.exe" \
    "$(command -v python 2>/dev/null)"; do
    [ -f "$_p" ] && { PYTHON3="$_p"; break; }
  done
else
  PYTHON3="$(command -v python3 2>/dev/null || command -v python)"
fi

[ -z "$PYTHON3" ] && { echo "ERROR: Python 3 not found. Install from https://python.org"; exit 1; }

# ---- venv bin dir (bin on Unix, Scripts on Windows) --------------------------
BIN="bin"
$IS_WIN && BIN="Scripts"

# ---- colors ------------------------------------------------------------------
if [ -t 1 ]; then
  G=$'\033[32m'; Y=$'\033[33m'; C=$'\033[36m'; R=$'\033[31m'; B=$'\033[1m'; N=$'\033[0m'
else
  G=; Y=; C=; R=; B=; N=
fi
log()  { printf "%s[run-all]%s %s\n" "$C" "$N" "$*"; }
ok()   { printf "%s[run-all]%s %s\n" "$G" "$N" "$*"; }
warn() { printf "%s[run-all]%s %s\n" "$Y" "$N" "$*"; }

# ---- cleanup -----------------------------------------------------------------
cleanup() {
  echo
  warn "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    if $IS_WIN; then
      taskkill //F //PID "$pid" 2>/dev/null || true
    else
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      fi
    fi
  done
  if ! $IS_WIN; then
    sleep 1
    for pid in "${PIDS[@]}"; do
      kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    done
  fi
  ok "All services stopped."
  exit 0
}
trap cleanup INT TERM

# ---- free a TCP port ---------------------------------------------------------
free_port() {
  local port="$1" name="$2"
  if $IS_WIN; then
    local pids
    pids=$(netstat -ano 2>/dev/null \
      | awk '/TCP.*:'"$port"'[[:space:]].*LISTENING/{print $NF}' \
      | sort -u)
    if [ -n "$pids" ]; then
      warn "port $port ($name) busy — stopping stale process(es): $pids"
      for pid in $pids; do
        taskkill //F //PID "$pid" 2>/dev/null || true
      done
      sleep 1
    fi
  else
    local pids
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u)
    if [ -n "$pids" ]; then
      warn "port $port ($name) busy — stopping stale process(es): $pids"
      # shellcheck disable=SC2086
      kill -TERM $pids 2>/dev/null
      sleep 1
      pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u)
      # shellcheck disable=SC2086
      [ -n "$pids" ] && kill -KILL $pids 2>/dev/null
    fi
  fi
}

# ---- node service helper -----------------------------------------------------
start_node() {
  local name="$1" dir="$2" port="$3" logf="$4" cmd="${5:-npm run dev}"
  if [ ! -d "$ROOT/$dir" ]; then warn "skip $name — $dir not found"; return; fi

  if [ "$INSTALL" = "force" ] || { [ "$INSTALL" = "auto" ] && [ ! -d "$ROOT/$dir/node_modules" ]; }; then
    log "$name: installing npm dependencies..."
    ( cd "$ROOT/$dir" && npm install ) >>"$logf" 2>&1
  fi

  [ -d "$ROOT/$dir/node_modules/.bin" ] && chmod +x "$ROOT/$dir"/node_modules/.bin/* 2>/dev/null

  free_port "$port" "$name"
  log "starting $B$name$N -> $logf"
  ( cd "$ROOT/$dir" && exec $cmd ) >>"$logf" 2>&1 &
  PIDS+=($!); NAMES+=("$name")
}

# ---- python service helper ---------------------------------------------------
start_py() {
  local name="$1" dir="$2" venv="$3" cmd="$4" port="$5" logf="$6"
  if [ ! -d "$ROOT/$dir" ]; then warn "skip $name — $dir not found"; return; fi

  local vpath="$ROOT/$dir/$venv"
  if [ ! -d "$vpath" ]; then
    log "$name: creating virtualenv..."
    "$PYTHON3" -m venv "$vpath" >>"$logf" 2>&1
    INSTALL=force
  fi

  if [ "$INSTALL" = "force" ] || { [ "$INSTALL" = "auto" ] && [ ! -f "$vpath/.deps_installed" ]; }; then
    if [ -f "$ROOT/$dir/requirements.txt" ]; then
      log "$name: installing pip requirements (first run can be slow)..."
      ( "$vpath/$BIN/pip" install -q --upgrade pip \
        && "$vpath/$BIN/pip" install -r "$ROOT/$dir/requirements.txt" ) >>"$logf" 2>&1 \
        && touch "$vpath/.deps_installed"
    fi
  fi

  free_port "$port" "$name"
  log "starting $B$name$N -> $logf"
  ( cd "$ROOT/$dir" && exec "$vpath/$BIN/python" $cmd ) >>"$logf" 2>&1 &
  PIDS+=($!); NAMES+=("$name")
}

# run each child in its own process group for clean teardown
set -m

ok "Launching project services... (logs in $LOG_DIR/)"
echo

# Module D uses local Ollama. Override these variables only when using a
# non-default Ollama host or a different locally installed model.
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:e2b}"
if ! curl -fsS --max-time 2 "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
  if command -v ollama >/dev/null 2>&1; then
    log "starting local Ollama -> $LOG_DIR/ollama.log"
    ollama serve >>"$LOG_DIR/ollama.log" 2>&1 &
    PIDS+=($!); NAMES+=("ollama")
    for _ in {1..20}; do
      curl -fsS --max-time 1 "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1 && break
      sleep 0.5
    done
  else
    warn "Ollama is not installed; Module D will use deterministic fallbacks"
  fi
fi
if command -v ollama >/dev/null 2>&1 && ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$OLLAMA_MODEL"; then
  warn "Ollama model '$OLLAMA_MODEL' is not installed; run: ollama pull $OLLAMA_MODEL"
fi

# --- Python modules (start first so heavy ML imports warm up) -----------------
start_py "module-a"         "python-module-a"         "venv" "api/app.py"   8001 "$LOG_DIR/module-a.log"
start_py "module-b"         "python-module-b"         "venv" "dashboard.py" 8002 "$LOG_DIR/module-b.log"
start_py "module-c-backend" "python-module-c/backend" "venv" "app.py"       8003 "$LOG_DIR/module-c-backend.log"
start_py "module-d"         "python-module-d"         "venv" "main.py"    8004 "$LOG_DIR/module-d.log"

# --- Node services ------------------------------------------------------------
start_node "backend"           "backend"                  8081 "$LOG_DIR/backend.log"
start_node "frontend"          "frontend"                 3000 "$LOG_DIR/frontend.log"
start_node "module-c-frontend" "python-module-c/frontend" 5173 "$LOG_DIR/module-c-frontend.log" "node node_modules/vite/bin/vite.js"

echo
ok "All start commands issued. Services booting up..."
cat <<EOF

  ${B}Service URLs${N}
  ----------------------------------------
  Frontend (Next.js)        ${G}http://localhost:3000${N}
  Backend  (Express API)    ${G}http://localhost:8081${N}
  Module A (FastAPI)        ${G}http://localhost:8001${N}
  Module B (FastAPI)        ${G}http://localhost:8002${N}
  Module C backend (Flask)  ${G}http://localhost:8003${N}
  Module C frontend (Vite)  ${G}http://localhost:5173${N}
  Module D (FastAPI)        ${G}http://localhost:8004${N}

  Live logs:  tail -f $LOG_DIR/*.log
  Stop all:   press ${B}Ctrl+C${N} in this window

EOF

# stream all logs so you see boot output in one place
tail -n 0 -f "$LOG_DIR"/*.log &
PIDS+=($!); NAMES+=("log-tail")

wait
