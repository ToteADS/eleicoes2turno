// Package assets embeds static data built by data/build_abroad.py.
package assets

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"eleicoes2turno/internal/domain/entities"
)

//go:embed abroad-cities.json
var abroadCitiesJSON []byte

// catalog-fallback.json is a snapshot of the TSE municipality catalog
// (config/mun-e006258-cm.json), used when the TSE is unreachable at boot.
//
//go:embed catalog-fallback.json
var catalogFallbackJSON []byte

// FallbackCatalog returns the bundled TSE municipality catalog.
func FallbackCatalog() []byte { return catalogFallbackJSON }

// AbroadCities returns the abroad city -> country table.
func AbroadCities() ([]entities.AbroadCity, error) { return parseAbroadCities(abroadCitiesJSON) }

func parseAbroadCities(b []byte) ([]entities.AbroadCity, error) {
	var cities []entities.AbroadCity
	if err := json.Unmarshal(b, &cities); err != nil {
		return nil, fmt.Errorf("decode abroad cities: %w", err)
	}
	return cities, nil
}
