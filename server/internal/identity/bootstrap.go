package identity

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/mail"
	"os"
	"strings"
	"time"
)

// LocalAdminSeed is an operator-provided, password-hash-only fixture. It is
// accepted only by the loopback, memory-backed preview. No HTTP route can seed
// accounts or choose an admin role.
type LocalAdminSeed struct {
	Username     string `json:"username"`
	Email        string `json:"email"`
	PasswordHash string `json:"passwordHash"`
}

func BootstrapLocalAdmin(ctx context.Context, store Store, path, addr, databaseURL string) error {
	if path == "" {
		return nil
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() || databaseURL != "" {
		return errors.New("local admin seed requires loopback and in-memory storage")
	}
	file, err := os.Open(path)
	if err != nil {
		return errors.New("cannot read local admin seed")
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 8192))
	decoder.DisallowUnknownFields()
	var seed LocalAdminSeed
	if err := decoder.Decode(&seed); err != nil {
		return errors.New("invalid local admin seed")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("invalid local admin seed")
	}
	seed.Username = strings.TrimSpace(seed.Username)
	seed.Email = strings.ToLower(strings.TrimSpace(seed.Email))
	if !usernamePattern.MatchString(seed.Username) {
		return ErrInvalidInput
	}
	parsed, err := mail.ParseAddress(seed.Email)
	if err != nil || parsed.Address != seed.Email {
		return ErrInvalidInput
	}
	// Accept only the bounded Argon2id profile produced by the local setup tool.
	parts := strings.Split(seed.PasswordHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" || parts[3] != "m=65536,t=3,p=2" {
		return errors.New("invalid seed password hash")
	}
	salt, saltErr := base64.RawStdEncoding.DecodeString(parts[4])
	digest, digestErr := base64.RawStdEncoding.DecodeString(parts[5])
	if saltErr != nil || digestErr != nil || len(salt) != 16 || len(digest) != 32 {
		return errors.New("invalid seed password hash")
	}
	existing, err := store.GetUserByLogin(ctx, seed.Username)
	if err == nil {
		if existing.Role == "admin" && existing.Email == seed.Email && existing.PasswordHash == seed.PasswordHash {
			return nil
		}
		return ErrConflict // Never silently elevate or reset an existing account.
	}
	if !errors.Is(err, ErrNotFound) {
		return err
	}
	now := time.Now()
	return store.CreateUser(ctx, User{ID: newID("usr"), Username: seed.Username, Email: seed.Email, Role: "admin", PasswordHash: seed.PasswordHash, CreatedAt: now, UpdatedAt: now})
}

func NewLocalAdminSeed(username, email, password string) (LocalAdminSeed, error) {
	if !usernamePattern.MatchString(username) || len(password) < 6 || len(password) > 1024 {
		return LocalAdminSeed{}, ErrInvalidInput
	}
	if parsed, err := mail.ParseAddress(email); err != nil || parsed.Address != email {
		return LocalAdminSeed{}, ErrInvalidInput
	}
	hash, err := hashPassword(password)
	return LocalAdminSeed{Username: username, Email: email, PasswordHash: hash}, err
}
