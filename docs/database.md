# Database

The canonical PostgreSQL migrations live in `server/internal/database/migrations` and are embedded by the Go migration command. Matching SQL files are mirrored in `server/migrations` for deployment inspection. Migration tests verify the mirrored copies stay identical.

Migration 002 adds case-insensitive unique indexes for usernames and email addresses. It checks for case-folded duplicates before creating the indexes and fails with an actionable error without renaming or deleting accounts if conflicts exist. Normalize or resolve any such legacy accounts before retrying deployment.

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

## Restore

```powershell
.\scripts\restore-postgres.ps1 -Input remoteassist-backup.sql
```
