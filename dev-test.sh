#!/usr/bin/env bash
# Disposable test daemon + Vite dev server (see AGENTS.md "Test daemons").
set -euo pipefail

cd "$(dirname "$0")"
MAIN=$(git worktree list | head -1 | awk '{print $1}')

usage() {
  cat >&2 <<'EOF'
Usage:
  ./dev-test.sh start [--offline] [--dir DIR]
      Launch a test daemon + Vite dev server on free alternate ports, with its
      own config and data dir. Claims a .creds account so the web login works;
      --offline seeds wrong creds instead (web login impossible — API testing
      only). Detaches, waits for health, prints the URL and login credentials.
  ./dev-test.sh stop DIR
      Stop the instance launched in DIR and release its .creds claim.
EOF
  exit 1
}

free_port() {
  local p=$1
  while lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null; do p=$((p + 1)); done
  echo "$p"
}

creds_lock() {
  until mkdir "$MAIN/.creds.lock" 2>/dev/null; do
    if [ -d "$MAIN/.creds.lock" ] && [ $(( $(date +%s) - $(stat -f %m "$MAIN/.creds.lock") )) -gt 60 ]; then
      rmdir "$MAIN/.creds.lock" 2>/dev/null || true
      continue
    fi
    sleep 0.5
  done
}

creds_unlock() {
  rmdir "$MAIN/.creds.lock" 2>/dev/null || true
}

claim_account() { # $1: web port; sets SLSK_USER / SLSK_PASS
  if [ ! -f "$MAIN/.creds" ]; then
    echo "$MAIN/.creds not found — ask the human for it" >&2
    exit 1
  fi
  creds_lock
  local tmp="$MAIN/.creds.tmp.$$" line user pass port
  SLSK_USER="" SLSK_PASS=""
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      \#* | "") printf '%s\n' "$line"; continue ;;
    esac
    IFS=/ read -r user pass port <<<"$line"
    if [ -z "$SLSK_USER" ] && { [ -z "${port:-}" ] || ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null; }; then
      SLSK_USER=$user SLSK_PASS=$pass
      printf '%s/%s/%s\n' "$user" "$pass" "$1"
    else
      printf '%s\n' "$line"
    fi
  done < "$MAIN/.creds" > "$tmp"
  mv "$tmp" "$MAIN/.creds"
  creds_unlock
  if [ -z "$SLSK_USER" ]; then
    echo "No free .creds account (every claimed port has a live listener) — ask the human" >&2
    exit 1
  fi
}

release_account() { # $1: web port
  [ -f "$MAIN/.creds" ] || return 0
  creds_lock
  local tmp="$MAIN/.creds.tmp.$$"
  sed "s|/$1\$||" "$MAIN/.creds" > "$tmp" && mv "$tmp" "$MAIN/.creds"
  creds_unlock
}

stop_port() { # TERM the listener on $1, escalate to KILL, verify it cleared
  local port=$1 pid i
  for i in $(seq 12); do
    pid=$(lsof -t -iTCP:"$port" -sTCP:LISTEN || true)
    if [ -z "$pid" ]; then return 0; fi
    if [ "$i" -le 6 ]; then kill $pid 2>/dev/null || true; else kill -9 $pid 2>/dev/null || true; fi
    sleep 0.5
  done
  echo "Port $port still has a listener after kill -9" >&2
  return 1
}

cmd_start() {
  local online=1 dir=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --offline) online=0 ;;
      --dir) dir=${2:?--dir needs a path}; shift ;;
      *) usage ;;
    esac
    shift
  done

  local DIR=${dir:-$(mktemp -d "${TMPDIR:-/tmp}/pseek-test.XXXXXX")}
  mkdir -p "$DIR/data"
  if [ -f "$DIR/instance" ]; then
    echo "$DIR already has an instance file — stop it first or use another dir" >&2
    exit 1
  fi

  local SLSK_PORT WEB_PORT VITE_PORT
  SLSK_PORT=$(free_port $((2300 + RANDOM % 90)))
  WEB_PORT=$(free_port $((7040 + RANDOM % 50)))
  VITE_PORT=$(free_port $((5180 + RANDOM % 40)))

  local SLSK_USER=john SLSK_PASS=wrong-password
  if [ "$online" = 1 ]; then
    claim_account "$WEB_PORT"
  fi

  cat > "$DIR/config" <<EOF
[server]
login = $SLSK_USER
passw = $SLSK_PASS
portrange = ($SLSK_PORT, $SLSK_PORT)

[transfers]
$(grep -E '^(downloaddir|incompletedir|uploaddir|shared) =' ~/.config/psycheseek/config)
EOF

  cat > "$DIR/instance" <<EOF
WEB_PORT=$WEB_PORT
VITE_PORT=$VITE_PORT
ONLINE=$online
EOF

  WEB_PORT=$WEB_PORT VITE_PORT=$VITE_PORT WEB_HOST=127.0.0.1 nohup ./dev.sh \
    -c "$DIR/config" -u "$DIR/data" > "$DIR/dev.log" 2>&1 < /dev/null &

  local i ok=0
  for i in $(seq 120); do
    if curl -sf "http://127.0.0.1:$WEB_PORT/auth/me" >/dev/null \
        && curl -sf -o /dev/null "http://127.0.0.1:$VITE_PORT/"; then
      ok=1
      break
    fi
    sleep 1
  done
  if [ "$ok" != 1 ]; then
    echo "dev server did not come up within 120s; last log lines:" >&2
    tail -20 "$DIR/dev.log" >&2
    if [ "$online" = 1 ]; then release_account "$WEB_PORT"; fi
    rm -f "$DIR/instance"
    exit 1
  fi

  local mode="offline daemon (web login will NOT work — mint a session cookie for API tests)"
  if [ "$online" = 1 ]; then mode="online daemon (.creds account claimed)"; fi
  echo "URL:    http://127.0.0.1:$VITE_PORT"
  echo "Login:  $SLSK_USER / $SLSK_PASS"
  echo "Mode:   $mode"
  echo "Daemon: http://127.0.0.1:$WEB_PORT (web API), Soulseek port $SLSK_PORT"
  echo "Dir:    $DIR (config, data, dev.log)"
  echo "Stop:   ./dev-test.sh stop $DIR"
}

cmd_stop() {
  [ $# -eq 1 ] || usage
  local dir=$1
  if [ ! -f "$dir/instance" ]; then
    echo "No instance file in $dir" >&2
    exit 1
  fi
  # shellcheck disable=SC1091
  . "$dir/instance"
  stop_port "$VITE_PORT"
  stop_port "$WEB_PORT"
  if [ "${ONLINE:-0}" = 1 ]; then release_account "$WEB_PORT"; fi
  rm -f "$dir/instance"
  echo "Stopped; $dir kept for logs"
}

case "${1:-}" in
  start) shift; cmd_start "$@" ;;
  stop) shift; cmd_stop "$@" ;;
  *) usage ;;
esac
