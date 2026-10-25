package tse

import "testing"

func TestParseCatalog(t *testing.T) {
	list, err := ParseCatalog(readFixture(t, "mun-cm-sample.json"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 4 {
		t.Fatalf("len = %d, want 4", len(list))
	}
	first := list[0]
	if first.UF != "ba" || first.TSECode != "33030" || first.IBGECode != "2900207" || first.Name != "ABARÉ" {
		t.Errorf("first = %+v", first)
	}
	var abroad int
	for _, m := range list {
		if m.UF == "zz" {
			abroad++
			if m.IBGECode != "" {
				t.Errorf("abroad entry has IBGE code: %+v", m)
			}
		}
	}
	if abroad != 2 {
		t.Errorf("abroad entries = %d, want 2", abroad)
	}
}

func TestParseCatalog_Invalid(t *testing.T) {
	if _, err := ParseCatalog([]byte("[")); err == nil {
		t.Error("expected error for invalid JSON")
	}
}
