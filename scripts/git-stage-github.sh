#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

git add -A
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ -f "$file" ]] || { echo "Required pinned file missing: $file" >&2; exit 1; }
  git add -f -- "$file"
done < engines/ai-sdk/GIT-FORCE-ADD.txt

git add -f -- process/continuum/powerfarm/contracts/checkpoint.schema.json

echo "Git staging complete: $(git diff --cached --name-only | wc -l | tr -d ' ') paths staged."
