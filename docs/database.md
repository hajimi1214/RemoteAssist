# Database

The canonical PostgreSQL migrations live in `server/internal/database/migrations` and are embedded by the Go migration command. Matching SQL files are mirrored in `server/migrations` for deployment inspection. Migration tests verify the mirrored copies stay identical. Migrations execute in sorted filename order in one PostgreSQL transaction under an advisory lock. The runner records applied versions and provides no automatic down-migration.

Run `scripts/test-postgres-maintenance.ps1` to exercise local dump-header and Compose database-target validation without connecting to PostgreSQL.

Migration 003 adds case-insensitive unique indexes for usernames and email addresses after the existing migration 002 adds user roles. It checks for case-folded duplicates before creating the indexes and fails with an actionable error without renaming or deleting accounts if conflicts exist. Normalize or resolve any such legacy accounts before retrying deployment.

Migrations 001–003 were exercised through the Go migration runner against a temporary PostgreSQL 18.2 Windows server bound only to `127.0.0.1`. Clean repeat application, case-insensitive uniqueness, separate legacy duplicate username/email preflight failures, and transactional rollback without partial schema changes were checked. Production and Compose database instances remain unverified.

## Tables

- `users`: id, username, email, password_hash, created_at, updated_at, disabled_at
- `devices`: id, user_id, device_name, device_fingerprint, os_name, app_version, note, last_seen_at, created_at, revoked_at
- `refresh_tokens`: id, user_id, token_hash, expires_at, revoked_at, created_at
- `remote_sessions`: id, host_device_id, controller_device_id, connection_code, status, transport_type, created_at, expires_at, ended_at
- `audit_logs`: id, user_id, device_id, event_type, metadata_json, created_at

The database must not save screen content, screenshots, video, keyboard content, plaintext passwords, complete access or refresh tokens, certificates, TURN secrets, or TURN passwords.

## Migration

```powershell
$env:DATABASE_URL="postgres://remoteassist:replace-with-random-postgres-password@localhost:5432/remoteassist?sslmode=disable"
.\scripts\migrate-db.ps1
```

Docker deployment:

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --entrypoint /signaling-migrate signaling
```

## Backup

```powershell
.\scripts\backup-postgres.ps1 -Output remoteassist-backup.sql
```

The script takes the database named by `DATABASE_URL` after validating its Compose host, database, user and password against the PostgreSQL service settings. It writes a plain-SQL dump to a temporary file and replaces the requested output only after `pg_dump` exits successfully and the dump header is verified. The backup contains account and device records and audit metadata. Store it in an access-restricted, encrypted backup location and keep it out of Git.

## Restore

```powershell
.\scripts\restore-postgres.ps1 -Input remoteassist-backup.sql
```

Stop the signaling service before restoring. The target database must be empty. By default, restore targets the database named by `DATABASE_URL`. Restore uses `ON_ERROR_STOP` and one SQL transaction; a SQL error returns a nonzero result and rolls the transaction back. The script does not drop or recreate a database, so existing tables and rows remain in place if restoration fails. Supply `-DatabaseName` to restore a recovery copy into a separate empty database before switching `DATABASE_URL`.
