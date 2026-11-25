package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"remoteassist/server/internal/identity"
	"remoteassist/server/internal/session"
)

func TestSessionCreationAndJoinRequireLiveAccountAndAllowHostConsentedCrossAccountJoin(t *testing.T) {
	cfg := testConfig()
	accounts := identity.NewMemoryStore()
	now := time.Now()
	active := identity.User{ID: "active-user", Username: "active", Email: "active@example.test", Role: "user"}
	helper := identity.User{ID: "helper-user", Username: "helper", Email: "helper@example.test", Role: "user"}
	disabled := identity.User{ID: "disabled-user", Username: "disabled", Email: "disabled@example.test", Role: "user", DisabledAt: &now}
	for _, user := range []identity.User{active, helper, disabled} {
		if err := accounts.CreateUser(context.Background(), user); err != nil {
			t.Fatal(err)
		}
	}
	auth, err := identity.NewService(accounts, identity.ServiceConfig{AccessSecret: cfg.JWTSecret, RefreshSecret: cfg.RefreshTokenSecret})
	if err != nil {
		t.Fatal(err)
	}
	token := func(user identity.User, ttl time.Duration) string {
		value, err := identity.NewAccessToken(user, cfg.JWTSecret, ttl, now)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	validToken := token(active, time.Minute)
	helperToken := token(helper, time.Minute)
	denied := []struct{ name, token string }{
		{"guest", ""}, {"forged", "invalid-access-token"},
		{"expired", token(active, -time.Minute)}, {"disabled", token(disabled, time.Minute)},
	}
	store := session.NewStore(session.StoreConfig{MaxSessions: 1})
	defer store.Stop()
	app := NewServer(cfg, store, slog.Default(), auth).Routes()
	send := func(path, accessToken string, body any) *httptest.ResponseRecorder {
		request := jsonReq(http.MethodPost, path, body)
		if accessToken != "" {
			request.Header.Set("Authorization", "Bearer "+accessToken)
		}
		response := httptest.NewRecorder()
		app.ServeHTTP(response, request)
		return response
	}
	for _, entry := range denied {
		t.Run("create/"+entry.name, func(t *testing.T) {
			if response := send("/api/v1/share-sessions", entry.token, map[string]string{}); response.Code != http.StatusUnauthorized {
				t.Fatalf("create status=%d, want 401", response.Code)
			}
		})
	}
	// Capacity one proves denied creation did not mutate the session store.
	created := send("/api/v1/share-sessions", validToken, map[string]string{})
	if created.Code != http.StatusCreated {
		t.Fatalf("authenticated create status=%d, want 201", created.Code)
	}
	var share struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &share); err != nil {
		t.Fatal(err)
	}
	for _, entry := range denied {
		t.Run("join/"+entry.name, func(t *testing.T) {
			if response := send("/api/v1/control-sessions/join", entry.token, map[string]string{"code": share.Code}); response.Code != http.StatusUnauthorized {
				t.Fatalf("join status=%d, want 401", response.Code)
			}
		})
	}
	current, err := store.Get(share.ID)
	if err != nil || current.State != session.StateWaitingForController {
		t.Fatal("denied join changed the waiting session")
	}
	joined := send("/api/v1/control-sessions/join", helperToken, map[string]string{"code": share.Code})
	if joined.Code != http.StatusOK {
		t.Fatalf("authenticated join status=%d, want 200", joined.Code)
	}
	current, err = store.Get(share.ID)
	if err != nil || current.State != session.StateWaitingForHostApproval {
		t.Fatal("authenticated join must still wait for host consent")
	}
	if current.OwnerUserID != "" || current.ControllerDeviceID != "" {
		t.Fatal("one-time code session must be separate from same-account device ownership")
	}
}
