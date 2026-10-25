package assets

import "testing"

func TestAbroadCities(t *testing.T) {
	cities, err := AbroadCities()
	if err != nil {
		t.Fatal(err)
	}
	if len(cities) != 186 {
		t.Fatalf("len = %d, want 186", len(cities))
	}
	japan := 0
	for _, c := range cities {
		if c.ISO == 392 {
			japan++
		}
	}
	if japan != 3 {
		t.Errorf("Japan cities = %d, want 3", japan)
	}
}

func TestParseAbroadCities_Invalid(t *testing.T) {
	if _, err := parseAbroadCities([]byte("x")); err == nil {
		t.Error("expected error")
	}
}

func TestFallbackCatalog(t *testing.T) {
	b := FallbackCatalog()
	if len(b) < 100000 {
		t.Fatalf("fallback catalog too small: %d bytes", len(b))
	}
}
