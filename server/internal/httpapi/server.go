package httpapi

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"remoteassist/server/internal/config"
	"remoteassist/server/internal/identity"
	"remoteassist/server/internal/session"
)

type Server struct {
	cfg          config.Config
	store        *session.Store
	logger       *slog.Logger
	identity     *identity.Service
	assist       *assistHub
	peers        *peerHub
	limiter      *ipLimiter
	loginLimiter *ipLimiter
	upgrader     websocket.Upgrader
}

func NewServer(cfg config.Config, store *session.Store, logger *slog.Logger, identityServices ...*identity.Service) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	var identityService *identity.Service
	if len(identityServices) > 0 {
		identityService = identityServices[0]
	}
	if identityService == nil {
		mem := identity.NewMemoryStore()
		identityService, _ = identity.NewService(mem, identity.ServiceConfig{
			AccessSecret:       cfg.JWTSecret,
			RefreshSecret:      cfg.RefreshTokenSecret,
			AccessTTL:          cfg.AccessTokenTTL,
			RefreshTTL:         cfg.RefreshTokenTTL,
			DeviceOfflineAfter: cfg.DeviceOfflineAfter,
			Now:                time.Now,
		})
	}
	return &Server{
		cfg:          cfg,
		store:        store,
		logger:       logger,
		identity:     identityService,
		assist:       newAssistHub(),
		peers:        newPeerHub(),
		limiter:      newIPLimiter(cfg.RateLimitPerMinute, time.Minute),
		loginLimiter: newIPLimiter(cfg.LoginFailLimit, time.Minute),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				return origin == "" || config.IsAllowedAppOrigin(origin, cfg.AppOrigins)
			},
		},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("POST /api/v1/auth/register", s.authRegister)
	mux.HandleFunc("POST /api/v1/auth/login", s.authLogin)
	mux.HandleFunc("POST /api/v1/auth/refresh", s.authRefresh)
	mux.HandleFunc("POST /api/v1/auth/logout", s.authLogout)
	mux.HandleFunc("GET /api/v1/auth/me", s.authMe)
	mux.HandleFunc("POST /api/v1/devices/register", s.registerDevice)
	mux.HandleFunc("GET /api/v1/devices", s.listDevices)
	mux.HandleFunc("PATCH /api/v1/devices/{id}", s.updateDevice)
	mux.HandleFunc("DELETE /api/v1/devices/{id}", s.deleteDevice)
	mux.HandleFunc("POST /api/v1/devices/{id}/heartbeat", s.heartbeatDevice)
	mux.HandleFunc("POST /api/v1/devices/{id}/assist", s.requestDeviceAssist)
	mux.HandleFunc("GET /api/v1/devices/{id}/assist-requests", s.listDeviceAssistRequests)
	mux.HandleFunc("POST /api/v1/assist-requests/{id}/resolve", s.resolveDeviceAssistRequest)
	mux.HandleFunc("GET /api/v1/ice-config", s.iceConfig)
	mux.HandleFunc("POST /api/v1/share-sessions", s.createShareSession)
	mux.HandleFunc("POST /api/v1/control-sessions/join", s.joinControlSession)
	mux.HandleFunc("POST /api/v1/share-sessions/{id}/approve", s.approveShareSession)
	mux.HandleFunc("POST /api/v1/share-sessions/{id}/reject", s.rejectShareSession)
	mux.HandleFunc("POST /api/v1/share-sessions/{id}/disconnect", s.disconnectShareSession)
	mux.HandleFunc("GET /api/v1/ws", s.websocket)
	return s.securityHeaders(s.cors(s.rateLimit(mux)))
}

func (s *Server) authRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	result, err := s.identity.Register(r.Context(), req.Username, req.Email, req.Password)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	if !s.loginLimiter.allow(clientIP(r, s.cfg.TrustedProxyCIDRs...)) {
		writeError(w, http.StatusTooManyRequests, "login_rate_limited")
		return
	}
	var req struct {
		Login    string `json:"login"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	result, err := s.identity.Login(r.Context(), req.Login, req.Password)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) authRefresh(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	result, err := s.identity.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refreshToken"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.identity.Logout(r.Context(), req.RefreshToken); err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) authMe(w http.ResponseWriter, r *http.Request) {
	user, err := s.identity.Me(r.Context(), bearerToken(r))
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) registerDevice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceName        string `json:"deviceName"`
		DeviceFingerprint string `json:"deviceFingerprint"`
		OSName            string `json:"osName"`
		AppVersion        string `json:"appVersion"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	device, err := s.identity.RegisterDevice(r.Context(), bearerToken(r), req.DeviceName, req.DeviceFingerprint, req.OSName, req.AppVersion)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"device": device})
}

func (s *Server) listDevices(w http.ResponseWriter, r *http.Request) {
	devices, err := s.identity.ListDevices(r.Context(), bearerToken(r), r.URL.Query().Get("currentDeviceId"))
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices})
}

func (s *Server) updateDevice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Note string `json:"note"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	device, err := s.identity.UpdateDevice(r.Context(), bearerToken(r), r.PathValue("id"), req.Note)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"device": device})
}

func (s *Server) deleteDevice(w http.ResponseWriter, r *http.Request) {
	if err := s.identity.RevokeDevice(r.Context(), bearerToken(r), r.PathValue("id")); err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}

func (s *Server) heartbeatDevice(w http.ResponseWriter, r *http.Request) {
	if !decodeEmptyOrObject(w, r) {
		return
	}
	device, err := s.identity.Heartbeat(r.Context(), bearerToken(r), r.PathValue("id"))
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"device": device})
}

func (s *Server) requestDeviceAssist(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ControllerDeviceID string `json:"controllerDeviceId"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	devices, err := s.identity.ListDevices(r.Context(), bearerToken(r), req.ControllerDeviceID)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	var host, controller *identity.Device
	for i := range devices {
		if devices[i].ID == r.PathValue("id") {
			host = &devices[i]
		}
		if devices[i].ID == req.ControllerDeviceID {
			controller = &devices[i]
		}
	}
	if host == nil || controller == nil || !host.Online {
		writeError(w, http.StatusConflict, "device_not_available")
		return
	}
	request := s.assist.create(host.ID, controller.ID, controller.DeviceName)
	writeJSON(w, http.StatusCreated, map[string]any{"request": request})
}

func (s *Server) listDeviceAssistRequests(w http.ResponseWriter, r *http.Request) {
	if _, err := s.identity.Heartbeat(r.Context(), bearerToken(r), r.PathValue("id")); err != nil {
		writeIdentityError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"requests": s.assist.pendingForHost(r.PathValue("id"))})
}

func (s *Server) resolveDeviceAssistRequest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Status != "ACCEPTED" && req.Status != "REJECTED" {
		writeError(w, http.StatusBadRequest, "invalid_status")
		return
	}
	devices, err := s.identity.ListDevices(r.Context(), bearerToken(r), "")
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	request, ok := s.assist.lookup(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	hostOwned := false
	for _, device := range devices {
		if device.ID == request.HostDeviceID {
			hostOwned = true
			break
		}
	}
	if !hostOwned {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}
	request, ok = s.assist.resolve(r.PathValue("id"), request.HostDeviceID, req.Status)
	if !ok {
		writeError(w, http.StatusConflict, "invalid_state")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"request": request})
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) iceConfig(w http.ResponseWriter, r *http.Request) {
	if _, err := s.identity.Me(r.Context(), bearerToken(r)); err != nil {
		writeIdentityError(w, err)
		return
	}
	iceServers := append([]config.ICEServer(nil), s.cfg.ICEServers...)
	if len(s.cfg.TURNURLs) > 0 {
		if len(s.cfg.TURNSecret) < 32 {
			writeError(w, http.StatusServiceUnavailable, "turn_unavailable")
			return
		}
		ttl := s.cfg.TURNCredentialTTL
		if ttl < time.Minute || ttl > 24*time.Hour {
			ttl = 10 * time.Minute
		}
		randomPart := make([]byte, 16)
		if _, err := rand.Read(randomPart); err != nil {
			writeError(w, http.StatusInternalServerError, "credential_generation_failed")
			return
		}
		username := strconv.FormatInt(time.Now().Add(ttl).Unix(), 10) + ":" + base64.RawURLEncoding.EncodeToString(randomPart)
		mac := hmac.New(sha1.New, []byte(s.cfg.TURNSecret))
		_, _ = mac.Write([]byte(username))
		credential := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		iceServers = append(iceServers, config.ICEServer{
			URLs:       append([]string(nil), s.cfg.TURNURLs...),
			Username:   username,
			Credential: credential,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"iceServers": iceServers})
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

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		canonicalOrigin, validOrigin := config.NormalizeAppOrigin(origin)
		if origin == "" || !validOrigin || !config.IsAllowedAppOrigin(canonicalOrigin, s.cfg.AppOrigins) {
			if r.Method == http.MethodOptions || origin != "" {
				writeError(w, http.StatusForbidden, "origin_not_allowed")
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		w.Header().Add("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Origin", canonicalOrigin)
		if r.Method == http.MethodOptions {
			w.Header().Add("Vary", "Access-Control-Request-Method")
			w.Header().Add("Vary", "Access-Control-Request-Headers")
			method := strings.ToUpper(strings.TrimSpace(r.Header.Get("Access-Control-Request-Method")))
			if !allowedCORSMethod(method) {
				writeError(w, http.StatusForbidden, "method_not_allowed")
				return
			}
			if !allowedCORSHeaders(r.Header.Get("Access-Control-Request-Headers")) {
				writeError(w, http.StatusForbidden, "headers_not_allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func allowedCORSMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodPost, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func allowedCORSHeaders(header string) bool {
	for _, value := range strings.Split(header, ",") {
		name := strings.ToLower(strings.TrimSpace(value))
		if name == "" {
			continue
		}
		if name != "authorization" && name != "content-type" {
			return false
		}
	}
	return true
}

func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.allow(clientIP(r, s.cfg.TrustedProxyCIDRs...)) {
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

func writeIdentityError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, identity.ErrInvalidInput):
		writeError(w, http.StatusBadRequest, "invalid_input")
	case errors.Is(err, identity.ErrConflict):
		writeError(w, http.StatusConflict, "conflict")
	case errors.Is(err, identity.ErrInvalidCredentials), errors.Is(err, identity.ErrUnauthorized), errors.Is(err, identity.ErrRevoked):
		writeError(w, http.StatusUnauthorized, "unauthorized")
	case errors.Is(err, identity.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found")
	default:
		writeError(w, http.StatusInternalServerError, "server_error")
	}
}

func bearerToken(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return ""
	}
	return strings.TrimSpace(value[7:])
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

func clientIP(r *http.Request, trustedProxies ...*net.IPNet) string {
	remoteHost := r.RemoteAddr
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		remoteHost = host
	} else {
		remoteHost = strings.TrimPrefix(strings.TrimSuffix(remoteHost, "]"), "[")
	}
	remoteIP := net.ParseIP(remoteHost)
	if remoteIP == nil {
		return r.RemoteAddr
	}
	if !isTrustedProxy(remoteIP, trustedProxies) {
		return remoteIP.String()
	}
	forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwarded == "" {
		return remoteIP.String()
	}
	chain := strings.Split(forwarded, ",")
	forwardedIPs := make([]net.IP, 0, len(chain))
	for _, value := range chain {
		ip := net.ParseIP(strings.TrimSpace(value))
		if ip == nil {
			return remoteIP.String()
		}
		forwardedIPs = append(forwardedIPs, ip)
	}
	forwardedIPs = append(forwardedIPs, remoteIP)
	for i := len(forwardedIPs) - 1; i >= 0; i-- {
		if !isTrustedProxy(forwardedIPs[i], trustedProxies) {
			return forwardedIPs[i].String()
		}
	}
	return remoteIP.String()
}

func isTrustedProxy(ip net.IP, trustedProxies []*net.IPNet) bool {
	for _, network := range trustedProxies {
		if network != nil && network.Contains(ip) {
			return true
		}
	}
	return false
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
	mu        sync.Mutex
	limit     int
	window    time.Duration
	maxKeys   int
	lastSweep time.Time
	requests  map[string][]time.Time
}

type assistRequest struct {
	ID                   string    `json:"id"`
	HostDeviceID         string    `json:"hostDeviceId"`
	ControllerDeviceID   string    `json:"controllerDeviceId"`
	ControllerDeviceName string    `json:"controllerDeviceName"`
	Status               string    `json:"status"`
	CreatedAt            time.Time `json:"createdAt"`
}

type assistHub struct {
	mu       sync.Mutex
	requests map[string]assistRequest
}

func newAssistHub() *assistHub {
	return &assistHub{requests: map[string]assistRequest{}}
}

func (h *assistHub) create(hostDeviceID, controllerDeviceID, controllerName string) assistRequest {
	h.mu.Lock()
	defer h.mu.Unlock()
	request := assistRequest{
		ID:                   "asr_" + time.Now().UTC().Format("20060102150405.000000000"),
		HostDeviceID:         hostDeviceID,
		ControllerDeviceID:   controllerDeviceID,
		ControllerDeviceName: controllerName,
		Status:               "WAITING_FOR_HOST",
		CreatedAt:            time.Now().UTC(),
	}
	h.requests[request.ID] = request
	return request
}

func (h *assistHub) pendingForHost(hostDeviceID string) []assistRequest {
	h.mu.Lock()
	defer h.mu.Unlock()
	var out []assistRequest
	for _, request := range h.requests {
		if request.HostDeviceID == hostDeviceID && request.Status == "WAITING_FOR_HOST" {
			out = append(out, request)
		}
	}
	return out
}

func (h *assistHub) lookup(id string) (assistRequest, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	request, ok := h.requests[id]
	return request, ok
}

func (h *assistHub) resolve(id, hostDeviceID, status string) (assistRequest, bool) {
	if status != "ACCEPTED" && status != "REJECTED" {
		return assistRequest{}, false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	request, ok := h.requests[id]
	if !ok {
		return assistRequest{}, false
	}
	if request.HostDeviceID != hostDeviceID || request.Status != "WAITING_FOR_HOST" {
		return assistRequest{}, false
	}
	request.Status = status
	h.requests[id] = request
	return request, true
}

func newIPLimiter(limit int, window time.Duration) *ipLimiter {
	if limit <= 0 {
		limit = 120
	}
	if window <= 0 {
		window = time.Minute
	}
	return &ipLimiter{limit: limit, window: window, maxKeys: 4096, requests: map[string][]time.Time{}}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-l.window)
	if l.lastSweep.IsZero() || now.Sub(l.lastSweep) >= l.window {
		for key, seen := range l.requests {
			kept := seen[:0]
			for _, timestamp := range seen {
				if timestamp.After(cutoff) {
					kept = append(kept, timestamp)
				}
			}
			if len(kept) == 0 {
				delete(l.requests, key)
			} else {
				l.requests[key] = kept
			}
		}
		l.lastSweep = now
	}
	if _, exists := l.requests[ip]; !exists && len(l.requests) >= l.maxKeys {
		return false
	}
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
