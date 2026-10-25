// Package usecases holds the rules that turn TSE files into what we serve.
package usecases

import "eleicoes2turno/internal/domain/entities"

// SumResults adds areas together. The result is released when any part is,
// and carries the most recent TSE timestamp among the parts.
func SumResults(rs ...entities.AreaResult) entities.AreaResult {
	var out entities.AreaResult
	for _, r := range rs {
		out.Electorate += r.Electorate
		out.Turnout += r.Turnout
		out.Abstention += r.Abstention
		out.Valid += r.Valid
		out.Blank += r.Blank
		out.Null += r.Null
		out.Lula += r.Lula
		out.Flavio += r.Flavio
		out.SectionsCounted += r.SectionsCounted
		out.SectionsTotal += r.SectionsTotal
		out.Released = out.Released || r.Released
		if timestampKey(r.Date, r.Time) > timestampKey(out.Date, out.Time) {
			out.Date, out.Time = r.Date, r.Time
		}
	}
	return out
}

// timestampKey turns TSE "dd/mm/yyyy" + "hh:mm:ss" into a sortable string.
func timestampKey(date, clock string) string {
	if len(date) != 10 {
		return ""
	}
	return date[6:10] + date[3:5] + date[0:2] + clock
}

// BuildCountries groups abroad city results by country ISO code. Countries
// with no city result yet are left out.
func BuildCountries(cities []entities.AbroadCity, byCode map[string]entities.AreaResult) map[int]entities.AreaResult {
	grouped := map[int][]entities.AreaResult{}
	for _, c := range cities {
		if r, ok := byCode[c.Code]; ok {
			grouped[c.ISO] = append(grouped[c.ISO], r)
		}
	}
	out := make(map[int]entities.AreaResult, len(grouped))
	for iso, rs := range grouped {
		out[iso] = SumResults(rs...)
	}
	return out
}
