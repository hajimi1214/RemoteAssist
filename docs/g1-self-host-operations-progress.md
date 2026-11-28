# G1.2 — Self-host operations progress

Date: 2026-11-28

## Scope reviewed

The current Compose deployment contains digest-pinned PostgreSQL, signaling, Coturn and Caddy services. PostgreSQL has a container health check, the signaling service waits for database health and runs embedded migrations before accepting requests, and Caddy serves public HTTPS/WSS. The signaling service runs with one replica because active session state is in memory and restarts end sessions. Backup, restore and deployment configuration helpers are present.

The standalone LAN certificate flow from [G1.1](g1-lan-https-progress.md) uses a direct TLS Go listener. Production Compose continues to terminate external TLS at Caddy and leaves signaling port 8080 unpublished on the host.

## Changes

- The shared PostgreSQL maintenance helper parses `DATABASE_URL`, requires the PostgreSQL service host and matching role/password, and carries the URL database name separately from container-initialization `POSTGRES_DB` for recovery. It validates database names before passing them through `PGDATABASE` and rejects names that libpq would parse as connection strings.
- `backup-postgres.ps1` explicitly targets the configured initialization database, passes the password and database name through container environment variables, writes `pg_dump` output to a same-directory temporary file, validates process status and the plain-SQL dump header, then replaces the destination only after validation succeeds. Passing the name through `PGDATABASE` avoids parsing it as a command-line option or connection string. Failure leaves the previous backup untouched.
- `restore-postgres.ps1` checks the deployment env file and input dump, passes the password and selected database through container environment variables, then invokes `psql` with `ON_ERROR_STOP` and `--single-transaction`. It defaults to the database named by `DATABASE_URL`; `-DatabaseName` supports restoring into a separate empty recovery database. The operator must stop signaling before cutover. The script does not drop or recreate a database.
- The database and deployment guides explain backup file protection and restore transaction behavior.

## Verification

| Check | Result |
|---|---|
| Docker Compose configuration | PASS, rendered configuration accepts `deploy/.env.example` |
| Deployment verifier | PASS for a synthetic test-only configuration. It rejects `deploy/.env.example` placeholders and renders Compose without exposing secrets |
| PowerShell parser | PASS for backup, restore, maintenance helper, deployment verifier, and both test fixtures |
| PostgreSQL maintenance fixture | PASS for Compose host/role/password matching, separate recovery database names, rejecting injection-like identifiers, UTF-8/BOM dump headers, late-header rejection and preserving a prior backup on preflight failure |
| Mocked Docker CLI integration | PASS. A temporary `.local` `docker.exe` mock exercised successful `pg_dump`, failed-dump preservation and partial cleanup, streamed transactional `psql` restore, and SQL-error propagation. A connection-string-shaped database name stayed a literal `PGDATABASE` value. Database passwords were absent from process arguments |
| Deployment verifier test fixture | PASS for live/recovery DB URLs, connection-string-shaped database name rejection, exact public HTTPS and app-origin validation, proxy CIDR validation, template rejection, invalid DB credentials, and process-level overrides of DB, PostgreSQL initialization, Caddy, app origins and trusted proxies |
| Docker Compose rendered environment | PASS. Effective database, signaling, HTTPS, TURN and proxy settings are checked against the validated env file |
| Docker Engine | NOT VERIFIED. The Docker CLI is installed but its Linux engine endpoint is unavailable |
| Current operator `deploy/.env` | NOT VERIFIED. No local deployment env is present |
| Compose PostgreSQL health, live migrations, backup and restore | NOT VERIFIED without Docker Engine |
| Local PostgreSQL runtime | Previous G0 evidence covers migrations on PostgreSQL 18.2. It does not establish the current Compose database or backup/restore workflow |

No database container, named volume, service or production endpoint was started, stopped, modified or removed during these checks.

## Acceptance still pending

- The mocked Docker process validates PowerShell argument and pipe behavior only. PostgreSQL container backup, restore, and rollback remain NOT VERIFIED until Docker Engine and an operator-owned deployment configuration are available.

- Run the deployment verifier with a real self-host operator configuration and verify certificate issuance, database health and signaling startup on the target host.
- Exercise backup and restoration against an isolated Compose database and verify restored users/devices before using the procedure for recovery.
- Verify Coturn credentials, P2P preference and TURN relay on real clients and an external network.
- Complete the two-Windows LAN media and input acceptance. A second PC was not reachable on the current host's test ports.
