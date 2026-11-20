package identity

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalAdminSeedIsRestrictedAndDoesNotWeakenRegistration(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	service, err := NewService(store, ServiceConfig{AccessSecret: "01234567890123456789012345678901", RefreshSecret: "abcdefghijklmnopqrstuvwxyz123456"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Register(ctx, "shortuser", "short@example.test", "short!"); err != ErrInvalidInput {
		t.Fatal("short public password accepted")
	}
	seed, err := NewLocalAdminSeed("localadmin", "local@example.test", "short!")
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "seed.json")
	bytes, _ := json.Marshal(seed)
	if err := os.WriteFile(file, bytes, 0600); err != nil {
		t.Fatal(err)
	}
	for _, addr := range []string{":8080", "0.0.0.0:8080", "192.0.2.10:8080", "localhost:8080"} {
		if err := BootstrapLocalAdmin(ctx, store, file, addr, ""); err == nil {
			t.Fatalf("seed accepted non-loopback binding %s", addr)
		}
	}
	if err := BootstrapLocalAdmin(ctx, store, file, "127.0.0.1:8080", "postgres://test"); err == nil {
		t.Fatal("seed accepted database deployment")
	}
	if err := BootstrapLocalAdmin(ctx, store, file, "127.0.0.1:8080", ""); err != nil {
		t.Fatal(err)
	}
	if err := BootstrapLocalAdmin(ctx, store, file, "127.0.0.1:8080", ""); err != nil {
		t.Fatal("idempotent seed failed", err)
	}
	admin, err := service.Login(ctx, "localadmin", "short!")
	if err != nil {
		t.Fatal(err)
	}
	if admin.User.Role != "admin" {
		t.Fatal("bootstrap role missing")
	}
	if _, err := service.RequireAdmin(ctx, admin.AccessToken); err != nil {
		t.Fatal(err)
	}
	user, err := service.Register(ctx, "standard", "standard@example.test", "valid password for test")
	if err != nil {
		t.Fatal(err)
	}
	if user.User.Role != "user" {
		t.Fatal("public registration not least privilege")
	}
	if _, err := service.RequireAdmin(ctx, user.AccessToken); err != ErrForbidden {
		t.Fatal("non-admin bypassed role gate")
	}
	store.mu.Lock()
	current := store.users[admin.User.ID]
	current.DisabledAt = &current.CreatedAt
	store.users[admin.User.ID] = current
	store.mu.Unlock()
	if _, err := service.RequireAdmin(ctx, admin.AccessToken); err != ErrUnauthorized {
		t.Fatal("disabled administrator still authorized")
	}
}

func TestBootstrapRefusesElevatingExistingUser(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	seed, err := NewLocalAdminSeed("existing", "existing@example.test", "valid password")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.CreateUser(ctx, User{ID: "existing-user", Username: seed.Username, Email: seed.Email, Role: "user", PasswordHash: seed.PasswordHash}); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "seed.json")
	data, _ := json.Marshal(seed)
	os.WriteFile(file, data, 0600)
	if err := BootstrapLocalAdmin(ctx, store, file, "127.0.0.1:8080", ""); err != ErrConflict {
		t.Fatal("existing user silently promoted", err)
	}
}
