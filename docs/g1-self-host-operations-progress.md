# G1.2 — Self-host operations progress

Date: 2026-11-28

## Scope reviewed

The current Compose deployment contains digest-pinned PostgreSQL, signaling, Coturn and Caddy services. PostgreSQL has a container health check, the signaling service waits for database health and runs embedded migrations before accepting requests, and Caddy serves public HTTPS/WSS. The signaling service runs with one replica because active session state is in memory and restarts end sessions. Backup, restore and deployment configuration helpers are present.

The standalone LAN certificate flow from [G1.1](g1-lan-https-progress.md) uses a direct TLS Go listener. Production Compose continues to terminate external TLS at Caddy and leaves signaling port 8080 unpublished on the host.

## Changes

- The shared PostgreSQL maintenance helper parses `DATABASE_URL`, requires its database, role and password to match `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD`, and requires the internal `postgres` service host. Restore database identifiers are UTF-8-length and character-set checked before being passed to the PostgreSQL container shell.
- `backup-postgres.ps1` writes `pg_dump` output to a same-directory temporary file, checks process status, nonempty content and the plain-SQL dump header, then atomically replaces the destination only after validation succeeds. Failure leaves the previous backup untouched.
- `restore-postgres.ps1` checks the deployment env file and input dump, then invokes `psql` with `ON_ERROR_STOP` and `--single-transaction`. It defaults to the database named by `DATABASE_URL`; `-DatabaseName` supports restoring into a separate empty recovery database. The operator must stop signaling before cutover. The script does not drop or recreate a database.
- The database and deployment guides explain backup file protection and restore transaction behavior.

## Verification

| Check | Result |
|---|---|
| Docker Compose configuration | PASS, rendered configuration accepts `deploy/.env.example` |
| Deployment verifier | PASS for a synthetic test-only configuration. It rejects `deploy/.env.example` placeholders and renders Compose without exposing secrets |
| PowerShell parser | PASS for backup, restore, maintenance helper, deployment verifier and both test fixtures |
| PostgreSQL maintenance fixture | PASS for `DATABASE_URL` host/database/role/password matching, rejecting external or mismatched targets, validating UTF-8/BOM dump headers, rejecting a late header, same-directory replacement semantics and preserving an existing backup when preflight fails |
| Deployment verifier test fixture | PASS for a valid synthetic Compose configuration, template rejection and invalid database host/name/role/password cases |
| Docker Compose environment override check | PASS. A process-level `DATABASE_URL` override is detected after Compose renders its effective environment |
| Docker Engine | NOT VERIFIED. The Docker CLI is installed but its Linux engine endpoint is unavailable |
| Current operator `deploy/.env` | NOT VERIFIED. No local deployment env is present |
| Compose PostgreSQL health, live migrations, backup and restore | NOT VERIFIED without Docker Engine |
| Local PostgreSQL runtime | Previous G0 evidence covers migrations on PostgreSQL 18.2. It does not establish the current Compose database or backup/restore workflow |

No database container, named volume, service or production endpoint was started, stopped, modified or removed during these checks.

## Acceptance still pending

- Run the deployment verifier with a real self-host operator configuration and verify certificate issuance, database health and signaling startup on the target host.
- Exercise backup and restoration against an isolated Compose database and verify restored users/devices before using the procedure for recovery.
- Verify Coturn credentials, P2P preference and TURN relay on real clients and an external network.
- Complete the two-Windows LAN media and input acceptance. A second PC was not reachable on the current host's test ports.
