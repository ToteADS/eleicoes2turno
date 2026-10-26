package tse

import (
	"os"
	"testing"
)

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return b
}

func TestParseResult_Zeroed(t *testing.T) {
	r, cands, err := ParseResult(readFixture(t, "br-zeroed.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Electorate != 158745502 {
		t.Errorf("Electorate = %d, want 158745502", r.Electorate)
	}
	if r.Lula != 0 || r.Flavio != 0 {
		t.Errorf("votes = %d/%d, want 0/0", r.Lula, r.Flavio)
	}
	if r.Released {
		t.Error("Released = true, want false for zeroed file")
	}
	if len(cands) != 2 {
		t.Fatalf("len(cands) = %d, want 2", len(cands))
	}
	want := map[int]string{13: "280002542548", 22: "280002551544"}
	for _, c := range cands {
		if want[c.Number] != c.Sqcand {
			t.Errorf("candidate %d sqcand = %s, want %s", c.Number, c.Sqcand, want[c.Number])
		}
	}
}

func TestParseResult_Released(t *testing.T) {
	r, _, err := ParseResult(readFixture(t, "released-sample.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Lula != 600 || r.Flavio != 400 {
		t.Errorf("votes = %d/%d, want 600/400", r.Lula, r.Flavio)
	}
	if !r.Released {
		t.Error("Released = false, want true")
	}
	if r.SectionsCounted != 10 || r.SectionsTotal != 20 {
		t.Errorf("sections = %d/%d, want 10/20", r.SectionsCounted, r.SectionsTotal)
	}
	if r.Valid != 1000 || r.Blank != 40 || r.Null != 60 || r.Turnout != 1100 || r.Abstention != 100 {
		t.Errorf("totals wrong: %+v", r)
	}
	if r.Date != "25/10/2026" || r.Time != "17:30:00" {
		t.Errorf("timestamp = %s %s", r.Date, r.Time)
	}
}

func TestParseResult_Municipality(t *testing.T) {
	r, _, err := ParseResult(readFixture(t, "mun-ba-abare.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Electorate <= 0 {
		t.Errorf("Electorate = %d, want > 0", r.Electorate)
	}
}

func TestParseResult_Invalid(t *testing.T) {
	if _, _, err := ParseResult([]byte("{")); err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestParseResult_BadNumber(t *testing.T) {
	if _, _, err := ParseResult([]byte(`{"e":{"te":"abc"}}`)); err == nil {
		t.Error("expected error for non-numeric field")
	}
}

func TestParseResult_Elected(t *testing.T) {
	r, cands, err := ParseResult(readFixture(t, "br-elected.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.Final {
		t.Error("Final = false, want true for tf=s")
	}
	got := map[int]bool{}
	for _, c := range cands {
		got[c.Number] = c.Elected
		if c.Number == 13 && c.Status != "Eleito" {
			t.Errorf("Lula status = %q, want Eleito", c.Status)
		}
		if c.Number == 22 && c.Status != "" {
			t.Errorf("Flavio status = %q, want empty", c.Status)
		}
	}
	if !got[13] || got[22] {
		t.Errorf("elected = %v, want only 13", got)
	}
}

func TestParseResult_NotElectedBeforeDeclaration(t *testing.T) {
	r, cands, err := ParseResult(readFixture(t, "released-sample.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Final {
		t.Error("Final = true, want false for tf=n")
	}
	for _, c := range cands {
		if c.Elected {
			t.Errorf("candidate %d elected before the TSE flag", c.Number)
		}
	}
}

func TestParseResult_MathDefined(t *testing.T) {
	// real BR file of 25/10/2026 22:10: "md": "e", nobody flagged "e": "s" yet
	r, cands, err := ParseResult(readFixture(t, "br-math-defined.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !r.MathDefined {
		t.Error("MathDefined = false, want true for md=e")
	}
	if r.Final {
		t.Error("Final = true, want false for tf=n")
	}
	if r.Lula != 64242718 || r.Flavio != 59819188 {
		t.Errorf("votes = %d/%d, want 64242718/59819188", r.Lula, r.Flavio)
	}
	for _, c := range cands {
		if c.Elected {
			t.Errorf("candidate %d elected without the TSE flag", c.Number)
		}
	}
}

func TestParseResult_NotMathDefined(t *testing.T) {
	for _, name := range []string{"released-sample.json", "br-zeroed.json"} {
		r, _, err := ParseResult(readFixture(t, name))
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", name, err)
		}
		if r.MathDefined {
			t.Errorf("%s: MathDefined = true, want false", name)
		}
	}
	for _, md := range []string{`""`, `"n"`, `"s"`} {
		r, _, err := ParseResult([]byte(`{"md":` + md + `}`))
		if err != nil {
			t.Fatalf("md=%s: unexpected error: %v", md, err)
		}
		if r.MathDefined {
			t.Errorf("md=%s: MathDefined = true, want false", md)
		}
	}
}
