package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"remoteassist/server/internal/identity"
	"remoteassist/server/internal/session"
	"testing"
	"time"
)

func TestAdminStatusRequiresLiveAdminRole(t *testing.T) {
	cfg := testConfig()
	mem := identity.NewMemoryStore()
	svc, err := identity.NewService(mem, identity.ServiceConfig{AccessSecret: cfg.JWTSecret, RefreshSecret: cfg.RefreshTokenSecret})
	if err != nil {
		t.Fatal(err)
	}
	hash, err := identity.HashPassword("a test password")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	mem.CreateUser(ctx, identity.User{ID: "admin-test", Username: "siteadmin", Email: "admin@example.test", Role: "admin", PasswordHash: hash, CreatedAt: time.Now()})
	admin, err := svc.Login(ctx, "siteadmin", "a test password")
	if err != nil {
		t.Fatal(err)
	}
	user, err := svc.Register(ctx, "standard", "standard@example.test", "another test password")
	if err != nil {
		t.Fatal(err)
	}
	store := session.NewStore(session.StoreConfig{})
	defer store.Stop()
	app := NewServer(cfg, store, slog.Default(), svc).Routes()
	for _, tc := range []struct {
		token  string
		status int
	}{{"", 401}, {user.AccessToken, 403}, {admin.AccessToken, 200}} {
		req := httptest.NewRequest("GET", "/api/v1/admin/status", nil)
		req.Header.Set("Authorization", "Bearer "+tc.token)
		resp := httptest.NewRecorder()
		app.ServeHTTP(resp, req)
		if resp.Code != tc.status {
			t.Fatalf("status=%d want=%d", resp.Code, tc.status)
		}
	}
	response := httptest.NewRecorder()
	app.ServeHTTP(response, jsonReq(http.MethodPost, "/api/v1/auth/register", map[string]string{"username": "elevate", "email": "elevate@example.test", "password": "a valid password", "role": "admin"}))
	if response.Code != 400 {
		t.Fatal("client-controlled registration role accepted")
	}
}
