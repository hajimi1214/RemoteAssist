package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"remoteassist/server/internal/session"
)

func TestWebSocketCredentialsUseFirstFrameOnly(t *testing.T) {
	app, store, server := newWebSocketTestServer(t, session.StoreConfig{})
	created, token, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	legacy, response, err := websocket.DefaultDialer.Dial(sessionWSURL(server.URL, created.ID, "host")+"&token="+token, nil)
	if legacy != nil {
		legacy.Close()
	}
	if response != nil {
		defer response.Body.Close()
	}
	if err == nil || response == nil || response.StatusCode != http.StatusBadRequest {
		t.Fatal("URL credentials were accepted")
	}
	for _, frame := range []map[string]string{
		{"type": "offer", "token": token},
		{"type": "authenticate", "token": "invalid"},
		{"type": "authenticate", "token": strings.Repeat("x", 4096)},
	} {
		conn, _, err := websocket.DefaultDialer.Dial(sessionWSURL(server.URL, created.ID, "host"), nil)
		if err != nil {
			t.Fatal(err)
		}
		if err := conn.WriteJSON(frame); err != nil {
			t.Fatal(err)
		}
		assertSocketClosed(t, conn)
		conn.Close()
		if app.peers.hasRole(created.ID, "host") {
			t.Fatal("unauthenticated connection was registered")
		}
	}
	// Invalid authentication must not end the actual session or block a valid host.
	valid := dialSessionPeer(t, server.URL, created.ID, token, "host")
	valid.Close()
}

func TestControllerArrivingBeforeHostStillPromptsForApproval(t *testing.T) {
	_, store, server := newWebSocketTestServer(t, session.StoreConfig{})
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")
	writeTestSignal(t, controller, created.ID, controllerToken, "ping")
	host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
	if message := readTestSignal(t, host); message["type"] != "ping" {
		t.Fatalf("late host was not notified: %v", message)
	}
}

func TestWebSocketNegotiationRequiresHostApproval(t *testing.T) {
	app, store, server := newWebSocketTestServer(t, session.StoreConfig{})
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
	if msg := readTestSignal(t, host); msg["type"] != "ping" {
		t.Fatalf("pending host prompt missing: %v", msg)
	}
	controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")

	writeTestSignal(t, host, created.ID, hostToken, "offer")
	if msg := readTestSignal(t, host); msg["code"] != "host_approval_required" {
		t.Fatalf("expected preapproval offer rejection, got %v", msg)
	}
	writeTestSignal(t, controller, created.ID, controllerToken, "ping")
	if msg := readTestSignal(t, host); msg["type"] != "ping" {
		t.Fatalf("preapproval request notification was not forwarded: %v", msg)
	}
	resp := httptest.NewRecorder()
	app.Routes().ServeHTTP(resp, jsonReq(http.MethodPost, "/api/v1/share-sessions/"+created.ID+"/approve", map[string]string{"token": hostToken}))
	if resp.Code != http.StatusOK || !strings.Contains(resp.Body.String(), "expiresAt") {
		t.Fatalf("approve did not include active expiry: status=%d body=%s", resp.Code, resp.Body.String())
	}
	if msg := readTestSignal(t, host); msg["type"] != "approved" {
		t.Fatalf("host approval notification missing: %v", msg)
	}
	if msg := readTestSignal(t, controller); msg["type"] != "approved" {
		t.Fatalf("controller approval notification missing: %v", msg)
	}
	writeTestSignal(t, host, created.ID, hostToken, "offer")
	msg := readTestSignal(t, controller)
	if msg["type"] != "offer" {
		t.Fatalf("authorized offer was not forwarded: %v", msg)
	}
	if _, leaked := msg["sessionToken"]; leaked {
		t.Fatal("peer received the host credential")
	}
}

func TestAuthorizedControllerWebSocketPingGetsLocalPong(t *testing.T) {
	_, store, server := newWebSocketTestServer(t, session.StoreConfig{})
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(created.ID, hostToken); err != nil {
		t.Fatal(err)
	}
	host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
	controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")
	probeTimestamp := time.Now().UnixMilli()
	if err := controller.WriteJSON(map[string]any{
		"type": "ping", "sessionId": created.ID, "sessionToken": controllerToken,
		"ts": probeTimestamp, "payload": map[string]string{"value": "probe"},
	}); err != nil {
		t.Fatal(err)
	}

	pong := readTestSignal(t, controller)
	if pong["type"] != "pong" || pong["sessionId"] != created.ID || pong["ts"] != float64(probeTimestamp) {
		t.Fatalf("controller probe was not locally acknowledged with its timestamp: %#v", pong)
	}
	if _, leaked := pong["sessionToken"]; leaked {
		t.Fatal("websocket pong exposed the controller capability")
	}

	if err := host.SetReadDeadline(time.Now().Add(100 * time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	_, _, err = host.ReadMessage()
	if timeout, ok := err.(interface{ Timeout() bool }); !ok || !timeout.Timeout() {
		t.Fatalf("active controller ping should not be forwarded to host, read error=%v", err)
	}
}

func TestWebSocketDuplicateRoleDoesNotReplaceOriginal(t *testing.T) {
	_, store, server := newWebSocketTestServer(t, session.StoreConfig{})
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(created.ID, hostToken); err != nil {
		t.Fatal(err)
	}
	host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
	controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")
	duplicate, resp, err := websocket.DefaultDialer.Dial(sessionWSURL(server.URL, created.ID, "host"), nil)
	if duplicate != nil {
		_ = duplicate.Close()
	}
	if resp != nil {
		defer resp.Body.Close()
	}
	if err == nil || resp == nil || resp.StatusCode != http.StatusConflict {
		t.Fatalf("duplicate host was not rejected with conflict: response=%v err=%v", resp, err)
	}
	writeTestSignal(t, host, created.ID, hostToken, "offer")
	if msg := readTestSignal(t, controller); msg["type"] != "offer" {
		t.Fatalf("duplicate attempt damaged the original connection: %v", msg)
	}
}

func TestSessionHTTPActionClosesBothWebSockets(t *testing.T) {
	for _, action := range []string{"reject", "disconnect"} {
		t.Run(action, func(t *testing.T) {
			app, store, server := newWebSocketTestServer(t, session.StoreConfig{})
			created, hostToken, err := store.CreateShareSession()
			if err != nil {
				t.Fatal(err)
			}
			_, controllerToken, err := store.Join(created.Code)
			if err != nil {
				t.Fatal(err)
			}
			host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
			controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")
			resp := httptest.NewRecorder()
			app.Routes().ServeHTTP(resp, jsonReq(http.MethodPost, "/api/v1/share-sessions/"+created.ID+"/"+action, map[string]string{"token": hostToken}))
			if resp.Code != http.StatusOK {
				t.Fatalf("%s status=%d body=%s", action, resp.Code, resp.Body.String())
			}
			assertSocketClosed(t, host)
			assertSocketClosed(t, controller)
			if _, _, err := store.ValidateToken(created.ID, controllerToken); err == nil {
				t.Fatal("terminal session still accepted controller token")
			}
		})
	}
}

func TestSessionExpiryClosesIdleWebSockets(t *testing.T) {
	var clock atomic.Int64
	clock.Store(time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC).UnixNano())
	_, store, server := newWebSocketTestServer(t, session.StoreConfig{
		ActiveTTL: time.Minute,
		Now:       func() time.Time { return time.Unix(0, clock.Load()) },
	})
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Approve(created.ID, hostToken); err != nil {
		t.Fatal(err)
	}
	host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
	controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")
	clock.Add(int64(time.Minute))
	assertSocketClosed(t, host)
	assertSocketClosed(t, controller)
}

func TestWebSocketDisconnectSignalClosesBothPeers(t *testing.T) {
	_, store, server := newWebSocketTestServer(t, session.StoreConfig{})
	created, hostToken, err := store.CreateShareSession()
	if err != nil {
		t.Fatal(err)
	}
	_, controllerToken, err := store.Join(created.Code)
	if err != nil {
		t.Fatal(err)
	}
	host := dialSessionPeer(t, server.URL, created.ID, hostToken, "host")
	controller := dialSessionPeer(t, server.URL, created.ID, controllerToken, "controller")
	writeTestSignal(t, controller, created.ID, controllerToken, "disconnect")
	assertSocketClosed(t, host)
	assertSocketClosed(t, controller)
}

func TestPeerHubStaleCleanupCannotEndLaterPeer(t *testing.T) {
	hub := newPeerHub()
	old := &peer{sessionID: "session", role: "host", send: make(chan []byte, 16)}
	if !hub.add(old) || !hub.remove(old) {
		t.Fatal("could not register and remove initial peer")
	}
	current := &peer{sessionID: "session", role: "host", send: make(chan []byte, 16)}
	if !hub.add(current) {
		t.Fatal("could not register later peer")
	}
	ended := false
	if hub.closeSessionIfCurrent(old, func() { ended = true }) || ended || !hub.hasRole("session", "host") {
		t.Fatal("stale cleanup terminated a later peer")
	}
	hub.closeSession("session")
}

func TestPeerHubConcurrentForwardRemoveAndClose(t *testing.T) {
	for i := 0; i < 64; i++ {
		hub := newPeerHub()
		host := &peer{sessionID: "session", role: "host", send: make(chan []byte, 16)}
		controller := &peer{sessionID: "session", role: "controller", send: make(chan []byte, 16)}
		if !hub.add(host) || !hub.add(controller) {
			t.Fatal("initial peer registration failed")
		}
		var wg sync.WaitGroup
		for operation := 0; operation < 6; operation++ {
			wg.Add(1)
			go func(operation int) {
				defer wg.Done()
				for j := 0; j < 20; j++ {
					switch operation {
					case 0:
						hub.forward(host, []byte("offer"))
					case 1:
						hub.forward(controller, []byte("answer"))
					case 2:
						hub.broadcastSystem("session", "approved")
					case 3:
						hub.send(host, []byte("error"))
					case 4:
						hub.remove(host)
					default:
						hub.closeSession("session")
					}
				}
			}(operation)
		}
		wg.Wait()
		hub.closeSession("session")
	}
}

func newWebSocketTestServer(t *testing.T, cfg session.StoreConfig) (*Server, *session.Store, *httptest.Server) {
	t.Helper()
	cfg.CleanupInterval = time.Hour
	store := session.NewStore(cfg)
	app := NewServer(testConfig(), store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	server := httptest.NewServer(app.Routes())
	t.Cleanup(func() {
		app.peers.mu.RLock()
		ids := make([]string, 0, len(app.peers.peers))
		for id := range app.peers.peers {
			ids = append(ids, id)
		}
		app.peers.mu.RUnlock()
		for _, id := range ids {
			app.peers.closeSession(id)
		}
		server.Close()
		store.Stop()
	})
	return app, store, server
}

func sessionWSURL(baseURL, sessionID, role string) string {
	return "ws" + strings.TrimPrefix(baseURL, "http") + "/api/v1/ws?" + url.Values{
		"sessionId": {sessionID}, "role": {role},
	}.Encode()
}

func dialSessionPeer(t *testing.T, baseURL, sessionID, token, role string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.DefaultDialer.Dial(sessionWSURL(baseURL, sessionID, role), nil)
	if err != nil {
		t.Fatalf("%s websocket connection failed: %v", role, err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if err := conn.WriteJSON(map[string]string{"type": "authenticate", "token": token}); err != nil {
		t.Fatal(err)
	}
	if message := readTestSignal(t, conn); message["type"] != "ready" {
		t.Fatalf("authentication was not acknowledged: %v", message)
	}
	return conn
}

func writeTestSignal(t *testing.T, conn *websocket.Conn, sessionID, token, typ string) {
	t.Helper()
	if err := conn.WriteJSON(map[string]any{"type": typ, "sessionId": sessionID, "sessionToken": token, "ts": time.Now().UnixMilli(), "payload": map[string]string{"value": "test"}}); err != nil {
		t.Fatal(err)
	}
}

func readTestSignal(t *testing.T, conn *websocket.Conn) map[string]any {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var result map[string]any
	if err := conn.ReadJSON(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func assertSocketClosed(t *testing.T, conn *websocket.Conn) {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	var err error
	for i := 0; i < 32; i++ {
		_, _, err = conn.ReadMessage()
		if err != nil {
			break
		}
	}
	if err == nil {
		t.Fatal("expected websocket to close")
	}
	if networkError, ok := err.(interface{ Timeout() bool }); ok && networkError.Timeout() {
		t.Fatal("websocket remained open until the read deadline")
	}
}
