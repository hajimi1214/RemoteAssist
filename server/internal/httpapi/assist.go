package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sort"
	"sync"
	"time"
)

var ErrAssistRequestLimit = errors.New("assist request limit reached")

type assistRequest struct {
	ID                   string    `json:"id"`
	HostDeviceID         string    `json:"hostDeviceId"`
	ControllerDeviceID   string    `json:"controllerDeviceId"`
	ControllerDeviceName string    `json:"controllerDeviceName"`
	Status               string    `json:"status"`
	CreatedAt            time.Time `json:"createdAt"`
	ExpiresAt            time.Time `json:"expiresAt"`
	resolvedAt           time.Time
}

type assistHubConfig struct {
	TTL               time.Duration
	ResolvedRetention time.Duration
	GlobalLimit       int
	PerHostLimit      int
	Now               func() time.Time
}

type assistHub struct {
	mu       sync.Mutex
	requests map[string]assistRequest
	cfg      assistHubConfig
}

func newAssistHub(configs ...assistHubConfig) *assistHub {
	var cfg assistHubConfig
	if len(configs) > 0 {
		cfg = configs[0]
	}
	if cfg.TTL <= 0 {
		cfg.TTL = 5 * time.Minute
	}
	if cfg.ResolvedRetention <= 0 {
		cfg.ResolvedRetention = time.Minute
	}
	if cfg.GlobalLimit <= 0 {
		cfg.GlobalLimit = 4096
	}
	if cfg.PerHostLimit <= 0 {
		cfg.PerHostLimit = 16
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &assistHub{requests: map[string]assistRequest{}, cfg: cfg}
}

func (h *assistHub) create(hostDeviceID, controllerDeviceID, controllerName string) (assistRequest, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.cfg.Now().UTC()
	h.cleanupLocked(now)
	pendingForHost := 0
	for _, request := range h.requests {
		if request.HostDeviceID != hostDeviceID || request.Status != "WAITING_FOR_HOST" {
			continue
		}
		if request.ControllerDeviceID == controllerDeviceID {
			return request, nil
		}
		pendingForHost++
	}
	if len(h.requests) >= h.cfg.GlobalLimit || pendingForHost >= h.cfg.PerHostLimit {
		return assistRequest{}, ErrAssistRequestLimit
	}
	var randomID [16]byte
	if _, err := rand.Read(randomID[:]); err != nil {
		return assistRequest{}, err
	}
	request := assistRequest{
		ID:                   "asr_" + hex.EncodeToString(randomID[:]),
		HostDeviceID:         hostDeviceID,
		ControllerDeviceID:   controllerDeviceID,
		ControllerDeviceName: controllerName,
		Status:               "WAITING_FOR_HOST",
		CreatedAt:            now,
		ExpiresAt:            now.Add(h.cfg.TTL),
	}
	h.requests[request.ID] = request
	return request, nil
}

func (h *assistHub) pendingForHost(hostDeviceID string) []assistRequest {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cleanupLocked(h.cfg.Now())
	out := make([]assistRequest, 0)
	for _, request := range h.requests {
		if request.HostDeviceID == hostDeviceID && request.Status == "WAITING_FOR_HOST" {
			out = append(out, request)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

func (h *assistHub) lookup(id string) (assistRequest, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cleanupLocked(h.cfg.Now())
	request, ok := h.requests[id]
	return request, ok
}

func (h *assistHub) resolve(id, hostDeviceID, status string) (assistRequest, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.cfg.Now().UTC()
	h.cleanupLocked(now)
	if status != "ACCEPTED" && status != "REJECTED" {
		return assistRequest{}, false
	}
	request, ok := h.requests[id]
	if !ok || request.HostDeviceID != hostDeviceID || request.Status != "WAITING_FOR_HOST" {
		return assistRequest{}, false
	}
	request.Status = status
	request.resolvedAt = now
	h.requests[id] = request
	return request, true
}

func (h *assistHub) cleanupLocked(now time.Time) {
	for id, request := range h.requests {
		if request.Status == "WAITING_FOR_HOST" {
			if !now.Before(request.ExpiresAt) {
				delete(h.requests, id)
			}
		} else if !now.Before(request.resolvedAt.Add(h.cfg.ResolvedRetention)) {
			delete(h.requests, id)
		}
	}
}
