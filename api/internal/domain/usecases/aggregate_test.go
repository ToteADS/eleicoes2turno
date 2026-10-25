package usecases

import (
	"testing"

	"eleicoes2turno/internal/domain/entities"
)

func TestSumResults(t *testing.T) {
	a := entities.AreaResult{Electorate: 10, Turnout: 8, Abstention: 2, Valid: 7, Blank: 1, Null: 0, Lula: 4, Flavio: 3,
		SectionsCounted: 1, SectionsTotal: 2, Date: "25/10/2026", Time: "17:10:00", Released: true}
	b := entities.AreaResult{Electorate: 5, Turnout: 4, Abstention: 1, Valid: 4, Lula: 1, Flavio: 3,
		SectionsCounted: 0, SectionsTotal: 1, Date: "25/10/2026", Time: "17:20:00"}
	got := SumResults(a, b)
	want := entities.AreaResult{Electorate: 15, Turnout: 12, Abstention: 3, Valid: 11, Blank: 1, Lula: 5, Flavio: 6,
		SectionsCounted: 1, SectionsTotal: 3, Date: "25/10/2026", Time: "17:20:00", Released: true}
	if got != want {
		t.Errorf("SumResults =\n%+v\nwant\n%+v", got, want)
	}
}

func TestSumResults_LatestAcrossDays(t *testing.T) {
	a := entities.AreaResult{Date: "24/10/2026", Time: "23:00:00"}
	b := entities.AreaResult{Date: "25/10/2026", Time: "01:00:00"}
	if got := SumResults(a, b); got.Date != "25/10/2026" || got.Time != "01:00:00" {
		t.Errorf("latest = %s %s", got.Date, got.Time)
	}
}

func TestSumResults_Empty(t *testing.T) {
	if got := SumResults(); got != (entities.AreaResult{}) {
		t.Errorf("SumResults() = %+v, want zero", got)
	}
}

func TestBuildCountries_Japan(t *testing.T) {
	cities := []entities.AbroadCity{
		{Code: "30627", ISO: 392}, {Code: "30198", ISO: 392}, {Code: "29742", ISO: 392}, {Code: "29955", ISO: 620},
	}
	byCode := map[string]entities.AreaResult{
		"30627": {Electorate: 30030, Lula: 1}, "30198": {Electorate: 44540, Lula: 2}, "29742": {Electorate: 13729, Lula: 3},
	}
	got := BuildCountries(cities, byCode)
	if got[392].Electorate != 88299 || got[392].Lula != 6 {
		t.Errorf("Japan = %+v", got[392])
	}
	if _, ok := got[620]; ok {
		t.Error("Portugal has no city result yet, should be absent")
	}
}
