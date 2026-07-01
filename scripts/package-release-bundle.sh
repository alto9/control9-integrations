#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_PATH="${1:-${ROOT_DIR}/control9-bundle.tar.gz}"

cd "${ROOT_DIR}"

if [[ ! -f dist/index.js ]]; then
  echo "dist/index.js is missing. Run npm run build before packaging." >&2
  exit 1
fi

if [[ ! -f dist/gitlab/index.js ]]; then
  echo "dist/gitlab/index.js is missing. Run npm run build before packaging." >&2
  exit 1
fi

tar -czf "${OUTPUT_PATH}" dist
echo "Wrote ${OUTPUT_PATH}"
