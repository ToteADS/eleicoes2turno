package dtos

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func valid() NoticeDTO {
	return NoticeDTO{Title: "Apuração pausada", Body: "O TSE suspendeu a divulgação.", LinkURL: "https://www.tse.jus.br/comunicacao/noticias", LinkLabel: "Saiba mais"}
}

func TestNoticeDTO_Valid(t *testing.T) {
	cases := map[string]NoticeDTO{
		"full":          valid(),
		"title only":    {Title: "Aviso"},
		"max lengths":   {Title: strings.Repeat("á", NoticeTitleMax), Body: strings.Repeat("é", NoticeBodyMax), LinkLabel: strings.Repeat("í", NoticeLabelMax)},
		"body newline":  {Title: "Aviso", Body: "linha 1\nlinha 2"},
		"link no label": {Title: "Aviso", LinkURL: "https://example.com/x?y=1#z"},
	}
	for name, d := range cases {
		if err := d.Validate(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestNoticeDTO_Invalid(t *testing.T) {
	mod := func(f func(*NoticeDTO)) NoticeDTO { d := valid(); f(&d); return d }
	cases := map[string]struct {
		d    NoticeDTO
		want error
	}{
		"no title":        {mod(func(d *NoticeDTO) { d.Title = "" }), ErrNoticeTitle},
		"title too long":  {mod(func(d *NoticeDTO) { d.Title = strings.Repeat("a", NoticeTitleMax+1) }), ErrNoticeTitle},
		"title newline":   {mod(func(d *NoticeDTO) { d.Title = "a\nb" }), ErrNoticeTitle},
		"title bad utf8":  {mod(func(d *NoticeDTO) { d.Title = "a\xffb" }), ErrNoticeTitle},
		"body too long":   {mod(func(d *NoticeDTO) { d.Body = strings.Repeat("a", NoticeBodyMax+1) }), ErrNoticeBody},
		"body control":    {mod(func(d *NoticeDTO) { d.Body = "a\x00b" }), ErrNoticeBody},
		"body del":        {mod(func(d *NoticeDTO) { d.Body = "a\x7fb" }), ErrNoticeBody},
		"http link":       {mod(func(d *NoticeDTO) { d.LinkURL = "http://www.tse.jus.br" }), ErrNoticeLink},
		"javascript link": {mod(func(d *NoticeDTO) { d.LinkURL = "javascript:alert(1)" }), ErrNoticeLink},
		"relative link":   {mod(func(d *NoticeDTO) { d.LinkURL = "/foo" }), ErrNoticeLink},
		"no host":         {mod(func(d *NoticeDTO) { d.LinkURL = "https:///foo" }), ErrNoticeLink},
		"userinfo":        {mod(func(d *NoticeDTO) { d.LinkURL = "https://a:b@evil.com" }), ErrNoticeLink},
		"link too long":   {mod(func(d *NoticeDTO) { d.LinkURL = "https://a.com/" + strings.Repeat("x", 500) }), ErrNoticeLink},
		"link unparsable": {mod(func(d *NoticeDTO) { d.LinkURL = "https://a.com/%zz" }), ErrNoticeLink},
		"label too long":  {mod(func(d *NoticeDTO) { d.LinkLabel = strings.Repeat("a", NoticeLabelMax+1) }), ErrNoticeLabel},
	}
	for name, c := range cases {
		if err := c.d.Validate(); !errors.Is(err, c.want) {
			t.Errorf("%s: got %v, want %v", name, err, c.want)
		}
	}
}

func TestNoticeDTO_NormalizeAndEntity(t *testing.T) {
	d := NoticeDTO{Title: "  Aviso ", Body: "\n corpo \n", LinkURL: " https://a.com ", LinkLabel: " Ver "}.Normalize()
	if d != (NoticeDTO{Title: "Aviso", Body: "corpo", LinkURL: "https://a.com", LinkLabel: "Ver"}) {
		t.Fatalf("normalized = %+v", d)
	}
	now := time.Date(2026, 10, 25, 17, 0, 0, 0, time.FixedZone("BRT", -3*3600))
	n := d.ToEntity(now)
	if n.Title != "Aviso" || n.Body != "corpo" || n.LinkURL != "https://a.com" || n.LinkLabel != "Ver" || !n.UpdatedAt.Equal(now) || n.UpdatedAt.Location() != time.UTC {
		t.Errorf("entity = %+v", n)
	}
}
