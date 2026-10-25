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
