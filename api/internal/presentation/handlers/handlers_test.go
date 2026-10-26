package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"

	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/infra/cache"
)

func serve(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func TestSummary_NotReady(t *testing.T) {
	d := NewData(cache.NewMemoryStore())
	rec := serve(http.HandlerFunc(d.Summary), httptest.NewRequest("GET", "/api/v1/summary", nil))
	if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "not_ready") {
		t.Errorf("code=%d body=%s", rec.Code, rec.Body)
	}
}

func TestSummary_ETag304(t *testing.T) {
	store := cache.NewMemoryStore()
	store.SetSummary(entities.Snapshot{UpdatedAt: time.Now(), BR: entities.AreaResult{Lula: 1}})
	d := NewData(store)
	rec := serve(http.HandlerFunc(d.Summary), httptest.NewRequest("GET", "/api/v1/summary", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("code = %d", rec.Code)
	}
	if !strings.Contains(rec.Header().Get("Cache-Control"), "s-maxage=30") || rec.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Errorf("headers = %v", rec.Header())
	}
	etag := rec.Header().Get("ETag")
	r := httptest.NewRequest("GET", "/api/v1/summary", nil)
	r.Header.Set("If-None-Match", etag)
	if rec := serve(http.HandlerFunc(d.Summary), r); rec.Code != http.StatusNotModified || rec.Body.Len() != 0 {
		t.Errorf("conditional code = %d", rec.Code)
	}
}

func TestSummary_Gzip(t *testing.T) {
	store := cache.NewMemoryStore()
	store.SetSummary(entities.Snapshot{UpdatedAt: time.Now()})
	r := httptest.NewRequest("GET", "/api/v1/summary", nil)
	r.Header.Set("Accept-Encoding", "br, gzip")
	rec := serve(http.HandlerFunc(NewData(store).Summary), r)
	if rec.Header().Get("Content-Encoding") != "gzip" || rec.Header().Get("Vary") != "Accept-Encoding" {
		t.Errorf("headers = %v", rec.Header())
	}
}

func TestMunicipalities(t *testing.T) {
	store := cache.NewMemoryStore()
	d := NewData(store)
	router := mux.NewRouter()
	router.HandleFunc("/api/v1/uf/{uf}/municipalities", d.Municipalities)

	if rec := serve(router, httptest.NewRequest("GET", "/api/v1/uf/xx/municipalities", nil)); rec.Code != http.StatusNotFound {
		t.Errorf("unknown uf = %d", rec.Code)
	}
	if rec := serve(router, httptest.NewRequest("GET", "/api/v1/uf/ba/municipalities", nil)); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("not swept = %d", rec.Code)
	}
	store.SetMunicipalities("ba", map[string]entities.AreaResult{"2900207": {}}, time.Now())
	if rec := serve(router, httptest.NewRequest("GET", "/api/v1/uf/ba/municipalities", nil)); rec.Code != http.StatusOK {
		t.Errorf("swept = %d", rec.Code)
	}
}

func TestAbroadCities(t *testing.T) {
	store := cache.NewMemoryStore()
	store.SetAbroadCities(map[string]entities.AreaResult{"30627": {}}, time.Now())
	rec := serve(http.HandlerFunc(NewData(store).AbroadCities), httptest.NewRequest("GET", "/api/v1/abroad/cities", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "30627") {
		t.Errorf("code=%d body=%s", rec.Code, rec.Body)
	}
}

func TestConfig(t *testing.T) {
	h := NewPublicConfig(AdsConfig{AdsenseClient: "ca-pub-9424129340132469", SlotResults: "1", SlotMobile: "2",
		HouseImage: "/ads/tapp-banner-v2.svg", HouseLink: "https://tapp.solutions", HouseAlt: "Tapp Solutions"})
	rec := serve(h, httptest.NewRequest("GET", "/api/v1/config", nil))
	var got struct {
		Ads struct {
			AdsenseClient string `json:"adsenseClient"`
			House         struct {
				Link string `json:"link"`
			} `json:"house"`
		} `json:"ads"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Ads.AdsenseClient != "ca-pub-9424129340132469" || got.Ads.House.Link != "https://tapp.solutions" {
		t.Errorf("config = %+v", got)
	}
}

func TestAdsTxt(t *testing.T) {
	rec := serve(AdsTxt("ca-pub-9424129340132469"), httptest.NewRequest("GET", "/ads.txt", nil))
	if strings.TrimSpace(rec.Body.String()) != "google.com, pub-9424129340132469, DIRECT, f08c47fec0942fa0" {
		t.Errorf("ads.txt = %q", rec.Body)
	}
	if rec := serve(AdsTxt(""), httptest.NewRequest("GET", "/ads.txt", nil)); rec.Code != http.StatusNotFound {
		t.Errorf("empty client = %d", rec.Code)
	}
}

func TestHealth(t *testing.T) {
	rec := serve(http.HandlerFunc(Health), httptest.NewRequest("GET", "/healthz", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Errorf("health = %d %q", rec.Code, rec.Body)
	}
}

func TestStatic(t *testing.T) {
	dir := t.TempDir()
	must := func(err error) {
		if err != nil {
			t.Fatal(err)
		}
	}
	must(os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>app</html>"), 0o644))
	must(os.MkdirAll(filepath.Join(dir, "assets"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "assets", "main-abc123.js"), []byte("js"), 0o644))
	must(os.MkdirAll(filepath.Join(dir, "geo", "mun"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "geo", "states.json"), []byte("{}"), 0o644))
	must(os.MkdirAll(filepath.Join(dir, "ads"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "ads", "banner.svg"), []byte("<svg/>"), 0o644))
	must(os.MkdirAll(filepath.Join(dir, "brand"), 0o755))
	must(os.WriteFile(filepath.Join(dir, "brand", "logo.webp"), []byte("img"), 0o644))
	h := Static(dir)

	rec := serve(h, httptest.NewRequest("GET", "/assets/main-abc123.js", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Errorf("asset = %d %v", rec.Code, rec.Header())
	}
	rec = serve(h, httptest.NewRequest("GET", "/geo/states.json", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Cache-Control"), "max-age=86400") {
		t.Errorf("geo = %d %v", rec.Code, rec.Header())
	}
	// Ads and brand images are not fingerprinted: keep them short-lived so a
	// swap reaches every visitor within minutes.
	for _, p := range []string{"/ads/banner.svg", "/brand/logo.webp"} {
		rec = serve(h, httptest.NewRequest("GET", p, nil))
		if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "public, max-age=300" {
			t.Errorf("%s = %d %v", p, rec.Code, rec.Header())
		}
	}
	rec = serve(h, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "app") || !strings.Contains(rec.Header().Get("Cache-Control"), "no-cache") {
		t.Errorf("index = %d %v", rec.Code, rec.Header())
	}
	rec = serve(h, httptest.NewRequest("GET", "/some/route", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "app") {
		t.Errorf("spa fallback = %d", rec.Code)
	}
	if rec := serve(h, httptest.NewRequest("GET", "/geo/missing.json", nil)); rec.Code != http.StatusNotFound {
		t.Errorf("missing file = %d", rec.Code)
	}
	if rec := serve(h, httptest.NewRequest("GET", "/geo/mun/", nil)); rec.Code != http.StatusNotFound {
		t.Errorf("directory listing must be off, got %d", rec.Code)
	}
	if rec := serve(h, httptest.NewRequest("GET", "/../../etc/passwd", nil)); rec.Code == http.StatusOK && strings.Contains(rec.Body.String(), "root:") {
		t.Error("path traversal")
	}
}

func TestSummary_ElectedJSON(t *testing.T) {
	store := cache.NewMemoryStore()
	store.SetSummary(entities.Snapshot{
		UpdatedAt: time.Now(),
		BR:        entities.AreaResult{Final: true},
		Candidates: []entities.Candidate{
			{Number: 13, Name: "LULA", Elected: true, Status: "Eleito"},
			{Number: 22, Name: "FLAVIO BOLSONARO"},
		},
	})
	rec := serve(http.HandlerFunc(NewData(store).Summary), httptest.NewRequest("GET", "/api/v1/summary", nil))
	var body struct {
		BR struct {
			Final bool `json:"final"`
		} `json:"br"`
		Candidates []struct {
			N       int    `json:"n"`
			Elected *bool  `json:"elected"`
			Status  string `json:"status"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v (%s)", err, rec.Body)
	}
	if !body.BR.Final || len(body.Candidates) != 2 {
		t.Fatalf("body = %s", rec.Body)
	}
	c0, c1 := body.Candidates[0], body.Candidates[1]
	if c0.Elected == nil || !*c0.Elected || c0.Status != "Eleito" {
		t.Errorf("lula = %+v", c0)
	}
	if c1.Elected == nil || *c1.Elected {
		t.Errorf("flavio elected must be present and false: %s", rec.Body)
	}
}

func TestSummary_MathDefinedJSON(t *testing.T) {
	for _, md := range []bool{true, false} {
		store := cache.NewMemoryStore()
		store.SetSummary(entities.Snapshot{UpdatedAt: time.Now(), BR: entities.AreaResult{MathDefined: md}})
		rec := serve(http.HandlerFunc(NewData(store).Summary), httptest.NewRequest("GET", "/api/v1/summary", nil))
		var body struct {
			BR map[string]any `json:"br"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode: %v (%s)", err, rec.Body)
		}
		got, present := body.BR["mathDefined"]
		if md && got != true {
			t.Errorf("mathDefined = %v, want true: %s", got, rec.Body)
		}
		if !md && present {
			t.Errorf("mathDefined must be omitted while false: %s", rec.Body)
		}
	}
}
