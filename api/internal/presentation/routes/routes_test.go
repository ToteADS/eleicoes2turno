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
	"eleicoes2turno/internal/infra/notice"
	"eleicoes2turno/internal/infra/presence"
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
	tracker := presence.NewMemoryTracker(150*time.Second, 1000)
	return New(Deps{Config: cfg, Store: store, Presence: tracker, Notice: notice.NewMemoryStore()}), store
}

func get(h http.Handler, path string) *httptest.ResponseRecorder {
	return do(h, "GET", path, "")
}

func do(h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
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
	for i := 0; i < 100; i++ {
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

func TestRoutes_Presence(t *testing.T) {
	h, _ := newRouter(t, config.Config{})
	do(h, "POST", "/api/v1/presence", `{"id":"tab-one-0001"}`)
	rec := do(h, "POST", "/api/v1/presence", `{"id":"tab-two-0002"}`)
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"online":2}` {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	if rec.Header().Get("Cache-Control") != "no-store" || rec.Header().Get("Content-Security-Policy") == "" {
		t.Errorf("headers = %v", rec.Header())
	}
	if rec := do(h, "POST", "/api/v1/presence", `{"id":"bad id"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("invalid id = %d", rec.Code)
	}
	for _, method := range []string{"GET", "PUT", "DELETE"} {
		if rec := do(h, method, "/api/v1/presence", ""); rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "POST" {
			t.Errorf("%s = %d (Allow %q), want 405", method, rec.Code, rec.Header().Get("Allow"))
		}
	}
}

func TestRoutes_PresenceIsRateLimited(t *testing.T) {
	h, _ := newRouter(t, config.Config{})
	limited := false
	for i := 0; i < 100 && !limited; i++ {
		limited = do(h, "POST", "/api/v1/presence", `{"id":"tab-one-0001"}`).Code == http.StatusTooManyRequests
	}
	if !limited {
		t.Error("presence is not rate limited")
	}
}

func doAuth(h http.Handler, method, path, body, auth string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "192.0.2.11:1234"
	if auth != "" {
		r.Header.Set("Authorization", auth)
	}
	h.ServeHTTP(rec, r)
	return rec
}

func TestRoutes_Notice(t *testing.T) {
	h, _ := newRouter(t, config.Config{NoticeAdminToken: "tok-123"})
	if rec := get(h, "/api/v1/notice"); rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"notice":null}` {
		t.Fatalf("get = %d %s", rec.Code, rec.Body)
	}
	if rec := doAuth(h, "PUT", "/api/v1/notice", `{"title":"Aviso"}`, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("put without token = %d", rec.Code)
	}
	if rec := doAuth(h, "PUT", "/api/v1/notice", `{"title":"Aviso"}`, "Bearer tok-123"); rec.Code != http.StatusOK {
		t.Fatalf("put = %d %s", rec.Code, rec.Body)
	}
	if rec := get(h, "/api/v1/notice"); !strings.Contains(rec.Body.String(), `"title":"Aviso"`) || rec.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("get after put = %s", rec.Body)
	}
	if rec := doAuth(h, "DELETE", "/api/v1/notice", "", "Bearer tok-123"); rec.Code != http.StatusOK {
		t.Errorf("delete = %d", rec.Code)
	}
	for _, m := range []string{"POST", "PATCH"} {
		if rec := do(h, m, "/api/v1/notice", ""); rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "GET, PUT, DELETE" {
			t.Errorf("%s = %d", m, rec.Code)
		}
	}
}

func TestRoutes_NoticeWritesDisabledWithoutToken(t *testing.T) {
	h, _ := newRouter(t, config.Config{})
	if rec := doAuth(h, "PUT", "/api/v1/notice", `{"title":"Aviso"}`, "Bearer "); rec.Code != http.StatusNotFound {
		t.Errorf("put = %d", rec.Code)
	}
}
