package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"remoteassist/server/internal/identity"
	"remoteassist/server/internal/session"
)

type directTestIdentityStore struct {
	identity.Store
	disabled atomic.Bool
}

func (s *directTestIdentityStore) GetUserByID(ctx context.Context, id string) (identity.User, error) {
	u, err := s.Store.GetUserByID(ctx, id)
	if err == nil && s.disabled.Load() && id == "direct-owner" {
		now := time.Now()
		u.DisabledAt = &now
	}
	return u, err
}

type directFixture struct {
	app        *Server
	handler    http.Handler
	identity   *directTestIdentityStore
	clock      atomic.Int64
	ownerToken string
	otherToken string
	host       identity.Device
	controller identity.Device
	foreign    identity.Device
}

func directSetup(t *testing.T) *directFixture {
	t.Helper()
	f := &directFixture{}
	now := time.Now()
	f.clock.Store(now.UnixMilli())
	clock := func() time.Time { return time.UnixMilli(f.clock.Load()) }
	cfg := testConfig()
	f.identity = &directTestIdentityStore{Store: identity.NewMemoryStore()}
	owner := identity.User{ID: "direct-owner", Username: "owner", Email: "owner@example.test", Role: "user"}
	other := identity.User{ID: "direct-other", Username: "other", Email: "other@example.test", Role: "admin"}
	for _, u := range []identity.User{owner, other} {
		if err := f.identity.CreateUser(context.Background(), u); err != nil {
			t.Fatal(err)
		}
	}
	var err error
	f.ownerToken, err = identity.NewAccessToken(owner, cfg.JWTSecret, time.Hour, now)
	if err != nil {
		t.Fatal(err)
	}
	f.otherToken, err = identity.NewAccessToken(other, cfg.JWTSecret, time.Hour, now)
	if err != nil {
		t.Fatal(err)
	}
	service, err := identity.NewService(f.identity, identity.ServiceConfig{AccessSecret: cfg.JWTSecret, RefreshSecret: cfg.RefreshTokenSecret, Now: clock, DeviceOfflineAfter: 2 * time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	f.host, err = service.RegisterDevice(context.Background(), f.ownerToken, "host", "host-fingerprint", "Windows", "test")
	if err != nil {
		t.Fatal(err)
	}
	f.controller, err = service.RegisterDevice(context.Background(), f.ownerToken, "controller", "controller-fingerprint", "Android", "test")
	if err != nil {
		t.Fatal(err)
	}
	f.foreign, err = service.RegisterDevice(context.Background(), f.otherToken, "foreign", "foreign-fingerprint", "Windows", "test")
	if err != nil {
		t.Fatal(err)
	}
	store := session.NewStore(session.StoreConfig{Now: clock, CleanupInterval: time.Hour})
	t.Cleanup(store.Stop)
	f.app = NewServer(cfg, store, slog.New(slog.NewTextHandler(io.Discard, nil)), service)
	f.handler = f.app.Routes()
	return f
}

func (f *directFixture) send(method, path, token string, body any) *httptest.ResponseRecorder {
	req := jsonReq(method, path, body)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	out := httptest.NewRecorder()
	f.handler.ServeHTTP(out, req)
	return out
}
func directObject(t *testing.T, response *httptest.ResponseRecorder, status int) map[string]any {
	t.Helper()
	if response.Code != status {
		t.Fatalf("status=%d want=%d body=%s", response.Code, status, response.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}
func (f *directFixture) create(t *testing.T) map[string]any {
	return directObject(t, f.send("POST", "/api/v1/devices/"+f.host.ID+"/connect", f.ownerToken, map[string]string{"controllerDeviceId": f.controller.ID}), http.StatusCreated)
}
func (f *directFixture) pending(t *testing.T) map[string]any {
	body := directObject(t, f.send("GET", "/api/v1/devices/"+f.host.ID+"/direct-sessions", f.ownerToken, nil), 200)
	items := body["sessions"].([]any)
	if len(items) != 1 {
		t.Fatalf("pending count=%d want1", len(items))
	}
	return items[0].(map[string]any)
}

func TestDirectDeviceFlowEnforcesOwnerAndSingleConsumption(t *testing.T) {
	f := directSetup(t)
	connect := "/api/v1/devices/" + f.host.ID + "/connect"
	for _, token := range []string{"", "forged"} {
		if r := f.send("POST", connect, token, map[string]string{"controllerDeviceId": f.controller.ID}); r.Code != 401 {
			t.Fatal("unauthenticated connect accepted")
		}
	}
	if r := f.send("POST", connect, f.otherToken, map[string]string{"controllerDeviceId": f.foreign.ID}); r.Code != 404 {
		t.Fatal("another account could target host")
	}
	if r := f.send("POST", connect, f.ownerToken, map[string]string{"controllerDeviceId": f.foreign.ID}); r.Code != 404 {
		t.Fatal("foreign controller accepted")
	}
	if r := f.send("POST", connect, f.ownerToken, map[string]string{"controllerDeviceId": f.host.ID}); r.Code != 400 {
		t.Fatal("self-control accepted")
	}
	created := f.create(t)
	id := created["id"].(string)
	if created["hostToken"] != nil || created["code"] != nil || created["controllerToken"] == "" {
		t.Fatal("wrong controller capabilities returned")
	}
	if r := f.send("POST", connect, f.ownerToken, map[string]string{"controllerDeviceId": f.controller.ID}); r.Code != 409 {
		t.Fatal("duplicate connect accepted")
	}
	pendingPath := "/api/v1/devices/" + f.host.ID + "/direct-sessions"
	if r := f.send("GET", pendingPath, f.otherToken, nil); r.Code != 404 {
		t.Fatal("other account polled capabilities")
	}
	pending := f.pending(t)
	if pending["id"] != id || pending["controllerToken"] != nil || pending["hostToken"] == "" {
		t.Fatal("wrong host capability response")
	}
	accept := pendingPath + "/" + id + "/accept"
	if r := f.send("POST", accept, f.otherToken, map[string]string{"hostToken": pending["hostToken"].(string)}); r.Code != 404 {
		t.Fatal("other account accepted known capability")
	}
	if r := f.send("POST", "/api/v1/devices/"+f.controller.ID+"/direct-sessions/"+id+"/accept", f.ownerToken, map[string]string{"hostToken": pending["hostToken"].(string)}); r.Code != 404 {
		t.Fatal("wrong host path accepted")
	}
	if r := f.send("POST", accept, f.ownerToken, map[string]string{"hostToken": "invalid"}); r.Code != 401 {
		t.Fatal("invalid capability accepted")
	}
	if r := f.send("POST", "/api/v1/share-sessions/"+id+"/approve", "", map[string]string{"token": pending["hostToken"].(string)}); r.Code != 409 {
		t.Fatal("legacy approval accepted direct session")
	}
	accepted := directObject(t, f.send("POST", accept, f.ownerToken, map[string]string{"hostToken": pending["hostToken"].(string)}), 200)
	if accepted["state"] != "AUTHORIZED_ACTIVE" || accepted["controllerToken"] != created["controllerToken"] {
		t.Fatal("activation result mismatch")
	}
	if r := f.send("POST", accept, f.ownerToken, map[string]string{"hostToken": pending["hostToken"].(string)}); r.Code != 409 {
		t.Fatal("accepted twice")
	}
	directObject(t, f.send("DELETE", "/api/v1/devices/"+f.controller.ID, f.ownerToken, nil), 200)
	if _, _, err := f.app.store.ValidateToken(id, created["controllerToken"].(string)); err == nil {
		t.Fatal("device revocation retained session capability")
	}
}

func TestDirectRejectsOfflineExpiredRevokedAndDisabled(t *testing.T) {
	t.Run("offline", func(t *testing.T) {
		f := directSetup(t)
		f.clock.Add(int64((3 * time.Minute) / time.Millisecond))
		r := f.send("POST", "/api/v1/devices/"+f.host.ID+"/connect", f.ownerToken, map[string]string{"controllerDeviceId": f.controller.ID})
		if r.Code != 409 {
			t.Fatal("offline host accepted")
		}
	})
	t.Run("expiry", func(t *testing.T) {
		f := directSetup(t)
		created := f.create(t)
		pending := f.pending(t)
		f.clock.Add(int64(time.Minute / time.Millisecond))
		r := f.send("POST", "/api/v1/devices/"+f.host.ID+"/direct-sessions/"+created["id"].(string)+"/accept", f.ownerToken, map[string]string{"hostToken": pending["hostToken"].(string)})
		if r.Code != 410 {
			t.Fatalf("expired accept=%d", r.Code)
		}
	})
	t.Run("revoked-controller-before-accept", func(t *testing.T) {
		f := directSetup(t)
		created := f.create(t)
		pending := f.pending(t)
		if err := f.identity.RevokeDevice(context.Background(), "direct-owner", f.controller.ID, time.Now()); err != nil {
			t.Fatal(err)
		}
		r := f.send("POST", "/api/v1/devices/"+f.host.ID+"/direct-sessions/"+created["id"].(string)+"/accept", f.ownerToken, map[string]string{"hostToken": pending["hostToken"].(string)})
		if r.Code != 404 {
			t.Fatalf("revoked accept=%d", r.Code)
		}
		if _, _, err := f.app.store.ValidateToken(created["id"].(string), created["controllerToken"].(string)); err == nil {
			t.Fatal("revoked session stayed live")
		}
	})
	t.Run("disabled", func(t *testing.T) {
		f := directSetup(t)
		f.identity.disabled.Store(true)
		r := f.send("POST", "/api/v1/devices/"+f.host.ID+"/connect", f.ownerToken, map[string]string{"controllerDeviceId": f.controller.ID})
		if r.Code != 401 {
			t.Fatal("disabled user connected")
		}
	})
}

func TestDirectWebSocketClosesWhenAccountDisabled(t *testing.T) {
	f := directSetup(t)
	server := httptest.NewServer(f.handler)
	defer server.Close()
	created := f.create(t)
	pending := f.pending(t)
	id := created["id"].(string)
	controller := dialSessionPeer(t, server.URL, id, created["controllerToken"].(string), "controller")
	host := dialSessionPeer(t, server.URL, id, pending["hostToken"].(string), "host")
	directObject(t, f.send("POST", "/api/v1/devices/"+f.host.ID+"/direct-sessions/"+id+"/accept", f.ownerToken, map[string]string{"hostToken": pending["hostToken"].(string)}), 200)
	f.identity.disabled.Store(true)
	assertSocketClosed(t, host)
	assertSocketClosed(t, controller)
	if _, _, err := f.app.store.ValidateToken(id, created["controllerToken"].(string)); err == nil {
		t.Fatal("disabled user's socket capability survived")
	}
}

func TestPendingDoesNotLeakControllerCapability(t *testing.T) {
	f := directSetup(t)
	created := f.create(t)
	r := f.send("GET", "/api/v1/devices/"+f.host.ID+"/direct-sessions", f.ownerToken, nil)
	if strings.Contains(r.Body.String(), created["controllerToken"].(string)) {
		t.Fatal("controller token leaked through host poll")
	}
}
