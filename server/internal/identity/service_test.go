package identity

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestRegisterLoginRefreshAndDeviceFlow(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	service, err := NewService(NewMemoryStore(), ServiceConfig{
		AccessSecret:       "01234567890123456789012345678901",
		RefreshSecret:      "abcdefghijklmnopqrstuvwxyz123456",
		AccessTTL:          time.Minute,
		RefreshTTL:         time.Hour,
		DeviceOfflineAfter: 2 * time.Minute,
		Now:                func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}

	registered, err := service.Register(context.Background(), "alice", "alice@example.com", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if registered.AccessToken == "" || registered.RefreshToken == "" {
		t.Fatal("expected tokens")
	}

	if _, err := service.Login(context.Background(), "alice@example.com", "wrong password"); err != ErrInvalidCredentials {
		t.Fatalf("expected invalid credentials, got %v", err)
	}

	loggedIn, err := service.Login(context.Background(), "alice", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	refreshed, err := service.Refresh(context.Background(), loggedIn.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if refreshed.RefreshToken == loggedIn.RefreshToken {
		t.Fatal("expected rotated refresh token")
	}
	if _, err := service.Refresh(context.Background(), loggedIn.RefreshToken); err != ErrUnauthorized {
		t.Fatalf("expected revoked refresh token, got %v", err)
	}

	device, err := service.RegisterDevice(context.Background(), refreshed.AccessToken, "Alice PC", "fingerprint-1", "Windows 11", "0.2.0")
	if err != nil {
		t.Fatal(err)
	}
	if !device.Online || !device.Current {
		t.Fatalf("expected current online device: %#v", device)
	}
	devices, err := service.ListDevices(context.Background(), refreshed.AccessToken, device.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 1 || !devices[0].Current {
		t.Fatalf("expected listed current device: %#v", devices)
	}
	updated, err := service.UpdateDevice(context.Background(), refreshed.AccessToken, device.ID, "desk")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Note != "desk" {
		t.Fatalf("expected note update, got %q", updated.Note)
	}
	if _, err := service.Heartbeat(context.Background(), refreshed.AccessToken, device.ID); err != nil {
		t.Fatal(err)
	}
	if err := service.RevokeDevice(context.Background(), refreshed.AccessToken, device.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Heartbeat(context.Background(), refreshed.AccessToken, device.ID); err != ErrNotFound {
		t.Fatalf("expected revoked device heartbeat rejection, got %v", err)
	}
}

func TestRegisterNormalizesUsernameCaseAndRejectsCaseFoldedDuplicate(t *testing.T) {
	service, err := NewService(NewMemoryStore(), ServiceConfig{
		AccessSecret:  "01234567890123456789012345678901",
		RefreshSecret: "abcdefghijklmnopqrstuvwxyz123456",
	})
	if err != nil {
		t.Fatal(err)
	}
	created, err := service.Register(context.Background(), "Alice", "Alice@example.com", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if created.User.Username != "alice" || created.User.Email != "alice@example.com" {
		t.Fatalf("identity not normalized: username=%q email=%q", created.User.Username, created.User.Email)
	}
	if _, err := service.Register(context.Background(), "ALICE", "other@example.com", "correct horse battery"); err != ErrConflict {
		t.Fatalf("case-folded duplicate username error=%v, want conflict", err)
	}
}

func TestRefreshTokenCanBeConsumedOnlyOnceConcurrently(t *testing.T) {
	service, err := NewService(NewMemoryStore(), ServiceConfig{
		AccessSecret:       "01234567890123456789012345678901",
		RefreshSecret:      "abcdefghijklmnopqrstuvwxyz123456",
		AccessTTL:          time.Minute,
		RefreshTTL:         time.Hour,
		DeviceOfflineAfter: time.Minute,
	})
	if err != nil {
		t.Fatal(err)
	}
	registered, err := service.Register(context.Background(), "concurrent", "concurrent@example.com", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := service.Refresh(context.Background(), registered.RefreshToken)
			results <- err
		}()
	}
	wg.Wait()
	close(results)

	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("expected exactly one refresh success, got %d", successes)
	}
}

func TestPasswordUsesArgon2ID(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(hash, "correct horse battery") {
		t.Fatal("expected password verification")
	}
	if VerifyPassword(hash, "wrong password") {
		t.Fatal("wrong password verified")
	}
}
