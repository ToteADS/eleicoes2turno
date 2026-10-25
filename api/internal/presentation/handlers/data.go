// Package handlers serves the API and the static site.
package handlers

import (
	"net/http"
	"slices"
	"strings"

	"github.com/gorilla/mux"

	"eleicoes2turno/internal/domain/repositories"
	"eleicoes2turno/internal/domain/services"
	"eleicoes2turno/pkg/response"
)

// dataCacheControl lets a CDN absorb the peak while keeping data fresh.
const dataCacheControl = "public, max-age=15, s-maxage=30, stale-while-revalidate=60"

// Data serves the result payloads kept in the store.
type Data struct {
	store repositories.ResultStore
}

// NewData builds the result handlers.
func NewData(store repositories.ResultStore) *Data { return &Data{store: store} }

// Summary serves GET /api/v1/summary.
func (d *Data) Summary(w http.ResponseWriter, r *http.Request) {
	d.serve(w, r, repositories.KeySummary)
}

// AbroadCities serves GET /api/v1/abroad/cities.
func (d *Data) AbroadCities(w http.ResponseWriter, r *http.Request) {
	d.serve(w, r, repositories.KeyAbroad)
}

// Municipalities serves GET /api/v1/uf/{uf}/municipalities.
func (d *Data) Municipalities(w http.ResponseWriter, r *http.Request) {
	uf := mux.Vars(r)["uf"]
	if !slices.Contains(services.AllUFs, uf) {
		response.Error(w, http.StatusNotFound, "unknown_uf")
		return
	}
	d.serve(w, r, repositories.KeyMunicipalities(uf))
}

func (d *Data) serve(w http.ResponseWriter, r *http.Request, key string) {
	body, gz, etag, ok := d.store.Payload(key)
	if !ok {
		w.Header().Set("Retry-After", "5")
		response.Error(w, http.StatusServiceUnavailable, "not_ready")
		return
	}
	h := w.Header()
	h.Set("Cache-Control", dataCacheControl)
	h.Set("ETag", etag)
	h.Set("Vary", "Accept-Encoding")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h.Set("Content-Type", "application/json; charset=utf-8")
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		h.Set("Content-Encoding", "gzip")
		_, _ = w.Write(gz)
		return
	}
	_, _ = w.Write(body)
}
