package identity

import (
	"context"
	"strings"
	"sync"
	"time"
)

type MemoryStore struct {
	mu            sync.Mutex
	users         map[string]User
	userByEmail   map[string]string
	userByName    map[string]string
	refreshTokens map[string]RefreshToken
	devices       map[string]Device
	deviceByFP    map[string]string
	auditLogs     []AuditLog
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:         map[string]User{},
		userByEmail:   map[string]string{},
		userByName:    map[string]string{},
		refreshTokens: map[string]RefreshToken{},
		devices:       map[string]Device{},
		deviceByFP:    map[string]string{},
	}
}

func (s *MemoryStore) CreateUser(_ context.Context, user User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	email := strings.ToLower(user.Email)
	username := strings.ToLower(user.Username)
	if s.userByEmail[email] != "" || s.userByName[username] != "" {
		return ErrConflict
	}
	s.users[user.ID] = user
	s.userByEmail[email] = user.ID
	s.userByName[username] = user.ID
	return nil
}

func (s *MemoryStore) GetUserByLogin(_ context.Context, login string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.userByEmail[strings.ToLower(login)]
	if id == "" {
		id = s.userByName[strings.ToLower(login)]
	}
	user, ok := s.users[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return user, nil
}

func (s *MemoryStore) GetUserByID(_ context.Context, id string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	user, ok := s.users[id]
	if !ok {
		return User{}, ErrNotFound
	}
	return user, nil
}

func (s *MemoryStore) CreateRefreshToken(_ context.Context, token RefreshToken) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.refreshTokens[token.TokenHash] = token
	return nil
}

func (s *MemoryStore) GetRefreshTokenByHash(_ context.Context, tokenHash string) (RefreshToken, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	token, ok := s.refreshTokens[tokenHash]
	if !ok {
		return RefreshToken{}, ErrNotFound
	}
	return token, nil
}

func (s *MemoryStore) RevokeRefreshToken(_ context.Context, tokenHash string, when time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	token, ok := s.refreshTokens[tokenHash]
	if !ok {
		return nil
	}
	token.RevokedAt = &when
	s.refreshTokens[tokenHash] = token
	return nil
}

func (s *MemoryStore) RevokeRefreshTokensForDevice(_ context.Context, userID, _ string, when time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for hash, token := range s.refreshTokens {
		if token.UserID == userID && token.RevokedAt == nil {
			token.RevokedAt = &when
			s.refreshTokens[hash] = token
		}
	}
	return nil
}

func (s *MemoryStore) UpsertDevice(_ context.Context, device Device) (Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := device.UserID + "|" + device.DeviceFingerprint
	if existingID := s.deviceByFP[key]; existingID != "" {
		existing := s.devices[existingID]
		existing.DeviceName = device.DeviceName
		existing.OSName = device.OSName
		existing.AppVersion = device.AppVersion
		existing.LastSeenAt = device.LastSeenAt
		existing.RevokedAt = nil
		s.devices[existing.ID] = existing
		return existing, nil
	}
	s.devices[device.ID] = device
	s.deviceByFP[key] = device.ID
	return device, nil
}

func (s *MemoryStore) ListDevices(_ context.Context, userID string) ([]Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Device
	for _, device := range s.devices {
		if device.UserID == userID && device.RevokedAt == nil {
			out = append(out, device)
		}
	}
	return out, nil
}

func (s *MemoryStore) UpdateDeviceNote(_ context.Context, userID, deviceID, note string) (Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	device, ok := s.devices[deviceID]
	if !ok || device.UserID != userID || device.RevokedAt != nil {
		return Device{}, ErrNotFound
	}
	device.Note = note
	s.devices[deviceID] = device
	return device, nil
}

func (s *MemoryStore) RevokeDevice(_ context.Context, userID, deviceID string, when time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	device, ok := s.devices[deviceID]
	if !ok || device.UserID != userID {
		return ErrNotFound
	}
	device.RevokedAt = &when
	s.devices[deviceID] = device
	return nil
}

func (s *MemoryStore) HeartbeatDevice(_ context.Context, userID, deviceID string, when time.Time) (Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	device, ok := s.devices[deviceID]
	if !ok || device.UserID != userID || device.RevokedAt != nil {
		return Device{}, ErrNotFound
	}
	device.LastSeenAt = when
	s.devices[deviceID] = device
	return device, nil
}

func (s *MemoryStore) AddAuditLog(_ context.Context, log AuditLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.auditLogs = append(s.auditLogs, log)
	return nil
}
