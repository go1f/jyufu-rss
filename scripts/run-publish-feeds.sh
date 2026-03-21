#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$REPO_ROOT"

if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a
  source "$REPO_ROOT/.env.local"
  set +a
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH: $PATH" >&2
  exit 127
fi

npm run publish:feeds
