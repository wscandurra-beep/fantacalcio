#!/usr/bin/env bash
set -euo pipefail

target="${1:-main}"
if ! git rev-parse --verify --quiet "$target^{commit}" >/dev/null; then
  printf 'Cannot check merge conflicts: ref %s is not available locally.\n' "$target" >&2
  exit 2
fi

if output=$(git merge-tree --write-tree --name-only HEAD "$target" 2>&1); then
  printf 'No merge conflicts detected between HEAD and %s.\n' "$target"
else
  printf '%s\n' "$output" >&2
  printf 'Merge conflicts detected between HEAD and %s.\n' "$target" >&2
  exit 1
fi
