#!/bin/sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GIT_DIR="$(git -C "$ROOT" rev-parse --git-dir)"
HOOKS_DIR="$ROOT/$GIT_DIR/hooks"
SRC="$ROOT/scripts/git-hooks/prepare-commit-msg"
DST="$HOOKS_DIR/prepare-commit-msg"

mkdir -p "$HOOKS_DIR"
cp "$SRC" "$DST"
chmod +x "$DST"

echo "Installed: $DST"
