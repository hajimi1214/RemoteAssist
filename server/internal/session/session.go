package session

import (
	"crypto/rand"
	"encoding/base32"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"
)

type State string

const (
	StateCreated                State = "CREATED"
	StateWaitingForController   State = "WAITING_FOR_CONTROLLER"
	StateWaitingForHostApproval State = "WAITING_FOR_HOST_APPROVAL"
	StateAuthorizedActive       State = "AUTHORIZED_ACTIVE"
	StateDisconnected           State = "DISCONNECTED"
	StateExpired                State = "EXPIRED"
	StateRejected               State = "REJECTED"
)

var (
	ErrNotFound     = errors.New("session not found")
	ErrExpired      = errors.New("session expired")
	ErrInvalidToken = errors.New("invalid token")
	ErrInvalidState = errors.New("invalid session state")
)

type StoreConfig struct {
	CodeTTL         time.Duration
	CleanupInterval time.Duration
	Now             func() time.Time
}

type Store struct {
	mu       sync.RWMutex
	byID     map[string]*Session
	byCode   map[string]string
	codeTTL  time.Duration
	now      func() time.Time
	stop     chan struct{}
	stopOnce sync.Once
}

type Session struct {
	ID              string    `json:"id"`
	Code            string    `json:"code"`
	State           State     `json:"state"`
	HostToken       string    `json:"-"`
	ControllerToken string    `json:"-"`
	CreatedAt       time.Time `json:"createdAt"`
	ExpiresAt       time.Time `json:"expiresAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func NewStore(cfg StoreConfig) *Store {
	if cfg.CodeTTL <= 0 {
		cfg.CodeTTL = 5 * time.Minute
	}
	if cfg.CleanupInterval <= 0 {
		cfg.CleanupInterval = 30 * time.Second
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	s := &Store{
		byID:    map[string]*Session{},
		byCode:  map[string]string{},
		codeTTL: cfg.CodeTTL,
		now:     cfg.Now,
		stop:    make(chan struct{}),
	}
	go s.cleanupLoop(cfg.CleanupInterval)
	return s
}

func (s *Store) Stop() {
	s.stopOnce.Do(func() { close(s.stop) })
}

func (s *Store) CreateShareSession() (*Session, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.now()
	id, err := randomToken(18)
	if err != nil {
		return nil, "", err
	}
	hostToken, err := randomToken(32)
	if err != nil {
		return nil, "", err
	}
	code, err := s.uniqueCodeLocked()
	if err != nil {
		return nil, "", err
	}
	session := &Session{
		ID:        id,
		Code:      code,
		State:     StateWaitingForController,
		HostToken: hostToken,
		CreatedAt: now,
		ExpiresAt: now.Add(s.codeTTL),
		UpdatedAt: now,
	}
	s.byID[id] = session
	s.byCode[code] = id
	return clone(session), hostToken, nil
}

func (s *Store) Join(code string) (*Session, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	code = strings.ToUpper(strings.TrimSpace(code))
	id, ok := s.byCode[code]
	if !ok {
		return nil, "", ErrNotFound
	}
	current := s.byID[id]
	if s.expireIfNeededLocked(current) {
		return clone(current), "", ErrExpired
	}
	if current.State != StateWaitingForController {
		return nil, "", ErrInvalidState
	}
	token, err := randomToken(32)
	if err != nil {
		return nil, "", err
	}
	current.ControllerToken = token
	current.State = StateWaitingForHostApproval
	current.UpdatedAt = s.now()
	return clone(current), token, nil
}

func (s *Store) Approve(id, hostToken string) (*Session, error) {
	return s.transitionWithHostToken(id, hostToken, StateWaitingForHostApproval, StateAuthorizedActive)
}

func (s *Store) Reject(id, hostToken string) (*Session, error) {
	return s.transitionWithHostToken(id, hostToken, StateWaitingForHostApproval, StateRejected)
}

func (s *Store) Disconnect(id, token string) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.getActiveLocked(id)
	if err != nil {
		return nil, err
	}
	if !constantTokenMatch(token, current.HostToken) && !constantTokenMatch(token, current.ControllerToken) {
		return nil, ErrInvalidToken
	}
	current.State = StateDisconnected
	current.UpdatedAt = s.now()
	delete(s.byCode, current.Code)
	return clone(current), nil
}

func (s *Store) ValidateToken(id, token string) (*Session, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.getActiveLocked(id)
	if err != nil {
		return nil, "", err
	}
	switch {
	case constantTokenMatch(token, current.HostToken):
		return clone(current), "host", nil
	case constantTokenMatch(token, current.ControllerToken):
		return clone(current), "controller", nil
	default:
		return nil, "", ErrInvalidToken
	}
}

func (s *Store) Get(id string) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current, ok := s.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	if s.expireIfNeededLocked(current) {
		return clone(current), ErrExpired
	}
	return clone(current), nil
}

func (s *Store) transitionWithHostToken(id, hostToken string, from, to State) (*Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.getActiveLocked(id)
	if err != nil {
		return nil, err
	}
	if !constantTokenMatch(hostToken, current.HostToken) {
		return nil, ErrInvalidToken
	}
	if current.State != from {
		return nil, ErrInvalidState
	}
	current.State = to
	current.UpdatedAt = s.now()
	if to == StateRejected {
		delete(s.byCode, current.Code)
	}
	return clone(current), nil
}

func (s *Store) getActiveLocked(id string) (*Session, error) {
	current, ok := s.byID[id]
	if !ok {
		return nil, ErrNotFound
	}
	if s.expireIfNeededLocked(current) {
		return current, ErrExpired
	}
	return current, nil
}

func (s *Store) expireIfNeededLocked(current *Session) bool {
	if current.State == StateWaitingForController || current.State == StateWaitingForHostApproval || current.State == StateCreated {
		if !s.now().Before(current.ExpiresAt) {
			current.State = StateExpired
			current.UpdatedAt = s.now()
			delete(s.byCode, current.Code)
			return true
		}
	}
	return current.State == StateExpired
}

func (s *Store) cleanupLoop(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.cleanup()
		case <-s.stop:
			return
		}
	}
}

func (s *Store) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, current := range s.byID {
		s.expireIfNeededLocked(current)
	}
}

func (s *Store) uniqueCodeLocked() (string, error) {
	for i := 0; i < 10; i++ {
		code, err := randomDigits(8)
		if err != nil {
			return "", err
		}
		if _, exists := s.byCode[code]; !exists {
			return code, nil
		}
	}
	return "", fmt.Errorf("unable to allocate unique code")
}

func clone(in *Session) *Session {
	if in == nil {
		return nil
	}
	out := *in
	return &out
}

func randomDigits(length int) (string, error) {
	var builder strings.Builder
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		builder.WriteByte(byte('0' + n.Int64()))
	}
	return builder.String(), nil
}

func randomToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return strings.TrimRight(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), "="), nil
}

func constantTokenMatch(a, b string) bool {
	if a == "" || b == "" || len(a) != len(b) {
		return false
	}
	var diff byte
	for i := range a {
		diff |= a[i] ^ b[i]
	}
	return diff == 0
}
