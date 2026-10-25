package middlewares

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var okHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })

func TestSecurityHeaders(t *testing.T) {
	rec := httptest.NewRecorder()
	SecurityHeaders(BuildCSP(false))(okHandler).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	h := rec.Header()
	if !strings.Contains(h.Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Errorf("CSP = %q", h.Get("Content-Security-Policy"))
	}
	if !strings.Contains(h.Get("Strict-Transport-Security"), "max-age=") {
		t.Error("missing HSTS")
	}
	if h.Get("X-Content-Type-Options") != "nosniff" || h.Get("Referrer-Policy") == "" || h.Get("Permissions-Policy") == "" {
		t.Errorf("headers = %v", h)
	}
}

func TestCSP_WithoutAdsense(t *testing.T) {
	csp := BuildCSP(false)
	if strings.Contains(csp, "googlesyndication") {
		t.Error("AdSense hosts must not be allowed when ads are off")
	}
	for _, want := range []string{"script-src 'self'", "worker-src 'self' blob:", "img-src 'self' data: blob: https://resultados.tse.jus.br"} {
		if !strings.Contains(csp, want) {
			t.Errorf("CSP missing %q: %s", want, csp)
		}
	}
}

func TestCSP_WithAdsense(t *testing.T) {
	csp := BuildCSP(true)
	if !strings.Contains(csp, "pagead2.googlesyndication.com") || !strings.Contains(csp, "frame-src") {
		t.Errorf("CSP = %s", csp)
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.9:5555"
	if got := ClientIP(r, false); got != "10.0.0.9" {
		t.Errorf("RemoteAddr ip = %s", got)
	}
	// the client can forge the left entries; the rightmost one is added by our proxy
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 203.0.113.7")
	if got := ClientIP(r, false); got != "203.0.113.7" {
		t.Errorf("XFF ip = %s, want rightmost", got)
	}
	r.Header.Set("CF-Connecting-IP", "198.51.100.4")
	if got := ClientIP(r, false); got != "203.0.113.7" {
		t.Errorf("CF header must be ignored without trust, got %s", got)
	}
	if got := ClientIP(r, true); got != "198.51.100.4" {
		t.Errorf("CF ip = %s", got)
	}
	r.Header.Del("CF-Connecting-IP")
	if got := ClientIP(r, true); got != "10.0.0.9" {
		t.Errorf("with Cloudflare trusted, XFF must be ignored; got %s", got)
	}
	r2 := httptest.NewRequest("GET", "/", nil)
	r2.RemoteAddr = "garbage"
	if got := ClientIP(r2, false); got != "garbage" {
		t.Errorf("unparseable RemoteAddr = %s", got)
	}
}

func TestRateLimit_429(t *testing.T) {
	h := NewRateLimiter(20, 40, false).Middleware(okHandler)
	var limited bool
	for i := 0; i < 41; i++ {
		r := httptest.NewRequest("GET", "/api/v1/summary", nil)
		r.RemoteAddr = "192.0.2.1:1000"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if rec.Code == http.StatusTooManyRequests {
			limited = true
			if rec.Header().Get("Retry-After") == "" {
				t.Error("429 without Retry-After")
			}
		}
	}
	if !limited {
		t.Error("expected at least one 429")
	}
	r := httptest.NewRequest("GET", "/api/v1/summary", nil)
	r.RemoteAddr = "192.0.2.2:1000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusOK {
		t.Errorf("other IP got %d", rec.Code)
	}
}

func TestRateLimit_Cleanup(t *testing.T) {
	rl := NewRateLimiter(1, 1, false)
	rl.limiter("203.0.113.1")
	rl.cleanup(0)
	if n := rl.size(); n != 0 {
		t.Errorf("visitors after cleanup = %d, want 0", n)
	}
}

func TestCORS(t *testing.T) {
	h := CORS("https://eleicoes2turno.tapp.solutions")(okHandler)
	r := httptest.NewRequest("GET", "/api/v1/summary", nil)
	r.Header.Set("Origin", "https://eleicoes2turno.tapp.solutions")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://eleicoes2turno.tapp.solutions" {
		t.Error("allowed origin not echoed")
	}
	r.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("foreign origin must not be allowed")
	}
	r = httptest.NewRequest("OPTIONS", "/api/v1/summary", nil)
	r.Header.Set("Origin", "https://eleicoes2turno.tapp.solutions")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	if rec.Code != http.StatusNoContent {
		t.Errorf("preflight = %d", rec.Code)
	}
}

func TestRateLimit_CapFailsOpen(t *testing.T) {
	rl := NewRateLimiter(1, 1, false)
	rl.maxVisitors = 2
	h := rl.Middleware(okHandler)
	for i, ip := range []string{"192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.3", "192.0.2.3"} {
		r := httptest.NewRequest("GET", "/", nil)
		r.RemoteAddr = ip + ":1"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, r)
		if i >= 2 && rec.Code != http.StatusOK {
			t.Errorf("request %d from new IP over the cap = %d, want fail-open 200", i, rec.Code)
		}
	}
	if n := rl.size(); n > 2 {
		t.Errorf("visitors = %d, want capped at 2", n)
	}
}
