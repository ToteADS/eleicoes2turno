package routes

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/infra/cache"
	"eleicoes2turno/pkg/config"
)

func newRouter(t *testing.T, cfg config.Config) (http.Handler, *cache.MemoryStore) {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>app</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg.StaticDir = dir
	store := cache.NewMemoryStore()
	return New(Deps{Config: cfg, Store: store}), store
}

func get(h http.Handler, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest("GET", path, nil)
	r.RemoteAddr = "192.0.2.10:1234"
	h.ServeHTTP(rec, r)
	return rec
}

func TestRoutes(t *testing.T) {
	h, store := newRouter(t, config.Config{AllowedOrigin: "https://eleicoes2turno.tapp.solutions"})
	store.SetSummary(entities.Snapshot{UpdatedAt: time.Now()})

	cases := map[string]int{
		"/healthz":                     http.StatusOK,
		"/api/v1/summary":              http.StatusOK,
		"/api/v1/abroad/cities":        http.StatusServiceUnavailable,
		"/api/v1/uf/ba/municipalities": http.StatusServiceUnavailable,
		"/api/v1/uf/BA/municipalities": http.StatusNotFound,
		"/api/v1/config":               http.StatusOK,
		"/ads.txt":                     http.StatusNotFound,
		"/":                            http.StatusOK,
		"/api/v1/nope":                 http.StatusNotFound,
	}
	for path, want := range cases {
		rec := get(h, path)
		if rec.Code != want {
			t.Errorf("%s = %d, want %d", path, rec.Code, want)
		}
		if !strings.Contains(rec.Header().Get("Content-Security-Policy"), "default-src 'self'") {
			t.Errorf("%s missing CSP", path)
		}
	}
}

func TestRoutes_AdsenseEnabled(t *testing.T) {
	h, _ := newRouter(t, config.Config{AdsenseClient: "ca-pub-9424129340132469"})
	rec := get(h, "/ads.txt")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Header().Get("Content-Security-Policy"), "googlesyndication") {
		t.Errorf("ads.txt = %d, csp = %s", rec.Code, rec.Header().Get("Content-Security-Policy"))
	}
}

func TestRoutes_RateLimitOnlyOnAPI(t *testing.T) {
	h, _ := newRouter(t, config.Config{})
	var apiLimited, staticLimited bool
	for i := 0; i < 60; i++ {
		if get(h, "/api/v1/config").Code == http.StatusTooManyRequests {
			apiLimited = true
		}
		if get(h, "/").Code == http.StatusTooManyRequests {
			staticLimited = true
		}
	}
	if !apiLimited || staticLimited {
		t.Errorf("apiLimited=%v staticLimited=%v", apiLimited, staticLimited)
	}
}
