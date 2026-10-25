package tse

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClient_ConditionalGet(t *testing.T) {
	const lastMod = "Sun, 25 Oct 2026 20:00:00 GMT"
	var conditional int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/oficial/x.json" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("If-Modified-Since") == lastMod {
			conditional++
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Last-Modified", lastMod)
		_, _ = w.Write([]byte(`{"v":1}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL+"/oficial", 5*time.Second)
	body, notModified, err := c.Fetch(context.Background(), "x.json")
	if err != nil || notModified || string(body) != `{"v":1}` {
		t.Fatalf("first fetch = %q, %v, %v", body, notModified, err)
	}
	body, notModified, err = c.Fetch(context.Background(), "x.json")
	if err != nil || !notModified || string(body) != `{"v":1}` {
		t.Fatalf("second fetch = %q, %v, %v", body, notModified, err)
	}
	if conditional != 1 {
		t.Errorf("conditional requests = %d, want 1", conditional)
	}
}

func TestClient_ErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	c := NewClient(srv.URL, time.Second)
	if _, _, err := c.Fetch(context.Background(), "x.json"); err == nil {
		t.Error("expected error on 503")
	}
}

func TestClient_NetworkError(t *testing.T) {
	c := NewClient("http://127.0.0.1:1", 200*time.Millisecond)
	if _, _, err := c.Fetch(context.Background(), "x.json"); err == nil {
		t.Error("expected network error")
	}
}

func TestClient_BadURL(t *testing.T) {
	c := NewClient("http://bad host", time.Second)
	if _, _, err := c.Fetch(context.Background(), "x.json"); err == nil {
		t.Error("expected request build error")
	}
}

func TestClient_BacksOffAfter429(t *testing.T) {
	var hits int
	throttled := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if throttled {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{"v":1}`))
	}))
	defer srv.Close()

	now := time.Date(2026, 10, 25, 15, 0, 0, 0, time.UTC)
	c := NewClient(srv.URL, 5*time.Second)
	c.now = func() time.Time { return now }

	if _, _, err := c.Fetch(context.Background(), "a.json"); err == nil {
		t.Fatal("429 must be an error")
	}
	// during the cooldown nothing reaches the TSE, for any path
	for _, p := range []string{"a.json", "b.json"} {
		if _, _, err := c.Fetch(context.Background(), p); err == nil {
			t.Fatalf("%s: want an error during the cooldown", p)
		}
	}
	if hits != 1 {
		t.Fatalf("hits during cooldown = %d, want 1", hits)
	}

	// still throttled after the first cooldown: the next one is longer
	now = now.Add(time.Minute + time.Second)
	_, _, _ = c.Fetch(context.Background(), "a.json")
	now = now.Add(time.Minute + time.Second)
	_, _, _ = c.Fetch(context.Background(), "a.json")
	if hits != 2 {
		t.Fatalf("hits = %d, want the second cooldown to be longer than a minute", hits)
	}

	throttled = false
	now = now.Add(2 * time.Minute)
	if body, _, err := c.Fetch(context.Background(), "a.json"); err != nil || string(body) != `{"v":1}` {
		t.Fatalf("after cooldown = %q, %v", body, err)
	}
}

func TestClient_HonorsRetryAfter(t *testing.T) {
	var hits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Retry-After", "300")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	now := time.Date(2026, 10, 25, 15, 0, 0, 0, time.UTC)
	c := NewClient(srv.URL, 5*time.Second)
	c.now = func() time.Time { return now }
	_, _, _ = c.Fetch(context.Background(), "a.json")
	now = now.Add(4 * time.Minute)
	_, _, _ = c.Fetch(context.Background(), "a.json")
	if hits != 1 {
		t.Errorf("hits = %d, want Retry-After (300s) honored", hits)
	}
}

func TestClient_ConcurrentThrottlesCountOnce(t *testing.T) {
	now := time.Date(2026, 10, 25, 15, 0, 0, 0, time.UTC)
	c := NewClient("http://tse.invalid", time.Second)
	c.now = func() time.Time { return now }
	for i := 0; i < 8; i++ { // eight in-flight requests answered 429 together
		c.backOff("")
	}
	if c.coolStep != minCooldown {
		t.Errorf("cooldown = %v, want one burst of 429s to count as one throttle", c.coolStep)
	}
}
