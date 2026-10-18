#!/usr/bin/env bash
# Create a fresh development database, run migrations, load sanitized fixtures.
# Safe to re-run: it refuses to overwrite an existing dev database unless
# --reset is passed, in which case it moves the old one aside (never deletes).
#
# Usage:
#   ./scripts/dev-db.sh            # create if missing
#   ./scripts/dev-db.sh --reset    # move existing aside and recreate

set -euo pipefail

DEV_DIR="./.dev"
DEV_DB="${DEV_DIR}/sales.db"

if [[ "${1:-}" == "--reset" && -f "${DEV_DB}" ]]; then
  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  mv "${DEV_DB}" "${DEV_DB}.pre-reset-${STAMP}"
  echo "[dev-db] existing database moved to ${DEV_DB}.pre-reset-${STAMP}"
fi

mkdir -p "${DEV_DIR}"

if [[ ! -f "${DEV_DB}" ]]; then
  echo "[dev-db] creating ${DEV_DB}"
  DATABASE_PATH="${DEV_DB}" npm run migrate
else
  echo "[dev-db] ${DEV_DB} already exists; applying any pending migrations"
  DATABASE_PATH="${DEV_DB}" npm run migrate
fi

echo "[dev-db] loading sanitized fixtures"
DATABASE_PATH="${DEV_DB}" npm run seed:dev

echo "[dev-db] done. Development database ready at ${DEV_DB}"
echo "[dev-db] start the backend with: DATABASE_PATH=${DEV_DB} npm run start:server"