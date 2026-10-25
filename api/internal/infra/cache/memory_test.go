package cache

import (
	"bytes"
	"compress/gzip"
	"io"
	"testing"
	"time"

	"eleicoes2turno/internal/domain/entities"
)

func TestMemoryStore_PayloadETagChanges(t *testing.T) {
	s := NewMemoryStore()
	if _, _, _, ok := s.Payload("summary"); ok {
		t.Fatal("empty store should not have a summary")
	}

	at := time.Date(2026, 10, 25, 20, 0, 0, 0, time.UTC)
	s.SetSummary(entities.Snapshot{UpdatedAt: at, BR: entities.AreaResult{Lula: 1}})
	body1, gz1, etag1, ok := s.Payload("summary")
	if !ok || len(body1) == 0 || etag1 == "" {
		t.Fatal("summary payload missing")
	}

	s.SetSummary(entities.Snapshot{UpdatedAt: at, BR: entities.AreaResult{Lula: 1}})
	if _, _, etag, _ := s.Payload("summary"); etag != etag1 {
		t.Error("same data must keep the same etag")
	}

	s.SetSummary(entities.Snapshot{UpdatedAt: at, BR: entities.AreaResult{Lula: 2}})
	if _, _, etag, _ := s.Payload("summary"); etag == etag1 {
		t.Error("different data must change the etag")
	}

	zr, err := gzip.NewReader(bytes.NewReader(gz1))
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := io.ReadAll(zr)
	if !bytes.Equal(plain, body1) {
		t.Error("gzip payload does not decompress to body")
	}
}

func TestMemoryStore_MunicipalitiesAndAbroad(t *testing.T) {
	s := NewMemoryStore()
	at := time.Now()
	s.SetMunicipalities("ba", map[string]entities.AreaResult{"2900207": {Electorate: 10}}, at)
	body, _, _, ok := s.Payload("mun:ba")
	if !ok || !bytes.Contains(body, []byte(`"uf":"ba"`)) || !bytes.Contains(body, []byte(`"2900207"`)) {
		t.Errorf("mun:ba payload = %s", body)
	}
	s.SetAbroadCities(map[string]entities.AreaResult{"30627": {Electorate: 5}}, at)
	body, _, _, ok = s.Payload("abroad")
	if !ok || !bytes.Contains(body, []byte(`"30627"`)) {
		t.Errorf("abroad payload = %s", body)
	}
}
