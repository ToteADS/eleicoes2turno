// Package cache implements ResultStore in memory. Payloads are serialized
// and compressed once on write, so serving them at peak costs nothing.
package cache

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sync"
	"time"

	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/repositories"
)

type payload struct {
	body []byte
	gz   []byte
	etag string
}

// MemoryStore is a concurrency-safe ResultStore.
type MemoryStore struct {
	mu       sync.RWMutex
	payloads map[string]payload
}

// NewMemoryStore returns an empty store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{payloads: map[string]payload{}}
}

type areaList struct {
	UF        string                         `json:"uf,omitempty"`
	UpdatedAt time.Time                      `json:"updatedAt"`
	Items     map[string]entities.AreaResult `json:"items"`
}

// SetSummary stores the national snapshot.
func (s *MemoryStore) SetSummary(snap entities.Snapshot) { s.put(repositories.KeySummary, snap) }

// SetMunicipalities stores one state's municipalities keyed by IBGE code.
func (s *MemoryStore) SetMunicipalities(uf string, items map[string]entities.AreaResult, at time.Time) {
	s.put(repositories.KeyMunicipalities(uf), areaList{UF: uf, UpdatedAt: at, Items: items})
}

// SetAbroadCities stores abroad city results keyed by TSE code.
func (s *MemoryStore) SetAbroadCities(items map[string]entities.AreaResult, at time.Time) {
	s.put(repositories.KeyAbroad, areaList{UpdatedAt: at, Items: items})
}

// Payload returns the serialized payload of key.
func (s *MemoryStore) Payload(key string) ([]byte, []byte, string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.payloads[key]
	return p.body, p.gz, p.etag, ok
}

func (s *MemoryStore) put(key string, v any) {
	// json.Marshal cannot fail for these types (no channels, funcs or NaN floats).
	body, _ := json.Marshal(v)
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	_, _ = zw.Write(body)
	_ = zw.Close()
	sum := sha256.Sum256(body)
	p := payload{body: body, gz: buf.Bytes(), etag: `"` + hex.EncodeToString(sum[:8]) + `"`}

	s.mu.Lock()
	s.payloads[key] = p
	s.mu.Unlock()
}
