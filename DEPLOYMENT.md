# Deployment & Recovery Runbook

**Nothing in this document was executed in the preview sandbox.** The sandbox
is browser-only. These are the steps to run on a real host with a persistent
disk. Do not claim deployment is complete until a real deployment has been
performed and verified.

## 1. Pre-deployment checklist

- [ ] Host has a **persistent disk** mounted (verify the platform's behavior
      across redeployments before storing real data).
- [ ] TLS terminates at the edge (nginx/Caddy/ALB). HTTPS is required for
      `Secure` cookies.
- [ ] Secrets are loaded from the platform secret manager, not from files.
- [ ] `DATABASE_PATH` points outside the web root.
- [ ] `BACKUP_DIR` points outside the web root and is writable.
- [ ] `CORS_ORIGINS` lists the exact frontend origin(s). No wildcard.
- [ ] The SQLite file is not reachable by any public HTTP request.

## 2. First-time provisioning
