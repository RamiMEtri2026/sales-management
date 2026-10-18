#!/usr/bin/env bash
# Pre-commit scan: fail if secrets or database files are staged.
# Run manually or wire into a pre-commit hook.
#
# Usage:
#   ./scripts/check-secrets.sh

set -euo pipefail

FAIL=0

echo "[check] scanning staged files for database files..."
if git diff --cached --name-only | grep -E '\.(db|sqlite|sqlite3)(-wal|-shm|-journal)?$'; then
  echo "[check] ERROR: a database file is staged. Remove it and add it to .gitignore." >&2
  FAIL=1
fi

echo "[check] scanning staged files for .env files..."
if git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example'; then
  echo "[check] ERROR: a .env file is staged. Only .env.example may be committed." >&2
  FAIL=1
fi

echo "[check] scanning staged files for private keys..."
if git diff --cached --name-only | grep -E '\.(pem|key|p12|pfx)$'; then
  echo "[check] ERROR: a private key is staged." >&2
  FAIL=1
fi

echo "[check] scanning staged content for common secret patterns..."
PATTERNS='(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'"'"'][^"'"'"']{8,}'
if git diff --cached -U0 | grep -Ei "${PATTERNS}" | grep -v 'REPLACE_WITH' | grep -v 'example'; then
  echo "[check] WARNING: possible hardcoded secret in staged content. Review the lines above." >&2
  FAIL=1
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "[check] FAILED. Fix the issues above before committing." >&2
  exit 1
fi

echo "[check] OK. No database files, .env files, keys, or obvious secrets staged."