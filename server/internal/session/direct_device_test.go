package session

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestDeviceSessionHasNoJoinCodeAndSingleHostActivation(t *testing.T) {
	now := time.Now()
	store := NewStore(StoreConfig{Now: func() time.Time { return now }, CleanupInterval: time.Hour})
	defer store.Stop()
	current, err := store.CreateDeviceSession("owner", "host", "controller")
	if err != nil {
		t.Fatal(err)
	}
	if current.Code != "" || current.State != StateWaitingForHostApproval {
		t.Fatal("direct session exposed a code or skipped host readiness")
	}
	if _, _, err := store.Join(""); !errors.Is(err, ErrNotFound) {
		t.Fatal("direct session entered the code index")
	}
	if _, err := store.CreateDeviceSession("owner", "host", "other-controller"); !errors.Is(err, ErrInvalidState) {
		t.Fatal("busy host accepted another session")
	}
	if _, err := store.Approve(current.ID, current.HostToken); !errors.Is(err, ErrInvalidState) {
		t.Fatal("legacy capability approval bypassed owner/device recheck")
	}
	if len(store.PendingDeviceSessions("different-owner", "host")) != 0 || len(store.PendingDeviceSessions("owner", "different-host")) != 0 {
		t.Fatal("pending capabilities leaked")
	}
	if _, err := store.AcceptDeviceSession(current.ID, "different-owner", "host", current.HostToken); !errors.Is(err, ErrNotFound) {
		t.Fatal("wrong owner accepted")
	}
	if _, err := store.AcceptDeviceSession(current.ID, "owner", "host", "bad-token"); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("bad host capability accepted")
	}
	if _, err := store.AcceptDeviceSession(current.ID, "owner", "host", current.HostToken); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AcceptDeviceSession(current.ID, "owner", "host", current.HostToken); !errors.Is(err, ErrInvalidState) {
		t.Fatal("duplicate activation accepted")
	}
	if len(store.PendingDeviceSessions("owner", "host")) != 0 {
		t.Fatal("activated session still pending")
	}
	if ids := store.InvalidateDeviceSessions("controller"); len(ids) != 1 {
		t.Fatal("revocation did not invalidate session")
	}
	if _, _, err := store.ValidateToken(current.ID, current.ControllerToken); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("revoked capability remained valid")
	}
}

func TestExpiredDirectSessionCannotActivate(t *testing.T) {
	now := time.Now()
	store := NewStore(StoreConfig{Now: func() time.Time { return now }, CleanupInterval: time.Hour, CodeTTL: 5 * time.Minute})
	defer store.Stop()
	current, err := store.CreateDeviceSession("owner", "host", "controller")
	if err != nil {
		t.Fatal(err)
	}
	if current.ExpiresAt.Sub(now) != time.Minute {
		t.Fatal("direct wait exceeded one-minute bound")
	}
	now = now.Add(time.Minute)
	if _, err := store.AcceptDeviceSession(current.ID, "owner", "host", current.HostToken); !errors.Is(err, ErrExpired) {
		t.Fatal("expired direct session activated")
	}
	if _, _, err := store.ValidateToken(current.ID, current.HostToken); !errors.Is(err, ErrExpired) {
		t.Fatal("expired capability accepted")
	}
}

func TestConcurrentDirectConnectCreatesOnlyOneHostSession(t *testing.T) {
	store := NewStore(StoreConfig{CleanupInterval: time.Hour})
	defer store.Stop()
	results := make(chan error, 20)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := store.CreateDeviceSession("owner", "host", "controller")
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if !errors.Is(err, ErrInvalidState) {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("created %d sessions for one host", success)
	}
}
