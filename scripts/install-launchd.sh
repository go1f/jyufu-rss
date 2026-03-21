#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_FILE="$TARGET_DIR/com.jyufu.rss.update.plist"
TEMPLATE="$REPO_ROOT/ops/com.jyufu.rss.update.plist"

mkdir -p "$TARGET_DIR" "$REPO_ROOT/logs"
sed "s#__REPO_ROOT__#$REPO_ROOT#g" "$TEMPLATE" > "$TARGET_FILE"

launchctl bootout "gui/$(id -u)/com.jyufu.rss.update" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$TARGET_FILE"
launchctl kickstart -k "gui/$(id -u)/com.jyufu.rss.update"

echo "Installed LaunchAgent at $TARGET_FILE"
