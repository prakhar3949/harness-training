#!/usr/bin/env bash
set -euo pipefail

# Run from the repo root no matter where the script is called from
cd "$(dirname "$0")/.."

steps=(typecheck lint test eval test:e2e)

for step in "${steps[@]}"; do
  echo ""
  echo "==> npm run $step"
  npm run --silent "$step"
done

echo ""
echo "verify: all steps passed"