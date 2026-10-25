package tse

import (
	"encoding/json"
	"fmt"

	"eleicoes2turno/internal/domain/entities"
)

type rawCatalog struct {
	Abr []struct {
		UF string `json:"cd"`
		Mu []struct {
			TSECode  string `json:"cd"`
			IBGECode string `json:"cdi"`
			Name     string `json:"nm"`
		} `json:"mu"`
	} `json:"abr"`
}

// ParseCatalog reads the municipality catalog (config/mun-e006258-cm.json).
func ParseCatalog(b []byte) ([]entities.Municipality, error) {
	var raw rawCatalog
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, fmt.Errorf("decode tse catalog: %w", err)
	}
	var out []entities.Municipality
	for _, abr := range raw.Abr {
		for _, m := range abr.Mu {
			out = append(out, entities.Municipality{UF: abr.UF, TSECode: m.TSECode, IBGECode: m.IBGECode, Name: m.Name})
		}
	}
	return out, nil
}
