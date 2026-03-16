#!/bin/sh
set -e

ROOT="$(git rev-parse --show-toplevel)"
if [ -z "$ROOT" ]; then
  echo "Unable to find git repo root."
  exit 1
fi

cd "$ROOT"
git config core.hooksPath ".githooks"
chmod +x ".githooks/pre-commit" || true

echo "Git hooks installed at .githooks"
echo "Pre-commit gate enabled."
