# Security Controls — Implemented vs. Platform-Required

**Status: none of the runtime controls below were executed in the preview
sandbox.** The sandbox is browser-only; it has no Node process, no filesystem,
and no SQLite. Everything here is source code and documentation to run on a
real host. Do not claim the application is secure merely because login works.

## Implemented in code (this phase)

| Control | Where | Notes |
|---|---|---|
| Argon2id password hashing | `security/passwords.ts` | OWASP-recommended params (19 MiB, t=2, p=1). Rehash-on-login. |
| No plaintext passwords | `security/passwords.ts`, `security/provision.ts` | Only hashes are stored. |
| No hardcoded admin password | `security/provision.ts` | Admin created by one-off command with env-supplied password. Refuses if admin exists. |
| Session tokens hashed at rest | `security/sessions.ts` | SHA-256 of the token is stored; a DB leak yields no usable tokens. |
| HttpOnly + SameSite=Strict cookies | `security/sessions.ts` | `Secure` flag set when `NODE_ENV=production`. |
| CSRF (double-submit) | `security/sessions.ts` | State-changing requests must echo `X-CSRF-Token`. |
| Session expiry + deactivation | `security/sessions.ts` | Expired sessions deleted; deactivated users rejected. |
| Generic auth errors | `routes.secure.ts` | Same message whether the account exists or not; constant-time-ish hash on miss. |
| Login rate limit | `security/rateLimit.ts` | 5 attempts / 15 min per IP+username. |
| Sensitive-endpoint rate limit | `security/rateLimit.ts` | 30 req / min per user. |
| Server-side RBAC | `security/rbac.ts` | `requirePermission` on every protected route. |
| Permission catalog + built-in roles | `security/rbac.ts` | admin, manager, sales, accountant. |
| Strict body validation | `security/validate.ts` | Unknown fields rejected (no mass assignment). |
| Parameterized SQL only | `repositories.ts`, `routes.secure.ts` | No string interpolation of user input. |
| Security headers | `security/headers.ts` | CSP, HSTS (prod), nosniff, DENY framing, referrer policy. |
| CORS allowlist | `security/headers.ts` | Explicit origins from `CORS_ORIGINS`. No wildcard in prod. |
| Consistent SQLite backup | `backup/backup.ts` | `VACUUM INTO` (WAL-safe). Retention + `.keep` protection. |
| Backup log | `backup/backup.ts` | `backup_log` table records timestamp, size, status. |
| Verified restore | `backup/restore.ts` | `PRAGMA integrity_check` before touching production; current DB moved aside, never deleted. |
| Audit log | `repositories.ts` | Append-only `audit_log`; written on login, logout, and every mutation. |
| Secrets kept out of source | `.env.example`, `.gitignore` | `.env`, `*.db`, backups, keys ignored. |

## Requires deployment-platform configuration (NOT in code)

| Control | Why it can't be in code | What to do |
|---|---|---|
| HTTPS / TLS termination | Runs at the reverse proxy or platform edge | Terminate TLS at nginx/Caddy/ALB; redirect HTTP→HTTPS. |
| HSTS preload | Only meaningful over HTTPS | Enable once HTTPS is confirmed. |
| Rate-limit store for multi-process | In-memory store is per-process | Swap `MemoryStore` for Redis when running >1 process. |
| Backup encryption | Depends on storage environment | Encrypt `BACKUP_DIR` at rest (LUKS, EBS encryption, or `age`/`gpg` before upload). |
| Off-site backup replication | Depends on platform | Sync `BACKUP_DIR` to object storage with versioning + object lock. |
| Secret manager | Depends on platform | Load env vars from AWS Secrets Manager / GCP Secret Manager / Vault. |
| Log redaction pipeline | Depends on logging stack | Ensure the log shipper drops `Authorization`, `Cookie`, `password`. |
| WAF / DDoS protection | Edge layer | Put Cloudflare / AWS WAF in front. |
| OS-level file permissions | Host configuration | `chmod 600` on the DB and backups; run the backend as a non-root user. |
| Firewall | Host/network | Only expose the API port to the reverse proxy. |

## Credential rotation (if a secret was ever committed)

Deleting a secret from the latest commit is **not sufficient** — it remains in
git history. If a credential was committed:

1. **Revoke it immediately** at the source (rotate the DB password, invalidate
   the API key, terminate sessions).
2. **Rotate** to a new value and store it in the platform secret manager.
3. **Purge history** with `git filter-repo` (or BFG) and force-push, then have
   every collaborator re-clone.
4. **Assume compromise** for anything the old credential could reach and audit
   access logs for that window.

## Tests that must be run on a real host (not run here)

1. **Unauthorized access** — `GET /api/products` without a session → `401`.
2. **CSRF** — `POST /api/products` with a valid session but no `X-CSRF-Token` → `403`.
3. **Role restriction** — a `sales` user calling `POST /api/products` → `403`.
4. **Invalid input** — `POST /api/products` with `salePrice: -1` → `400`.
5. **Mass assignment** — `POST /api/products` with an extra `role: "admin"` field → `400`.
6. **Session expiration** — set `SESSION_TTL_MS=1000`, wait, call a protected route → `401`.
7. **Deactivated user** — deactivate a user, call a protected route with their session → `401`.
8. **Login rate limit** — 6 failed logins → `429` on the 6th.
9. **Backup** — run `npm run backup`, confirm the file exists and `backup_log` has a `completed` row.
10. **Restore** — corrupt a copy, run `npm run restore` against it → refuses. Restore a good copy → succeeds, current DB moved aside.

## Honest limitations

- The secure router (`routes.secure.ts`) currently implements `auth` and
  `products` fully; the `invoices` route returns `501` until it is wired to the
  invoice repository. The Phase 8 `routes.ts` remains available so no working
  module is removed.
- Password hashing requires the native `argon2` package, which cannot be
  installed in the browser-only preview sandbox. Add it to `package.json` on
  the host.
- No automated test suite is included; the tests above are manual procedures.
- No penetration test has been performed. Passing the checks above does not
  make the application "secure" — it makes it *not obviously broken*.