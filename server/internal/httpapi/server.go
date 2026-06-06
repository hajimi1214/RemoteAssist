package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"remoteassist/server/internal/config"
	"remoteassist/server/internal/session"
)

type Server struct {
	cfg      config.Config
	store    *session.Store
	logger   *slog.Logger
	peers    *peerHub
	limiter  *ipLimiter
	upgrader websocket.Upgrader
}

func NewServer(cfg config.Config, store *session.Store, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		cfg:     cfg,
		store:   store,
		logger:  logger,
		peers:   newPeerHub(),
		limiter: newIPLimiter(cfg.RateLimitPerMinute, time.Minute),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /api/v1/ice-config", s.iceConfig)
	mux.HandleFunc("POST /api/v1/share-sessions", s.createShareSession)
	mux.HandleFunc("POST /api/v1/control-sessions/join", s.joinControlSession)
	mux.HandleFunc("POST /api/v1/share-sessions/{id}/approve", s.approveShareSession)
	mux.HandleFunc("POST /api/v1/share-sessions/{id}/reject", s.rejectShareSession)
	mux.HandleFunc("POST /api/v1/share-sessions/{id}/disconnect", s.disconnectShareSession)
	mux.HandleFunc("GET /api/v1/ws", s.websocket)
	return s.securityHeaders(s.rateLimit(mux))
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) iceConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"iceServers": s.cfg.ICEServers})
}

func (s *Server) createShareSession(w http.ResponseWriter, r *http.Request) {
	if !decodeEmptyOrObject(w, r) {
		return
	}
	created, hostToken, err := s.store.CreateShareSession()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create_failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        created.ID,
		"code":      created.Code,
		"hostToken": hostToken,
		"state":     created.State,
		"expiresAt": created.ExpiresAt,
	})
}

func (s *Server) joinControlSession(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	req.Code = strings.TrimSpace(req.Code)
	if len(req.Code) != 8 {
		writeError(w, http.StatusBadRequest, "invalid_code")
		return
	}
	joined, controllerToken, err := s.store.Join(req.Code)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":              joined.ID,
		"controllerToken": controllerToken,
		"state":           joined.State,
		"expiresAt":       joined.ExpiresAt,
	})
}

func (s *Server) approveShareSession(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := s.store.Approve(r.PathValue("id"), req.Token)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	s.peers.broadcastSystem(updated.ID, "approved")
	writeJSON(w, http.StatusOK, map[string]any{
		"id":              updated.ID,
		"state":           updated.State,
		"controllerToken": updated.ControllerToken,
	})
}

func (s *Server) rejectShareSession(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := s.store.Reject(r.PathValue("id"), req.Token)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	s.peers.broadcastSystem(updated.ID, "rejected")
	writeJSON(w, http.StatusOK, map[string]any{"id": updated.ID, "state": updated.State})
}

func (s *Server) disconnectShareSession(w http.ResponseWriter, r *http.Request) {
	var req tokenRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, err := s.store.Disconnect(r.PathValue("id"), req.Token)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	s.peers.broadcastSystem(updated.ID, "disconnect")
	writeJSON(w, http.StatusOK, map[string]any{"id": updated.ID, "state": updated.State})
}

func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	token := r.URL.Query().Get("token")
	role := r.URL.Query().Get("role")
	if sessionID == "" || token == "" || (role != "host" && role != "controller") {
		writeError(w, http.StatusBadRequest, "invalid_ws_params")
		return
	}
	current, actualRole, err := s.store.ValidateToken(sessionID, token)
	if err != nil || actualRole != role {
		writeStoreError(w, err)
		return
	}
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.logger.Warn("websocket upgrade failed", "sessionId", sessionID, "error", err)
		return
	}
	conn.SetReadLimit(s.cfg.MaxMessageBytes)
	peer := &peer{sessionID: current.ID, role: role, conn: conn, send: make(chan []byte, 16)}
	s.peers.add(peer)
	s.logger.Info("websocket connected", "sessionId", current.ID, "role", role)
	go s.writePump(peer)
	s.readPump(peer, token)
}

func (s *Server) readPump(p *peer, token string) {
	defer func() {
		_, _ = s.store.Disconnect(p.sessionID, token)
		s.peers.remove(p)
		_ = p.conn.Close()
		s.peers.broadcastSystem(p.sessionID, "disconnect")
		s.logger.Info("websocket disconnected", "sessionId", p.sessionID, "role", p.role)
	}()
	p.conn.SetPongHandler(func(string) error {
		return p.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})
	for {
		_ = p.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		msgType, payload, err := p.conn.ReadMessage()
		if err != nil {
			return
		}
		if msgType != websocket.TextMessage {
			continue
		}
		var msg wsMessage
		if err := json.Unmarshal(payload, &msg); err != nil || !validWSMessage(msg, p.sessionID, token) {
			s.writePeerError(p, "invalid_message")
			continue
		}
		if msg.Type == "disconnect" {
			_, _ = s.store.Disconnect(p.sessionID, token)
			s.peers.broadcastSystem(p.sessionID, "disconnect")
			return
		}
		s.peers.forward(p, payload)
	}
}

func (s *Server) writePump(p *peer) {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case payload, ok := <-p.send:
			if !ok {
				_ = p.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := p.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			if err := p.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) writePeerError(p *peer, code string) {
	body, _ := json.Marshal(map[string]any{"type": "error", "code": code, "ts": time.Now().UnixMilli()})
	select {
	case p.send <- body:
	default:
	}
}

func validWSMessage(msg wsMessage, sessionID, token string) bool {
	if msg.SessionID != sessionID || msg.SessionToken != token || msg.Timestamp <= 0 {
		return false
	}
	switch msg.Type {
	case "offer", "answer", "ice", "ping", "pong", "disconnect":
		return msg.Payload != nil || msg.Type == "disconnect" || msg.Type == "ping" || msg.Type == "pong"
	default:
		return false
	}
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.allow(clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "rate_limited")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type tokenRequest struct {
	Token string `json:"token"`
}

type wsMessage struct {
	Type         string          `json:"type"`
	SessionID    string          `json:"sessionId"`
	SessionToken string          `json:"sessionToken"`
	Timestamp    int64           `json:"ts"`
	Payload      json.RawMessage `json:"payload,omitempty"`
}

func decodeEmptyOrObject(w http.ResponseWriter, r *http.Request) bool {
	if r.Body == nil || r.ContentLength == 0 {
		return true
	}
	var body map[string]any
	return decodeJSON(w, r, &body)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return false
	}
	return true
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, session.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	case errors.Is(err, session.ErrExpired):
		writeError(w, http.StatusGone, "expired")
	case errors.Is(err, session.ErrInvalidToken):
		writeError(w, http.StatusUnauthorized, "invalid_token")
	case errors.Is(err, session.ErrInvalidState):
		writeError(w, http.StatusConflict, "invalid_state")
	default:
		writeError(w, http.StatusInternalServerError, "server_error")
	}
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSONStatus(w, status, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	writeJSONStatus(w, status, value)
}

func writeJSONStatus(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func clientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		if first := strings.TrimSpace(strings.Split(forwarded, ",")[0]); first != "" {
			return first
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type peer struct {
	sessionID string
	role      string
	conn      *websocket.Conn
	send      chan []byte
}

type peerHub struct {
	mu    sync.RWMutex
	peers map[string]map[string]*peer
}

func newPeerHub() *peerHub {
	return &peerHub{peers: map[string]map[string]*peer{}}
}

func (h *peerHub) add(p *peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.peers[p.sessionID] == nil {
		h.peers[p.sessionID] = map[string]*peer{}
	}
	if old := h.peers[p.sessionID][p.role]; old != nil {
		close(old.send)
	}
	h.peers[p.sessionID][p.role] = p
}

func (h *peerHub) remove(p *peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if byRole := h.peers[p.sessionID]; byRole != nil && byRole[p.role] == p {
		delete(byRole, p.role)
		close(p.send)
		if len(byRole) == 0 {
			delete(h.peers, p.sessionID)
		}
	}
}

func (h *peerHub) forward(from *peer, payload []byte) {
	targetRole := "controller"
	if from.role == "controller" {
		targetRole = "host"
	}
	h.mu.RLock()
	target := h.peers[from.sessionID][targetRole]
	h.mu.RUnlock()
	if target == nil {
		return
	}
	select {
	case target.send <- payload:
	default:
	}
}

func (h *peerHub) broadcastSystem(sessionID, typ string) {
	body, _ := json.Marshal(map[string]any{"type": typ, "sessionId": sessionID, "ts": time.Now().UnixMilli()})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, p := range h.peers[sessionID] {
		select {
		case p.send <- body:
		default:
		}
	}
}

type ipLimiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	requests map[string][]time.Time
}

func newIPLimiter(limit int, window time.Duration) *ipLimiter {
	if limit <= 0 {
		limit = 120
	}
	return &ipLimiter{limit: limit, window: window, requests: map[string][]time.Time{}}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-l.window)
	kept := l.requests[ip][:0]
	for _, seen := range l.requests[ip] {
		if seen.After(cutoff) {
			kept = append(kept, seen)
		}
	}
	if len(kept) >= l.limit {
		l.requests[ip] = kept
		return false
	}
	l.requests[ip] = append(kept, now)
	return true
}
