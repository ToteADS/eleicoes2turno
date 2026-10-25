package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeTracker records the ids it saw and answers a fixed count.
type fakeTracker struct {
	ids   []string
	count int
}

func (f *fakeTracker) Seen(id string) { f.ids = append(f.ids, id) }
func (f *fakeTracker) Count() int     { return f.count }

func postPresence(h http.Handler, body string) *httptest.ResponseRecorder {
	return serve(h, httptest.NewRequest("POST", "/api/v1/presence", strings.NewReader(body)))
}

func TestPresence_CountsTheTab(t *testing.T) {
	tr := &fakeTracker{count: 1234}
	rec := postPresence(NewPresence(tr), `{"id":"3f2b9c1e-7a4d-4e8b-9c2a-1b2c3d4e5f60"}`)
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"online":1234}` {
		t.Fatalf("code=%d body=%s", rec.Code, rec.Body)
	}
	if rec.Header().Get("Cache-Control") != "no-store" || rec.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Errorf("headers = %v", rec.Header())
	}
	if len(tr.ids) != 1 || tr.ids[0] != "3f2b9c1e-7a4d-4e8b-9c2a-1b2c3d4e5f60" {
		t.Errorf("seen = %v", tr.ids)
	}
}

func TestPresence_IDLengthBounds(t *testing.T) {
	for _, id := range []string{strings.Repeat("a", 8), strings.Repeat("Z9-", 21) + "x"} {
		tr := &fakeTracker{}
		if rec := postPresence(NewPresence(tr), `{"id":"`+id+`"}`); rec.Code != http.StatusOK || len(tr.ids) != 1 {
			t.Errorf("id of %d chars = %d", len(id), rec.Code)
		}
	}
}

func TestPresence_RejectsInvalidInput(t *testing.T) {
	cases := map[string]string{
		"empty body":     ``,
		"not json":       `id=abcdefgh`,
		"no id":          `{}`,
		"id not string":  `{"id":12345678}`,
		"id too short":   `{"id":"abcdefg"}`,
		"id too long":    `{"id":"` + strings.Repeat("a", 65) + `"}`,
		"bad characters": `{"id":"abcd efgh"}`,
		"unicode":        `{"id":"abcdéfghi"}`,
		"html":           `{"id":"<script>x</script>"}`,
		"unknown field":  `{"id":"abcdefgh","ip":"1.2.3.4"}`,
		"trailing data":  `{"id":"abcdefgh"}{"id":"ijklmnop"}`,
		"oversized":      `{"id":"abcdefgh","pad":"` + strings.Repeat("x", 300) + `"}`,
	}
	for name, body := range cases {
		tr := &fakeTracker{count: 7}
		rec := postPresence(NewPresence(tr), body)
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "invalid_") {
			t.Errorf("%s: code=%d body=%s", name, rec.Code, rec.Body)
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("%s: Cache-Control = %q", name, rec.Header().Get("Cache-Control"))
		}
		if len(tr.ids) != 0 {
			t.Errorf("%s: invalid input reached the tracker: %v", name, tr.ids)
		}
	}
}

func TestPresence_BodyCappedAt256Bytes(t *testing.T) {
	// a valid object padded with whitespace past the cap is refused before it is parsed
	body := `{"id":"abcdefgh"}` + strings.Repeat(" ", 256)
	if rec := postPresence(NewPresence(&fakeTracker{}), body); rec.Code != http.StatusBadRequest {
		t.Errorf("padded body = %d", rec.Code)
	}
	body = `{"id":"abcdefgh"}` + strings.Repeat(" ", 256-17)
	if rec := postPresence(NewPresence(&fakeTracker{}), body); rec.Code != http.StatusOK {
		t.Errorf("256-byte body = %d", rec.Code)
	}
}
