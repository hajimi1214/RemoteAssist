package session

import (
	"testing"
	"time"
)

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
