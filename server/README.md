# Sales Management System — Backend

Real Node.js + TypeScript + Express backend backed by a persistent SQLite file.

## Driver choice

**`better-sqlite3`** — synchronous, actively maintained, supports WAL and
foreign keys, and keeps repository code simple. No async pool is needed for a
single-file local database.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_PATH` | **yes** | — | Absolute path to the SQLite file. Must be on persistent disk, outside the web root. |
| `PORT` | no | `4000` | HTTP port. |
| `CORS_ORIGIN` | no | `*` | Set to your frontend origin in production. |
| `SQLITE_WAL` | no | `1` | Set to `0` to disable WAL. |
| `SQLITE_BUSY_TIMEOUT_MS` | no | `5000` | Busy timeout. |
| `NODE_ENV` | no | `development` | `test` disables WAL. |

## Run
