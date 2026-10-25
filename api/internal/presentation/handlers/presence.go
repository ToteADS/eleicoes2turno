package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"eleicoes2turno/internal/domain/repositories"
	"eleicoes2turno/pkg/response"
)

// Heartbeat limits: the body is {"id":"<tab id>"}, a UUID in practice.
const (
	presenceMaxBody = 256
	presenceIDMin   = 8
	presenceIDMax   = 64
)

type presenceRequest struct {
	ID string `json:"id"`
}

type presenceResponse struct {
	Online int `json:"online"`
}

// NewPresence serves POST /api/v1/presence: records the tab's heartbeat and
// answers how many tabs are online. Never cached, not even by a CDN.
func NewPresence(tracker repositories.PresenceTracker) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, presenceMaxBody))
		dec.DisallowUnknownFields()
		var req presenceRequest
		if err := dec.Decode(&req); err != nil || !errors.Is(dec.Decode(&struct{}{}), io.EOF) {
			response.Error(w, http.StatusBadRequest, "invalid_body")
			return
		}
		if !validTabID(req.ID) {
			response.Error(w, http.StatusBadRequest, "invalid_id")
			return
		}
		tracker.Seen(req.ID)
		response.JSON(w, http.StatusOK, presenceResponse{Online: tracker.Count()})
	})
}

// validTabID accepts 8 to 64 characters of [A-Za-z0-9-].
func validTabID(id string) bool {
	if len(id) < presenceIDMin || len(id) > presenceIDMax {
		return false
	}
	for i := 0; i < len(id); i++ {
		c := id[i]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-') {
			return false
		}
	}
	return true
}
