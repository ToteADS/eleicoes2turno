package handlers

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"eleicoes2turno/internal/domain/dtos"
	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/repositories"
	"eleicoes2turno/pkg/response"
)

const noticeMaxBody = 4 << 10

type noticeResponse struct {
	Notice *entities.Notice `json:"notice"`
}

// Notice serves the site-wide notice: GET is public; PUT and DELETE need
// "Authorization: Bearer <admin token>" and are disabled (404) without a token.
type Notice struct {
	store     repositories.NoticeStore
	tokenHash [sha256.Size]byte
	enabled   bool
	now       func() time.Time
}

// NewNotice builds the notice handlers; adminToken "" disables writes.
func NewNotice(store repositories.NoticeStore, adminToken string) *Notice {
	return &Notice{store: store, tokenHash: sha256.Sum256([]byte(adminToken)), enabled: adminToken != "", now: time.Now}
}

// Get answers {"notice": {...}} or {"notice": null}. Never cached.
func (h *Notice) Get(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	response.JSON(w, http.StatusOK, h.current())
}

// Put replaces the notice with the JSON body (a dtos.NoticeDTO).
func (h *Notice) Put(w http.ResponseWriter, r *http.Request) {
	if !h.authorize(w, r) {
		return
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, noticeMaxBody))
	dec.DisallowUnknownFields()
	var dto dtos.NoticeDTO
	if err := dec.Decode(&dto); err != nil || !errors.Is(dec.Decode(&struct{}{}), io.EOF) {
		response.Error(w, http.StatusBadRequest, "invalid_body")
		return
	}
	dto = dto.Normalize()
	if err := dto.Validate(); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	h.store.Set(dto.ToEntity(h.now()))
	w.Header().Set("Cache-Control", "no-store")
	response.JSON(w, http.StatusOK, h.current())
}

// Delete clears the notice.
func (h *Notice) Delete(w http.ResponseWriter, r *http.Request) {
	if !h.authorize(w, r) {
		return
	}
	h.store.Clear()
	w.Header().Set("Cache-Control", "no-store")
	response.JSON(w, http.StatusOK, noticeResponse{})
}

func (h *Notice) current() noticeResponse {
	if n, ok := h.store.Get(); ok {
		return noticeResponse{Notice: &n}
	}
	return noticeResponse{}
}

// authorize compares hashes in constant time, so neither the token nor its
// length leaks through timing.
func (h *Notice) authorize(w http.ResponseWriter, r *http.Request) bool {
	if !h.enabled {
		response.Error(w, http.StatusNotFound, "not_found")
		return false
	}
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	got := sha256.Sum256([]byte(token))
	if !ok || token == "" || subtle.ConstantTimeCompare(got[:], h.tokenHash[:]) != 1 {
		w.Header().Set("WWW-Authenticate", `Bearer realm="notice"`)
		response.Error(w, http.StatusUnauthorized, "unauthorized")
		return false
	}
	return true
}
