package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"eleicoes2turno/internal/infra/notice"
)

const testToken = "s3cret-token-for-tests"

func newNotice(token string) (*Notice, *notice.MemoryStore) {
	store := notice.NewMemoryStore()
	h := NewNotice(store, token)
	h.now = func() time.Time { return time.Date(2026, 10, 25, 20, 0, 0, 0, time.UTC) }
	return h, store
}

func noticeReq(method, body, auth string) *http.Request {
	r := httptest.NewRequest(method, "/api/v1/notice", strings.NewReader(body))
	if auth != "" {
		r.Header.Set("Authorization", auth)
	}
	return r
}

const goodNotice = `{"title":"Apuração pausada","body":"O TSE suspendeu.","linkUrl":"https://www.tse.jus.br/comunicacao/noticias","linkLabel":"Saiba mais"}`

func TestNotice_GetEmpty(t *testing.T) {
	h, _ := newNotice(testToken)
	rec := serve(http.HandlerFunc(h.Get), noticeReq("GET", "", ""))
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"notice":null}` || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("code=%d body=%s headers=%v", rec.Code, rec.Body, rec.Header())
	}
}

func TestNotice_SetGetClear(t *testing.T) {
	h, _ := newNotice(testToken)
	rec := serve(http.HandlerFunc(h.Put), noticeReq("PUT", goodNotice, "Bearer "+testToken))
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("put = %d %s", rec.Code, rec.Body)
	}
	rec = serve(http.HandlerFunc(h.Get), noticeReq("GET", "", ""))
	var got struct {
		Notice *struct{ Title, Body, LinkURL, LinkLabel, UpdatedAt string }
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || got.Notice == nil {
		t.Fatalf("get = %s (%v)", rec.Body, err)
	}
	n := got.Notice
	if n.Title != "Apuração pausada" || n.Body != "O TSE suspendeu." || n.LinkURL != "https://www.tse.jus.br/comunicacao/noticias" || n.LinkLabel != "Saiba mais" || n.UpdatedAt != "2026-10-25T20:00:00Z" {
		t.Errorf("notice = %+v", n)
	}
	rec = serve(http.HandlerFunc(h.Delete), noticeReq("DELETE", "", "Bearer "+testToken))
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != `{"notice":null}` {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body)
	}
	if rec = serve(http.HandlerFunc(h.Get), noticeReq("GET", "", "")); strings.TrimSpace(rec.Body.String()) != `{"notice":null}` {
		t.Errorf("after delete = %s", rec.Body)
	}
}

func TestNotice_TrimsFields(t *testing.T) {
	h, store := newNotice(testToken)
	serve(http.HandlerFunc(h.Put), noticeReq("PUT", `{"title":"  Aviso  "}`, "Bearer "+testToken))
	if n, ok := store.Get(); !ok || n.Title != "Aviso" {
		t.Errorf("stored = %+v %v", n, ok)
	}
}

func TestNotice_Auth(t *testing.T) {
	cases := map[string]string{
		"missing":     "",
		"wrong":       "Bearer nope",
		"prefix only": "Bearer ",
		"basic":       "Basic " + testToken,
		"no scheme":   testToken,
		"longer":      "Bearer " + testToken + "x",
		"lowercase":   "bearer " + testToken,
	}
	for name, auth := range cases {
		h, store := newNotice(testToken)
		for _, hf := range []http.HandlerFunc{h.Put, h.Delete} {
			rec := serve(hf, noticeReq("PUT", goodNotice, auth))
			if rec.Code != http.StatusUnauthorized || rec.Header().Get("WWW-Authenticate") == "" {
				t.Errorf("%s = %d", name, rec.Code)
			}
		}
		if _, ok := store.Get(); ok {
			t.Errorf("%s: notice was set", name)
		}
	}
}

func TestNotice_DisabledWithoutToken(t *testing.T) {
	h, store := newNotice("")
	for _, auth := range []string{"", "Bearer ", "Bearer x"} {
		for _, hf := range []http.HandlerFunc{h.Put, h.Delete} {
			if rec := serve(hf, noticeReq("PUT", goodNotice, auth)); rec.Code != http.StatusNotFound {
				t.Errorf("%q = %d", auth, rec.Code)
			}
		}
	}
	if _, ok := store.Get(); ok {
		t.Error("notice was set")
	}
	if rec := serve(http.HandlerFunc(h.Get), noticeReq("GET", "", "")); rec.Code != http.StatusOK {
		t.Errorf("get = %d", rec.Code)
	}
}

func TestNotice_RejectsInvalidBodies(t *testing.T) {
	cases := map[string]string{
		"empty":          ``,
		"not json":       `title=x`,
		"unknown field":  `{"title":"x","html":"<b>"}`,
		"trailing":       `{"title":"x"}{"title":"y"}`,
		"no title":       `{"body":"x"}`,
		"blank title":    `{"title":"   "}`,
		"long title":     `{"title":"` + strings.Repeat("a", 121) + `"}`,
		"long body":      `{"title":"x","body":"` + strings.Repeat("a", 401) + `"}`,
		"long label":     `{"title":"x","linkLabel":"` + strings.Repeat("a", 41) + `"}`,
		"http link":      `{"title":"x","linkUrl":"http://a.com"}`,
		"js link":        `{"title":"x","linkUrl":"javascript:alert(1)"}`,
		"oversized":      `{"title":"x","body":"` + strings.Repeat("a", 5000) + `"}`,
		"title not text": `{"title":5}`,
	}
	for name, body := range cases {
		h, store := newNotice(testToken)
		rec := serve(http.HandlerFunc(h.Put), noticeReq("PUT", body, "Bearer "+testToken))
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s = %d %s", name, rec.Code, rec.Body)
		}
		if _, ok := store.Get(); ok {
			t.Errorf("%s: notice was set", name)
		}
	}
	h, _ := newNotice(testToken)
	rec := serve(http.HandlerFunc(h.Put), noticeReq("PUT", `{"title":"x","linkUrl":"http://a.com"}`, "Bearer "+testToken))
	if !strings.Contains(rec.Body.String(), "invalid_link") {
		t.Errorf("error code = %s", rec.Body)
	}
}
