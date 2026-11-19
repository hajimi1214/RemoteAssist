package httpapi

import (
	"log/slog"
	"net"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"remoteassist/server/internal/session"
)

func TestClientIPIgnoresUntrustedForwardedHeader(t *testing.T) {
	req := httptest.NewRequest("GET", "http://example.test/", nil)
	req.RemoteAddr = "192.0.2.15:4321"
	req.Header.Set("X-Forwarded-For", "198.51.100.77, 203.0.113.9")
	if got := clientIP(req); got != "192.0.2.15" {
		t.Fatalf("clientIP=%q, want remote address; forwarded header must not be trusted", got)
	}
}

func TestClientIPUsesForwardedChainOnlyForTrustedProxy(t *testing.T) {
	_, trustedCIDR, err := net.ParseCIDR("172.16.0.0/12")
	if err != nil {
		t.Fatal(err)
	}
	trusted := httptest.NewRequest("GET", "http://example.test/", nil)
	trusted.RemoteAddr = "172.16.0.2:4321"
	trusted.Header.Set("X-Forwarded-For", "198.51.100.77, 172.16.0.3")
	if got := clientIP(trusted, trustedCIDR); got != "198.51.100.77" {
		t.Fatalf("trusted proxy clientIP=%q, want 198.51.100.77", got)
	}

	untrusted := httptest.NewRequest("GET", "http://example.test/", nil)
	untrusted.RemoteAddr = "203.0.113.50:4321"
	untrusted.Header.Set("X-Forwarded-For", "198.51.100.77")
	if got := clientIP(untrusted, trustedCIDR); got != "203.0.113.50" {
		t.Fatalf("untrusted proxy clientIP=%q, want RemoteAddr", got)
	}
}

func TestClientIPFallsBackOnMalformedForwardedChain(t *testing.T) {
	_, trustedCIDR, err := net.ParseCIDR("172.16.0.0/12")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "http://example.test/", nil)
	req.RemoteAddr = "172.16.0.2:4321"
	req.Header.Set("X-Forwarded-For", "198.51.100.77, not-an-ip")
	if got := clientIP(req, trustedCIDR); got != "172.16.0.2" {
		t.Fatalf("malformed forwarded clientIP=%q, want proxy RemoteAddr fallback", got)
	}
}

func TestCORSAllowsExactConfiguredOriginAndRejectsOthers(t *testing.T) {
	cfg := testConfig()
	cfg.AppOrigins = []string{"http://localhost:1420"}
	app := NewServer(cfg, session.NewStore(session.StoreConfig{CodeTTL: cfg.CodeTTL}), slog.Default()).Routes()

	allowed := httptest.NewRecorder()
	request := httptest.NewRequest("OPTIONS", "/api/v1/auth/login", nil)
	request.Header.Set("Origin", "http://localhost:1420")
	request.Header.Set("Access-Control-Request-Method", "POST")
	request.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type")
	app.ServeHTTP(allowed, request)
	if allowed.Code != 204 || allowed.Header().Get("Access-Control-Allow-Origin") != "http://localhost:1420" {
		t.Fatalf("allowed preflight status=%d headers=%v body=%s", allowed.Code, allowed.Header(), allowed.Body.String())
	}
	if allowed.Header().Get("Access-Control-Allow-Methods") == "" || allowed.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatalf("allowed preflight missing CORS method/header grants: %v", allowed.Header())
	}

	rejected := httptest.NewRecorder()
	request = httptest.NewRequest("OPTIONS", "/api/v1/auth/login", nil)
	request.Header.Set("Origin", "https://evil.example")
	request.Header.Set("Access-Control-Request-Method", "POST")
	app.ServeHTTP(rejected, request)
	if rejected.Code != 403 || rejected.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("rejected preflight status=%d headers=%v body=%s", rejected.Code, rejected.Header(), rejected.Body.String())
	}
}

func TestWebSocketCheckOriginUsesExactAllowlist(t *testing.T) {
	cfg := testConfig()
	cfg.AppOrigins = []string{"https://tauri.localhost"}
	server := NewServer(cfg, session.NewStore(session.StoreConfig{CodeTTL: cfg.CodeTTL}), slog.Default())

	allowed := httptest.NewRequest("GET", "/api/v1/ws", nil)
	allowed.Header.Set("Origin", "https://tauri.localhost")
	if !server.upgrader.CheckOrigin(allowed) {
		t.Fatal("configured app origin was rejected")
	}
	rejected := httptest.NewRequest("GET", "/api/v1/ws", nil)
	rejected.Header.Set("Origin", "https://evil.example")
	if server.upgrader.CheckOrigin(rejected) {
		t.Fatal("unconfigured app origin was accepted")
	}
	noOrigin := httptest.NewRequest("GET", "/api/v1/ws", nil)
	if !server.upgrader.CheckOrigin(noOrigin) {
		t.Fatal("native websocket without Origin should reach session token validation")
	}
}

func TestAssistRequestCanBeResolvedOnlyOnceConcurrently(t *testing.T) {
	hub := newAssistHub()
	request := hub.create("host-device", "controller-device", "Controller")
	start := make(chan struct{})
	results := make(chan bool, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, ok := hub.resolve(request.ID, "host-device", "ACCEPTED")
			results <- ok
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	successes := 0
	for ok := range results {
		if ok {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("expected exactly one resolve success, got %d", successes)
	}
}

func TestIPLimiterCapsHighCardinalityAndReclaimsExpiredKeys(t *testing.T) {
	limiter := &ipLimiter{
		limit: 1, window: time.Minute, maxKeys: 2,
		requests: map[string][]time.Time{},
	}
	if !limiter.allow("ip-a") || !limiter.allow("ip-b") {
		t.Fatal("expected initial IPs to be admitted")
	}
	if limiter.allow("ip-c") {
		t.Fatal("expected new IP to be denied when the tracking cap is reached")
	}
	if got := len(limiter.requests); got != 2 {
		t.Fatalf("tracked IP count=%d, want 2", got)
	}

	for ip := range limiter.requests {
		limiter.requests[ip] = []time.Time{time.Now().Add(-2 * time.Minute)}
	}
	limiter.lastSweep = time.Now().Add(-2 * time.Minute)
	if !limiter.allow("ip-c") {
		t.Fatal("expected expired entries to be reclaimed")
	}
	if got := len(limiter.requests); got != 1 {
		t.Fatalf("tracked IP count after cleanup=%d, want 1", got)
	}
}
