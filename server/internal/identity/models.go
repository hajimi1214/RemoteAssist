package identity

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalidInput       = errors.New("invalid input")
	ErrConflict           = errors.New("conflict")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrNotFound           = errors.New("not found")
	ErrRevoked            = errors.New("revoked")
	ErrForbidden          = errors.New("forbidden")
)

type User struct {
	ID           string     `json:"id"`
	Username     string     `json:"username"`
	Email        string     `json:"email"`
	Role         string     `json:"role"`
	PasswordHash string     `json:"-"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	DisabledAt   *time.Time `json:"disabledAt,omitempty"`
}

type Device struct {
	ID                string     `json:"id"`
	UserID            string     `json:"userId"`
	DeviceName        string     `json:"deviceName"`
	DeviceFingerprint string     `json:"deviceFingerprint"`
	OSName            string     `json:"osName"`
	AppVersion        string     `json:"appVersion"`
	Note              string     `json:"note"`
	LastSeenAt        time.Time  `json:"lastSeenAt"`
	CreatedAt         time.Time  `json:"createdAt"`
	RevokedAt         *time.Time `json:"revokedAt,omitempty"`
	Online            bool       `json:"online"`
	Current           bool       `json:"current"`
}

type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
}

type AuditLog struct {
	ID           string
	UserID       string
	DeviceID     string
	EventType    string
	MetadataJSON string
	CreatedAt    time.Time
}

type Store interface {
	CreateUser(ctx context.Context, user User) error
	GetUserByLogin(ctx context.Context, login string) (User, error)
	GetUserByID(ctx context.Context, id string) (User, error)
	CreateRefreshToken(ctx context.Context, token RefreshToken) error
	GetRefreshTokenByHash(ctx context.Context, tokenHash string) (RefreshToken, error)
	ConsumeRefreshToken(ctx context.Context, tokenHash string, when time.Time) (RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, tokenHash string, when time.Time) error
	RevokeRefreshTokensForDevice(ctx context.Context, userID, deviceID string, when time.Time) error
	UpsertDevice(ctx context.Context, device Device) (Device, error)
	ListDevices(ctx context.Context, userID string) ([]Device, error)
	UpdateDeviceNote(ctx context.Context, userID, deviceID, note string) (Device, error)
	RevokeDevice(ctx context.Context, userID, deviceID string, when time.Time) error
	HeartbeatDevice(ctx context.Context, userID, deviceID string, when time.Time) (Device, error)
	AddAuditLog(ctx context.Context, log AuditLog) error
}
