package middlewares

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ClientIP returns the visitor IP. Behind Cloudflare (trustCloudflare) it is
// CF-Connecting-IP; otherwise the first X-Forwarded-For hop set by the
// Coolify proxy; otherwise the connection address.
func ClientIP(r *http.Request, trustCloudflare bool) string {
	if trustCloudflare {
		if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); ip != "" {
			return ip
		}
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// RateLimiter is a per-IP token bucket.
type RateLimiter struct {
	rps             rate.Limit
	burst           int
	trustCloudflare bool
	mu              sync.Mutex
	visitors        map[string]*visitor
}

// NewRateLimiter allows rps requests per second per IP with the given burst.
func NewRateLimiter(rps float64, burst int, trustCloudflare bool) *RateLimiter {
	return &RateLimiter{rps: rate.Limit(rps), burst: burst, trustCloudflare: trustCloudflare, visitors: map[string]*visitor{}}
}

func (rl *RateLimiter) limiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	v, ok := rl.visitors[ip]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(rl.rps, rl.burst)}
		rl.visitors[ip] = v
	}
	v.lastSeen = time.Now()
	return v.limiter
}

// cleanup forgets visitors idle for longer than idle.
func (rl *RateLimiter) cleanup(idle time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for ip, v := range rl.visitors {
		if time.Since(v.lastSeen) >= idle {
			delete(rl.visitors, ip)
		}
	}
}

func (rl *RateLimiter) size() int {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return len(rl.visitors)
}

// StartCleanup removes idle visitors every interval until stop is closed.
func (rl *RateLimiter) StartCleanup(interval time.Duration, stop <-chan struct{}) {
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				rl.cleanup(3 * interval)
			}
		}
	}()
}

// Middleware rejects requests over the limit with 429.
func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.limiter(ClientIP(r, rl.trustCloudflare)).Allow() {
			w.Header().Set("Retry-After", "1")
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
