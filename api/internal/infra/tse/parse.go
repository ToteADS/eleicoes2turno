// Package tse reads the public result files of the TSE (resultados.tse.jus.br).
package tse

import (
	"encoding/json"
	"fmt"
	"strconv"

	"eleicoes2turno/internal/domain/entities"
)

// TSE publishes every number as a string.
type rawResult struct {
	Date string `json:"dg"`
	Time string `json:"hg"`
	// Final is "s" once the TSE finished the count (totalização finalizada).
	Final string `json:"tf"`
	S     struct {
		Counted string `json:"st"`
		Total   string `json:"ts"`
	} `json:"s"`
	E struct {
		Electorate string `json:"te"`
		Turnout    string `json:"c"`
		Abstention string `json:"a"`
	} `json:"e"`
	V struct {
		Valid string `json:"vv"`
		Blank string `json:"vb"`
		Null  string `json:"tvn"`
	} `json:"v"`
	Carg []struct {
		Agr []struct {
			Par []struct {
				Party string `json:"sg"`
				Cand  []struct {
					Number string `json:"n"`
					Sqcand string `json:"sqcand"`
					Name   string `json:"nmu"`
					Votes  string `json:"vap"`
					// Elected is "s" once the TSE declares the candidate elected.
					Elected string `json:"e"`
					Status  string `json:"st"`
				} `json:"cand"`
			} `json:"par"`
		} `json:"agr"`
	} `json:"carg"`
}

// ParseResult converts a TSE "-u" result file into an AreaResult and the
// candidates it lists.
func ParseResult(b []byte) (entities.AreaResult, []entities.Candidate, error) {
	var raw rawResult
	if err := json.Unmarshal(b, &raw); err != nil {
		return entities.AreaResult{}, nil, fmt.Errorf("decode tse result: %w", err)
	}

	r := entities.AreaResult{Date: raw.Date, Time: raw.Time, Final: raw.Final == "s"}
	fields := []struct {
		dst *int64
		src string
	}{
		{&r.SectionsCounted, raw.S.Counted}, {&r.SectionsTotal, raw.S.Total},
		{&r.Electorate, raw.E.Electorate}, {&r.Turnout, raw.E.Turnout}, {&r.Abstention, raw.E.Abstention},
		{&r.Valid, raw.V.Valid}, {&r.Blank, raw.V.Blank}, {&r.Null, raw.V.Null},
	}
	for _, f := range fields {
		n, err := parseInt(f.src)
		if err != nil {
			return entities.AreaResult{}, nil, err
		}
		*f.dst = n
	}

	var cands []entities.Candidate
	for _, carg := range raw.Carg {
		for _, agr := range carg.Agr {
			for _, par := range agr.Par {
				for _, c := range par.Cand {
					num, err := strconv.Atoi(c.Number)
					if err != nil {
						return entities.AreaResult{}, nil, fmt.Errorf("candidate number %q: %w", c.Number, err)
					}
					votes, err := parseInt(c.Votes)
					if err != nil {
						return entities.AreaResult{}, nil, err
					}
					switch num {
					case entities.NumberLula:
						r.Lula = votes
					case entities.NumberFlavio:
						r.Flavio = votes
					}
					cands = append(cands, entities.Candidate{
						Number: num, Name: c.Name, Party: par.Party, Sqcand: c.Sqcand,
						Elected: c.Elected == "s", Status: c.Status,
					})
				}
			}
		}
	}
	r.Released = r.SectionsCounted > 0
	return r, cands, nil
}

func parseInt(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("tse number %q: %w", s, err)
	}
	return n, nil
}
