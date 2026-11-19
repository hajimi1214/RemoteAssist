package session

import (
	"testing"
	"time"
)

func TestCapacityReclaimsEndedSessions(t *testing.T) {
	store := NewStore(StoreConfig{MaxSessions: 1})
	defer store.Stop()
	created, token, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err = store.CreateShareSession(); err != ErrCapacity {
		t.Fatalf("capacity was not enforced: %v", err)
	}
	if _, err = store.Disconnect(created.ID, token); err != nil {
		t.Fatal(err)
	}
	if _, _, err = store.CreateShareSession(); err != nil {
		t.Fatalf("terminal session still consumed capacity: %v", err)
	}
}

func TestCreateJoinApproveDisconnect(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	store := NewStore(StoreConfig{CodeTTL: 5 * time.Minute, Now: func() time.Time { return now }})
	defer store.Stop()

	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Code) != 8 || created.State != StateWaitingForController || hostToken == "" {
		t.Fatalf("unexpected created session: id=%s state=%s codeLength=%d tokenPresent=%t", created.ID, created.State, len(created.Code), hostToken != "")
	}

	joined, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	if joined.State != StateWaitingForHostApproval || controllerToken == "" {
		t.Fatalf("unexpected joined session: %#v", joined)
	}

	approved, err := store.Approve(created.ID, hostToken)
	if err != nil {
		t.Fatal(err)
	}
	if approved.State != StateAuthorizedActive {
		t.Fatalf("expected authorized active, got %s", approved.State)
	}

	disconnected, err := store.Disconnect(created.ID, controllerToken)
	if err != nil {
		t.Fatal(err)
	}
	if disconnected.State != StateDisconnected {
		t.Fatalf("expected disconnected, got %s", disconnected.State)
	}
	if disconnected.HostToken != "" || disconnected.ControllerToken != "" {
		t.Fatal("disconnected session retained authentication tokens")
	}
}

func TestExpiredSessionRejectsJoin(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	store := NewStore(StoreConfig{CodeTTL: time.Minute, Now: func() time.Time { return now }})
	defer store.Stop()

	created, _, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}

	now = now.Add(2 * time.Minute)
	_, _, err = store.Join(created.Code)
	if err != ErrExpired {
		t.Fatalf("expected ErrExpired, got %v", err)
	}

	got, err := store.Get(created.ID)
	if err != ErrExpired || got.State != StateExpired {
		t.Fatalf("expected expired state and ErrExpired, got state=%v err=%v", got.State, err)
	}
}

func TestWrongTokenCannotApprove(t *testing.T) {
	store := NewStore(StoreConfig{CodeTTL: 5 * time.Minute})
	defer store.Stop()

	created, _, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Join(created.Code); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(created.ID, "wrong-token"); err != ErrInvalidToken {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func TestAuthorizedSessionExpiresAtActiveTTLAndIsReclaimed(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	store := NewStore(StoreConfig{
		CodeTTL:   time.Minute,
		ActiveTTL: 10 * time.Minute,
		Now:       func() time.Time { return now },
	})
	defer store.Stop()

	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	approved, err := store.Approve(created.ID, hostToken)
	if err != nil {
		t.Fatal(err)
	}
	if want := created.CreatedAt.Add(10 * time.Minute); !approved.ExpiresAt.Equal(want) {
		t.Fatalf("active expiry=%s, want %s", approved.ExpiresAt, want)
	}

	now = created.CreatedAt.Add(9 * time.Minute)
	if _, _, err := store.ValidateToken(created.ID, controllerToken); err != nil {
		t.Fatalf("active session expired too early: %v", err)
	}

	now = created.CreatedAt.Add(10 * time.Minute)
	expired, err := store.Get(created.ID)
	if err != ErrExpired || expired.State != StateExpired {
		t.Fatalf("expected expired active session, state=%s err=%v", expired.State, err)
	}
	if expired.HostToken != "" || expired.ControllerToken != "" {
		t.Fatal("expired session retained authentication tokens")
	}

	store.cleanup()
	if _, err := store.Get(created.ID); err != ErrNotFound {
		t.Fatalf("expected terminal session to be reclaimed, got %v", err)
	}
	if _, _, err := store.Join(created.Code); err != ErrNotFound {
		t.Fatalf("expected expired code to be unavailable, got %v", err)
	}
}

func TestTerminalSessionClearsTokensBeforeCleanup(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	store := NewStore(StoreConfig{Now: func() time.Time { return now }})
	defer store.Stop()

	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Join(created.Code); err != nil {
		t.Fatal(err)
	}
	rejected, err := store.Reject(created.ID, hostToken)
	if err != nil {
		t.Fatal(err)
	}
	if rejected.State != StateRejected || rejected.HostToken != "" || rejected.ControllerToken != "" {
		t.Fatalf("terminal session still carries credentials: %#v", rejected)
	}

	store.cleanup()
	if _, err := store.Get(created.ID); err != ErrNotFound {
		t.Fatalf("expected rejected session to be reclaimed, got %v", err)
	}
}

func TestCleanupExpiresAndReclaimsAuthorizedSession(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	store := NewStore(StoreConfig{ActiveTTL: time.Minute, Now: func() time.Time { return now }})
	defer store.Stop()
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Join(created.Code); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(created.ID, hostToken); err != nil {
		t.Fatal(err)
	}
	retained := store.byID[created.ID]
	now = now.Add(time.Minute)
	store.cleanup()
	if _, exists := store.byID[created.ID]; exists {
		t.Fatal("cleanup retained a session that expired in the same pass")
	}
	if retained.State != StateExpired || retained.HostToken != "" || retained.ControllerToken != "" {
		t.Fatal("cleanup failed to transition and clear the expired session before removal")
	}
}

func TestApproveCannotStartPastActiveDeadline(t *testing.T) {
	now := time.Date(2026, 6, 7, 0, 0, 0, 0, time.UTC)
	store := NewStore(StoreConfig{CodeTTL: 5 * time.Minute, ActiveTTL: time.Minute, Now: func() time.Time { return now }})
	defer store.Stop()
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Join(created.Code); err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Minute)
	if _, err := store.Approve(created.ID, hostToken); err != ErrExpired {
		t.Fatalf("expected approval past the maximum session age to fail, got %v", err)
	}
}

func TestCleanupDoesNotDeleteReusedCode(t *testing.T) {
	store := NewStore(StoreConfig{})
	defer store.Stop()
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Disconnect(created.ID, hostToken); err != nil {
		t.Fatal(err)
	}
	// A newer session can reuse a code after a terminal transition releases it.
	store.byCode[created.Code] = "new-session"
	store.cleanup()
	if got := store.byCode[created.Code]; got != "new-session" {
		t.Fatalf("cleanup deleted a different session's reused code: %q", got)
	}
}
