// Package repositories declares the contracts the domain depends on.
package repositories

import (
	"time"

	"eleicoes2turno/internal/domain/entities"
)

// Payload keys understood by ResultStore.
const (
	KeySummary = "summary"
	KeyAbroad  = "abroad"
)

// KeyMunicipalities returns the payload key of one state's municipalities.
func KeyMunicipalities(uf string) string { return "mun:" + uf }

// ResultStore keeps the latest results, ready to be served.
type ResultStore interface {
	SetSummary(s entities.Snapshot)
	SetMunicipalities(uf string, items map[string]entities.AreaResult, at time.Time)
	SetAbroadCities(items map[string]entities.AreaResult, at time.Time)
	// Payload returns the JSON body, its gzip form and an ETag.
	Payload(key string) (body []byte, gz []byte, etag string, ok bool)
}
