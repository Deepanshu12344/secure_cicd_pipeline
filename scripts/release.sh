#!/bin/sh
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
if [ -z "$ROOT" ]; then
  echo "Unable to find git repo root."
  exit 1
fi

cd "$ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty. Commit changes before tagging."
  exit 1
fi

TAG="v$1"
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "Tagged and pushed $TAG"
