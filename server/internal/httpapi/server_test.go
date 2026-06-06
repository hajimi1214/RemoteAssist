package httpapi

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"remoteassist/server/internal/config"
	"remoteassist/server/internal/session"
)

func TestSessionHTTPFlow(t *testing.T) {
	app := testServer()

	createResp := httptest.NewRecorder()
	app.ServeHTTP(createResp, httptest.NewRequest(http.MethodPost, "/api/v1/share-sessions", bytes.NewBufferString("{}")))
	if createResp.Code != http.StatusCreated {
		t.Fatalf("create status = %d body=%s", createResp.Code, createResp.Body.String())
	}
	var created struct {
		ID        string        `json:"id"`
		Code      string        `json:"code"`
		HostToken string        `json:"hostToken"`
		State     session.State `json:"state"`
	}
	if err := json.Unmarshal(createResp.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Code == "" || created.HostToken == "" {
		t.Fatalf("missing code/token: %#v", created)
	}

	joinResp := httptest.NewRecorder()
	app.ServeHTTP(joinResp, jsonReq(http.MethodPost, "/api/v1/control-sessions/join", map[string]string{"code": created.Code}))
	if joinResp.Code != http.StatusOK {
		t.Fatalf("join status = %d body=%s", joinResp.Code, joinResp.Body.String())
	}

	approveResp := httptest.NewRecorder()
	app.ServeHTTP(approveResp, jsonReq(http.MethodPost, "/api/v1/share-sessions/"+created.ID+"/approve", map[string]string{"token": created.HostToken}))
	if approveResp.Code != http.StatusOK {
		t.Fatalf("approve status = %d body=%s", approveResp.Code, approveResp.Body.String())
	}
}

func TestApproveRequiresHostToken(t *testing.T) {
	app := testServer()

	createResp := httptest.NewRecorder()
	app.ServeHTTP(createResp, httptest.NewRequest(http.MethodPost, "/api/v1/share-sessions", bytes.NewBufferString("{}")))
	var created struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	_ = json.Unmarshal(createResp.Body.Bytes(), &created)

	joinResp := httptest.NewRecorder()
	app.ServeHTTP(joinResp, jsonReq(http.MethodPost, "/api/v1/control-sessions/join", map[string]string{"code": created.Code}))

	approveResp := httptest.NewRecorder()
	app.ServeHTTP(approveResp, jsonReq(http.MethodPost, "/api/v1/share-sessions/"+created.ID+"/approve", map[string]string{"token": "wrong"}))
	if approveResp.Code != http.StatusUnauthorized {
		t.Fatalf("approve with wrong token status = %d body=%s", approveResp.Code, approveResp.Body.String())
	}
}

func TestICEConfigDoesNotRequireHardcodedTURN(t *testing.T) {
	app := testServer()
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, "/api/v1/ice-config", nil))
	if resp.Code != http.StatusOK {
		t.Fatalf("ice config status = %d", resp.Code)
	}
	if bytes.Contains(resp.Body.Bytes(), []byte("secret")) {
		t.Fatalf("ice config leaked secret-like value: %s", resp.Body.String())
	}
}

func testServer() http.Handler {
	store := session.NewStore(session.StoreConfig{CodeTTL: 5 * time.Minute})
	cfg := config.Config{
		Addr:               ":0",
		CodeTTL:            5 * time.Minute,
		MaxMessageBytes:    65536,
		RateLimitPerMinute: 1000,
		LoginFailLimit:     1000,
		JWTSecret:          "01234567890123456789012345678901",
		RefreshTokenSecret: "abcdefghijklmnopqrstuvwxyz123456",
		AccessTokenTTL:     15 * time.Minute,
		RefreshTokenTTL:    24 * time.Hour,
		DeviceOfflineAfter: 2 * time.Minute,
		ICEServers:         []config.ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
	}
	return NewServer(cfg, store, slog.Default()).Routes()
}

func jsonReq(method, path string, body any) *http.Request {
	buf, _ := json.Marshal(body)
	return httptest.NewRequest(method, path, bytes.NewReader(buf))
}
