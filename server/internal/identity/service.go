package identity

import (
	"context"
	"crypto/rand"
	"encoding/base32"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"time"
)

type ServiceConfig struct {
	AccessSecret       string
	RefreshSecret      string
	AccessTTL          time.Duration
	RefreshTTL         time.Duration
	DeviceOfflineAfter time.Duration
	Now                func() time.Time
}

type Service struct {
	store Store
	cfg   ServiceConfig
}

type AuthResult struct {
	User         User   `json:"user"`
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresAt    string `json:"expiresAt"`
}

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{3,40}$`)

func NewService(store Store, cfg ServiceConfig) (*Service, error) {
	if err := requireSecret(cfg.AccessSecret); err != nil {
		return nil, err
	}
	if err := requireSecret(cfg.RefreshSecret); err != nil {
		return nil, err
	}
	if cfg.AccessTTL <= 0 {
		cfg.AccessTTL = 15 * time.Minute
	}
	if cfg.RefreshTTL <= 0 {
		cfg.RefreshTTL = 30 * 24 * time.Hour
	}
	if cfg.DeviceOfflineAfter <= 0 {
		cfg.DeviceOfflineAfter = 2 * time.Minute
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Service{store: store, cfg: cfg}, nil
}

func (s *Service) Register(ctx context.Context, username, email, password string) (AuthResult, error) {
	username = strings.TrimSpace(username)
	email = strings.ToLower(strings.TrimSpace(email))
	if !usernamePattern.MatchString(username) {
		return AuthResult{}, ErrInvalidInput
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return AuthResult{}, ErrInvalidInput
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return AuthResult{}, err
	}
	now := s.cfg.Now()
	user := User{ID: newID("usr"), Username: username, Email: email, PasswordHash: passwordHash, CreatedAt: now, UpdatedAt: now}
	if err := s.store.CreateUser(ctx, user); err != nil {
		return AuthResult{}, err
	}
	_ = s.audit(ctx, user.ID, "", "auth.register", "{}")
	return s.issueTokens(ctx, user)
}

func (s *Service) Login(ctx context.Context, login, password string) (AuthResult, error) {
	user, err := s.store.GetUserByLogin(ctx, strings.ToLower(strings.TrimSpace(login)))
	if err != nil || user.DisabledAt != nil || !VerifyPassword(user.PasswordHash, password) {
		return AuthResult{}, ErrInvalidCredentials
	}
	_ = s.audit(ctx, user.ID, "", "auth.login", "{}")
	return s.issueTokens(ctx, user)
}

func (s *Service) Refresh(ctx context.Context, refreshToken string) (AuthResult, error) {
	hash := HashRefreshToken(refreshToken, s.cfg.RefreshSecret)
	stored, err := s.store.ConsumeRefreshToken(ctx, hash, s.cfg.Now())
	if errors.Is(err, ErrNotFound) || errors.Is(err, ErrRevoked) {
		return AuthResult{}, ErrUnauthorized
	}
	if err != nil {
		return AuthResult{}, err
	}
	user, err := s.store.GetUserByID(ctx, stored.UserID)
	if err != nil || user.DisabledAt != nil {
		return AuthResult{}, ErrUnauthorized
	}
	return s.issueTokens(ctx, user)
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return ErrInvalidInput
	}
	return s.store.RevokeRefreshToken(ctx, HashRefreshToken(refreshToken, s.cfg.RefreshSecret), s.cfg.Now())
}

func (s *Service) Me(ctx context.Context, accessToken string) (User, error) {
	claims, err := ParseAccessToken(accessToken, s.cfg.AccessSecret, s.cfg.Now())
	if err != nil {
		return User{}, err
	}
	return s.store.GetUserByID(ctx, claims.Subject)
}

func (s *Service) RegisterDevice(ctx context.Context, accessToken, name, fingerprint, osName, appVersion string) (Device, error) {
	user, err := s.Me(ctx, accessToken)
	if err != nil {
		return Device{}, err
	}
	name = strings.TrimSpace(name)
	fingerprint = strings.TrimSpace(fingerprint)
	if name == "" || fingerprint == "" || len(fingerprint) > 256 {
		return Device{}, ErrInvalidInput
	}
	now := s.cfg.Now()
	device := Device{
		ID:                newID("dev"),
		UserID:            user.ID,
		DeviceName:        name,
		DeviceFingerprint: fingerprint,
		OSName:            nonEmpty(osName, "Windows"),
		AppVersion:        nonEmpty(appVersion, "0.1.0"),
		LastSeenAt:        now,
		CreatedAt:         now,
	}
	created, err := s.store.UpsertDevice(ctx, device)
	if err == nil {
		_ = s.audit(ctx, user.ID, created.ID, "device.register", "{}")
	}
	created.Online = s.isOnline(created, now)
	created.Current = true
	return created, err
}

func (s *Service) ListDevices(ctx context.Context, accessToken, currentDeviceID string) ([]Device, error) {
	user, err := s.Me(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	devices, err := s.store.ListDevices(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	now := s.cfg.Now()
	for i := range devices {
		devices[i].Online = s.isOnline(devices[i], now)
		devices[i].Current = devices[i].ID == currentDeviceID
	}
	return devices, nil
}

func (s *Service) UpdateDevice(ctx context.Context, accessToken, deviceID, note string) (Device, error) {
	user, err := s.Me(ctx, accessToken)
	if err != nil {
		return Device{}, err
	}
	device, err := s.store.UpdateDeviceNote(ctx, user.ID, deviceID, strings.TrimSpace(note))
	if err != nil {
		return Device{}, err
	}
	device.Online = s.isOnline(device, s.cfg.Now())
	return device, nil
}

func (s *Service) RevokeDevice(ctx context.Context, accessToken, deviceID string) error {
	user, err := s.Me(ctx, accessToken)
	if err != nil {
		return err
	}
	now := s.cfg.Now()
	if err := s.store.RevokeDevice(ctx, user.ID, deviceID, now); err != nil {
		return err
	}
	_ = s.store.RevokeRefreshTokensForDevice(ctx, user.ID, deviceID, now)
	return s.audit(ctx, user.ID, deviceID, "device.revoke", "{}")
}

func (s *Service) Heartbeat(ctx context.Context, accessToken, deviceID string) (Device, error) {
	user, err := s.Me(ctx, accessToken)
	if err != nil {
		return Device{}, err
	}
	device, err := s.store.HeartbeatDevice(ctx, user.ID, deviceID, s.cfg.Now())
	if err != nil {
		return Device{}, err
	}
	device.Online = true
	return device, nil
}

func (s *Service) issueTokens(ctx context.Context, user User) (AuthResult, error) {
	now := s.cfg.Now()
	access, err := NewAccessToken(user, s.cfg.AccessSecret, s.cfg.AccessTTL, now)
	if err != nil {
		return AuthResult{}, err
	}
	refresh, err := NewRefreshToken()
	if err != nil {
		return AuthResult{}, err
	}
	stored := RefreshToken{
		ID:        newID("rft"),
		UserID:    user.ID,
		TokenHash: HashRefreshToken(refresh, s.cfg.RefreshSecret),
		ExpiresAt: now.Add(s.cfg.RefreshTTL),
		CreatedAt: now,
	}
	if err := s.store.CreateRefreshToken(ctx, stored); err != nil {
		return AuthResult{}, err
	}
	return AuthResult{User: user, AccessToken: access, RefreshToken: refresh, ExpiresAt: now.Add(s.cfg.AccessTTL).Format(time.RFC3339)}, nil
}

func (s *Service) audit(ctx context.Context, userID, deviceID, typ, metadata string) error {
	return s.store.AddAuditLog(ctx, AuditLog{ID: newID("aud"), UserID: userID, DeviceID: deviceID, EventType: typ, MetadataJSON: metadata, CreatedAt: s.cfg.Now()})
}

func (s *Service) isOnline(device Device, now time.Time) bool {
	return device.RevokedAt == nil && now.Sub(device.LastSeenAt) <= s.cfg.DeviceOfflineAfter
}

func newID(prefix string) string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	return prefix + "_" + strings.ToLower(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf))
}

func nonEmpty(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
