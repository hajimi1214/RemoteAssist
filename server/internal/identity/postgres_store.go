package identity

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func OpenPostgres(ctx context.Context, databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func (s *PostgresStore) CreateUser(ctx context.Context, user User) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO users (id, username, email, password_hash, created_at, updated_at, disabled_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		user.ID, user.Username, user.Email, user.PasswordHash, user.CreatedAt, user.UpdatedAt, user.DisabledAt)
	if err != nil {
		return mapSQLError(err)
	}
	return nil
}

func (s *PostgresStore) GetUserByLogin(ctx context.Context, login string) (User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, username, email, password_hash, created_at, updated_at, disabled_at FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($1)`, login)
	return scanUser(row)
}

func (s *PostgresStore) GetUserByID(ctx context.Context, id string) (User, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, username, email, password_hash, created_at, updated_at, disabled_at FROM users WHERE id=$1`, id)
	return scanUser(row)
}

func (s *PostgresStore) CreateRefreshToken(ctx context.Context, token RefreshToken) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
		token.ID, token.UserID, token.TokenHash, token.ExpiresAt, token.RevokedAt, token.CreatedAt)
	return mapSQLError(err)
}

func (s *PostgresStore) GetRefreshTokenByHash(ctx context.Context, tokenHash string) (RefreshToken, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, token_hash, expires_at, revoked_at, created_at FROM refresh_tokens WHERE token_hash=$1`, tokenHash)
	var token RefreshToken
	if err := row.Scan(&token.ID, &token.UserID, &token.TokenHash, &token.ExpiresAt, &token.RevokedAt, &token.CreatedAt); err != nil {
		return RefreshToken{}, mapSQLError(err)
	}
	return token, nil
}

func (s *PostgresStore) ConsumeRefreshToken(ctx context.Context, tokenHash string, when time.Time) (RefreshToken, error) {
	row := s.db.QueryRowContext(ctx, `
UPDATE refresh_tokens
SET revoked_at=$2
WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > $2
RETURNING id, user_id, token_hash, expires_at, revoked_at, created_at`, tokenHash, when)
	var token RefreshToken
	if err := row.Scan(&token.ID, &token.UserID, &token.TokenHash, &token.ExpiresAt, &token.RevokedAt, &token.CreatedAt); err != nil {
		return RefreshToken{}, mapSQLError(err)
	}
	return token, nil
}

func (s *PostgresStore) RevokeRefreshToken(ctx context.Context, tokenHash string, when time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked_at=$1 WHERE token_hash=$2 AND revoked_at IS NULL`, when, tokenHash)
	return mapSQLError(err)
}

func (s *PostgresStore) RevokeRefreshTokensForDevice(ctx context.Context, userID, _ string, when time.Time) error {
	_, err := s.db.ExecContext(ctx, `UPDATE refresh_tokens SET revoked_at=$1 WHERE user_id=$2 AND revoked_at IS NULL`, when, userID)
	return mapSQLError(err)
}

func (s *PostgresStore) UpsertDevice(ctx context.Context, device Device) (Device, error) {
	row := s.db.QueryRowContext(ctx, `
INSERT INTO devices (id, user_id, device_name, device_fingerprint, os_name, app_version, note, last_seen_at, created_at, revoked_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
ON CONFLICT (user_id, device_fingerprint) DO UPDATE
SET device_name=EXCLUDED.device_name, os_name=EXCLUDED.os_name, app_version=EXCLUDED.app_version, last_seen_at=EXCLUDED.last_seen_at, revoked_at=NULL
RETURNING id, user_id, device_name, device_fingerprint, os_name, app_version, note, last_seen_at, created_at, revoked_at`,
		device.ID, device.UserID, device.DeviceName, device.DeviceFingerprint, device.OSName, device.AppVersion, device.Note, device.LastSeenAt, device.CreatedAt)
	return scanDevice(row)
}

func (s *PostgresStore) ListDevices(ctx context.Context, userID string) ([]Device, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, user_id, device_name, device_fingerprint, os_name, app_version, note, last_seen_at, created_at, revoked_at FROM devices WHERE user_id=$1 AND revoked_at IS NULL ORDER BY last_seen_at DESC`, userID)
	if err != nil {
		return nil, mapSQLError(err)
	}
	defer rows.Close()
	var out []Device
	for rows.Next() {
		device, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, device)
	}
	return out, mapSQLError(rows.Err())
}

func (s *PostgresStore) UpdateDeviceNote(ctx context.Context, userID, deviceID, note string) (Device, error) {
	row := s.db.QueryRowContext(ctx, `UPDATE devices SET note=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL RETURNING id, user_id, device_name, device_fingerprint, os_name, app_version, note, last_seen_at, created_at, revoked_at`, note, deviceID, userID)
	return scanDevice(row)
}

func (s *PostgresStore) RevokeDevice(ctx context.Context, userID, deviceID string, when time.Time) error {
	result, err := s.db.ExecContext(ctx, `UPDATE devices SET revoked_at=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL`, when, deviceID, userID)
	if err != nil {
		return mapSQLError(err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) HeartbeatDevice(ctx context.Context, userID, deviceID string, when time.Time) (Device, error) {
	row := s.db.QueryRowContext(ctx, `UPDATE devices SET last_seen_at=$1 WHERE id=$2 AND user_id=$3 AND revoked_at IS NULL RETURNING id, user_id, device_name, device_fingerprint, os_name, app_version, note, last_seen_at, created_at, revoked_at`, when, deviceID, userID)
	return scanDevice(row)
}

func (s *PostgresStore) AddAuditLog(ctx context.Context, log AuditLog) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO audit_logs (id, user_id, device_id, event_type, metadata_json, created_at) VALUES ($1,$2,NULLIF($3,''),$4,$5::jsonb,$6)`,
		log.ID, log.UserID, log.DeviceID, log.EventType, log.MetadataJSON, log.CreatedAt)
	return mapSQLError(err)
}

type scanner interface {
	Scan(dest ...any) error
}

func scanUser(row scanner) (User, error) {
	var user User
	if err := row.Scan(&user.ID, &user.Username, &user.Email, &user.PasswordHash, &user.CreatedAt, &user.UpdatedAt, &user.DisabledAt); err != nil {
		return User{}, mapSQLError(err)
	}
	return user, nil
}

func scanDevice(row scanner) (Device, error) {
	var device Device
	if err := row.Scan(&device.ID, &device.UserID, &device.DeviceName, &device.DeviceFingerprint, &device.OSName, &device.AppVersion, &device.Note, &device.LastSeenAt, &device.CreatedAt, &device.RevokedAt); err != nil {
		return Device{}, mapSQLError(err)
	}
	return device, nil
}

func mapSQLError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
		return ErrConflict
	}
	return err
}
