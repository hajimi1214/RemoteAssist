package httpapi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"remoteassist/server/internal/config"
	"remoteassist/server/internal/session"
)

func TestSessionHTTPFlow(t *testing.T) {
	app := testServer()
	auth := registerTestUser(t, app)

	createResp := httptest.NewRecorder()
	createReq := jsonReq(http.MethodPost, "/api/v1/share-sessions", map[string]string{})
	createReq.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(createResp, createReq)
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
	joinReq := jsonReq(http.MethodPost, "/api/v1/control-sessions/join", map[string]string{"code": created.Code})
	joinReq.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(joinResp, joinReq)
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
	auth := registerTestUser(t, app)

	createResp := httptest.NewRecorder()
	createReq := jsonReq(http.MethodPost, "/api/v1/share-sessions", map[string]string{})
	createReq.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(createResp, createReq)
	var created struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	_ = json.Unmarshal(createResp.Body.Bytes(), &created)

	joinResp := httptest.NewRecorder()
	joinReq := jsonReq(http.MethodPost, "/api/v1/control-sessions/join", map[string]string{"code": created.Code})
	joinReq.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	app.ServeHTTP(joinResp, joinReq)

	approveResp := httptest.NewRecorder()
	app.ServeHTTP(approveResp, jsonReq(http.MethodPost, "/api/v1/share-sessions/"+created.ID+"/approve", map[string]string{"token": "wrong"}))
	if approveResp.Code != http.StatusUnauthorized {
		t.Fatalf("approve with wrong token status = %d body=%s", approveResp.Code, approveResp.Body.String())
	}
}

func TestICEConfigRequiresAuthAndReturnsEphemeralTURNCredentials(t *testing.T) {
	cfg := testConfig()
	cfg.TURNURLs = []string{"turn:turn.example.test:3478?transport=udp", "turns:turn.example.test:5349"}
	cfg.TURNSecret = "turn-rest-shared-secret-long-enough-32"
	cfg.TURNCredentialTTL = 5 * time.Minute
	app := NewServer(cfg, session.NewStore(session.StoreConfig{CodeTTL: cfg.CodeTTL}), slog.Default()).Routes()
	auth := registerTestUser(t, app)

	unauthorized := httptest.NewRecorder()
	app.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/api/v1/ice-config", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthorized ICE config status=%d body=%s", unauthorized.Code, unauthorized.Body.String())
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/ice-config", nil)
	request.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, request)
	if resp.Code != http.StatusOK {
		t.Fatalf("ice config status=%d body=%s", resp.Code, resp.Body.String())
	}
	var body struct {
		ICEServers []config.ICEServer `json:"iceServers"`
	}
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.ICEServers) != 2 {
		t.Fatalf("ICE server count=%d, want STUN plus TURN", len(body.ICEServers))
	}
	if len(body.ICEServers[0].URLs) != 1 || body.ICEServers[0].URLs[0] != "stun:stun.l.google.com:19302" {
		t.Fatalf("default STUN server missing: %#v", body.ICEServers[0])
	}
	turn := body.ICEServers[1]
	if len(turn.URLs) != 2 || turn.URLs[0] != cfg.TURNURLs[0] || turn.URLs[1] != cfg.TURNURLs[1] {
		t.Fatalf("TURN URLs mismatch: %#v", turn.URLs)
	}
	parts := strings.SplitN(turn.Username, ":", 2)
	if len(parts) != 2 || parts[1] == "" {
		t.Fatalf("TURN username must be expiry:opaque, got %q", turn.Username)
	}
	expiresAt, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		t.Fatalf("invalid TURN username expiry: %v", err)
	}
	if remaining := time.Until(time.Unix(expiresAt, 0)); remaining < 4*time.Minute || remaining > 6*time.Minute {
		t.Fatalf("TURN credential remaining TTL=%s, want about 5 minutes", remaining)
	}
	mac := hmac.New(sha1.New, []byte(cfg.TURNSecret))
	_, _ = mac.Write([]byte(turn.Username))
	wantCredential := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if turn.Credential != wantCredential {
		t.Fatalf("TURN credential does not match REST HMAC for username")
	}
}

func TestICEConfigFailsClosedForWeakTURNSecret(t *testing.T) {
	cfg := testConfig()
	cfg.TURNURLs = []string{"turn:turn.example.test:3478"}
	cfg.TURNSecret = "too-short"
	app := NewServer(cfg, session.NewStore(session.StoreConfig{CodeTTL: cfg.CodeTTL}), slog.Default()).Routes()
	auth := registerTestUser(t, app)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/ice-config", nil)
	request.Header.Set("Authorization", "Bearer "+auth.AccessToken)
	resp := httptest.NewRecorder()
	app.ServeHTTP(resp, request)
	if resp.Code != http.StatusServiceUnavailable {
		t.Fatalf("weak TURN secret status=%d body=%s, want service unavailable", resp.Code, resp.Body.String())
	}
}

func testServer() http.Handler {
	cfg := testConfig()
	store := session.NewStore(session.StoreConfig{CodeTTL: cfg.CodeTTL})
	return NewServer(cfg, store, slog.Default()).Routes()
}

func testConfig() config.Config {
	return config.Config{
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
}

func jsonReq(method, path string, body any) *http.Request {
	buf, _ := json.Marshal(body)
	return httptest.NewRequest(method, path, bytes.NewReader(buf))
}
