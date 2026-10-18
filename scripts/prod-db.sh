#!/usr/bin/env bash
# Create the production database on the persistent disk and apply migrations.
# Refuses to run if DATABASE_PATH is not set or points inside the repo.
# Never loads demo data. Never resets tables.
#
# Usage:
#   DATABASE_PATH=/var/lib/sms/sales.db ./scripts/prod-db.sh

set -euo pipefail

if [[ -z "${DATABASE_PATH:-}" ]]; then
  echo "[prod-db] ERROR: DATABASE_PATH is not set." >&2
  echo "[prod-db] Set it to an absolute path on the persistent disk." >&2
  exit 1
fi

case "${DATABASE_PATH}" in
  /*) ;;
  *) echo "[prod-db] ERROR: DATABASE_PATH must be absolute." >&2; exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
case "${DATABASE_PATH}" in
  "${REPO_ROOT}"/*)
    echo "[prod-db] ERROR: DATABASE_PATH must be OUTSIDE the repository." >&2
    echo "[prod-db] Refusing to create a production database inside the repo." >&2
    exit 1
    ;;
esac

DB_DIR="$(dirname "${DATABASE_PATH}")"
mkdir -p "${DB_DIR}"
chmod 700 "${DB_DIR}" || true

echo "[prod-db] applying migrations to ${DATABASE_PATH}"
DATABASE_PATH="${DATABASE_PATH}" npm run migrate

echo "[prod-db] done. Production database ready at ${DATABASE_PATH}"
echo "[prod-db] Next: provision the initial administrator with npm run provision:admin"
echo "[prod-db] Production startup does NOT load demo data and does NOT reset tables."