package httpapi

import (
	"context"
	"net/http"

	"remoteassist/server/internal/identity"
	"remoteassist/server/internal/session"
)

func directSessionResponse(current *session.Session, hostToken bool, controllerName string) map[string]any {
	body := map[string]any{"id": current.ID, "state": current.State, "expiresAt": current.ExpiresAt, "hostDeviceId": current.HostDeviceID, "controllerDeviceId": current.ControllerDeviceID}
	if hostToken {
		body["hostToken"] = current.HostToken
		body["controllerDeviceName"] = controllerName
	} else {
		body["controllerToken"] = current.ControllerToken
	}
	return body
}

func (s *Server) connectDevice(w http.ResponseWriter, r *http.Request) {
	user, err := s.identity.Me(r.Context(), bearerToken(r))
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	var req struct {
		ControllerDeviceID string `json:"controllerDeviceId"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	s.directMu.Lock()
	defer s.directMu.Unlock()
	_, _, err = s.identity.LiveDevicePair(r.Context(), user.ID, r.PathValue("id"), req.ControllerDeviceID)
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	current, err := s.store.CreateDeviceSession(user.ID, r.PathValue("id"), req.ControllerDeviceID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, directSessionResponse(current, false, ""))
}

func (s *Server) pendingDeviceSessions(w http.ResponseWriter, r *http.Request) {
	user, err := s.identity.Me(r.Context(), bearerToken(r))
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	s.directMu.Lock()
	defer s.directMu.Unlock()
	// The host's authenticated poll also serves as its presence heartbeat.
	if _, err = s.identity.Heartbeat(r.Context(), bearerToken(r), r.PathValue("id")); err != nil {
		writeIdentityError(w, err)
		return
	}
	out := make([]map[string]any, 0)
	for _, current := range s.store.PendingDeviceSessions(user.ID, r.PathValue("id")) {
		_, controller, err := s.identity.LiveDevicePair(r.Context(), user.ID, current.HostDeviceID, current.ControllerDeviceID)
		if err != nil {
			s.invalidateDirect(current)
			continue
		}
		out = append(out, directSessionResponse(current, true, controller.DeviceName))
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

func (s *Server) acceptDeviceSession(w http.ResponseWriter, r *http.Request) {
	user, err := s.identity.Me(r.Context(), bearerToken(r))
	if err != nil {
		writeIdentityError(w, err)
		return
	}
	var req struct {
		HostToken string `json:"hostToken"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	s.directMu.Lock()
	defer s.directMu.Unlock()
	current, err := s.store.Get(r.PathValue("sessionId"))
	// Conceal session existence from another account or another target device.
	if current == nil || current.OwnerUserID != user.ID || current.HostDeviceID != r.PathValue("id") {
		writeIdentityError(w, identity.ErrNotFound)
		return
	}
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if _, _, err = s.identity.LiveDevicePair(r.Context(), user.ID, current.HostDeviceID, current.ControllerDeviceID); err != nil {
		s.invalidateDirect(current)
		writeIdentityError(w, err)
		return
	}
	accepted, err := s.store.AcceptDeviceSession(current.ID, user.ID, current.HostDeviceID, req.HostToken)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	s.peers.broadcastSystem(accepted.ID, "approved")
	writeJSON(w, http.StatusOK, directSessionResponse(accepted, false, ""))
}

func (s *Server) invalidateDirect(current *session.Session) {
	_, _ = s.store.Disconnect(current.ID, current.HostToken)
	s.peers.closeSession(current.ID)
}

func (s *Server) directSessionLive(ctx context.Context, current *session.Session) bool {
	if current.OwnerUserID == "" {
		return true
	}
	_, _, err := s.identity.LiveDevicePair(ctx, current.OwnerUserID, current.HostDeviceID, current.ControllerDeviceID)
	if err != nil {
		s.invalidateDirect(current)
		return false
	}
	return true
}
