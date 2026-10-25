// Package middlewares holds the HTTP middlewares: security headers, rate
// limiting and CORS.
package middlewares

import (
	"net/http"
	"strings"
)

// BuildCSP returns the Content-Security-Policy. MapLibre needs blob: workers
// and inline styles; candidate photos come from the TSE. AdSense hosts are
// allowed only when ads are on.
func BuildCSP(adsense bool) string {
	script := []string{"'self'"}
	img := []string{"'self'", "data:", "blob:", "https://resultados.tse.jus.br"}
	connect := []string{"'self'"}
	frame := []string{}
	if adsense {
		// AdSense injects inline bootstrap scripts and serves creatives from many Google hosts.
		google := []string{"https://pagead2.googlesyndication.com", "https://*.googlesyndication.com",
			"https://*.doubleclick.net", "https://*.google.com", "https://*.gstatic.com", "https://*.adtrafficquality.google"}
		script = append(append(script, "'unsafe-inline'"), google...)
		img = append(img, "https:")
		connect = append(connect, google...)
		frame = append(frame, google...)
	}
	parts := []string{
		"default-src 'self'",
		"script-src " + strings.Join(script, " "),
		"style-src 'self' 'unsafe-inline'",
		"img-src " + strings.Join(img, " "),
		"font-src 'self'",
		"connect-src " + strings.Join(connect, " "),
		"worker-src 'self' blob:",
		"child-src blob:",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	}
	if len(frame) > 0 {
		parts = append(parts, "frame-src "+strings.Join(frame, " "))
	}
	return strings.Join(parts, "; ")
}

// SecurityHeaders sets the hardening headers on every response.
func SecurityHeaders(csp string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("Content-Security-Policy", csp)
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
			next.ServeHTTP(w, r)
		})
	}
}
