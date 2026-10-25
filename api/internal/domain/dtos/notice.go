// Package dtos holds the payloads that come into the API to change state.
package dtos

import (
	"errors"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"eleicoes2turno/internal/domain/entities"
)

// Notice limits, in characters.
const (
	NoticeTitleMax = 120
	NoticeBodyMax  = 400
	NoticeLabelMax = 40
	noticeURLMax   = 500
)

// Validation errors; the handler answers them as error codes.
var (
	ErrNoticeTitle = errors.New("invalid_title")
	ErrNoticeBody  = errors.New("invalid_body_text")
	ErrNoticeLink  = errors.New("invalid_link")
	ErrNoticeLabel = errors.New("invalid_label")
)

// NoticeDTO is the notice an operator sends (PUT /api/v1/notice) or seeds
// through the environment.
type NoticeDTO struct {
	Title     string `json:"title"`
	Body      string `json:"body"`
	LinkURL   string `json:"linkUrl"`
	LinkLabel string `json:"linkLabel"`
}

// Normalize trims every field.
func (d NoticeDTO) Normalize() NoticeDTO {
	return NoticeDTO{
		Title:     strings.TrimSpace(d.Title),
		Body:      strings.TrimSpace(d.Body),
		LinkURL:   strings.TrimSpace(d.LinkURL),
		LinkLabel: strings.TrimSpace(d.LinkLabel),
	}
}

// Validate checks a normalized DTO: title required, length caps, valid UTF-8
// without control characters, and the link (if any) an absolute https URL.
func (d NoticeDTO) Validate() error {
	if d.Title == "" || !plainText(d.Title, NoticeTitleMax, false) {
		return ErrNoticeTitle
	}
	if !plainText(d.Body, NoticeBodyMax, true) {
		return ErrNoticeBody
	}
	if d.LinkURL != "" && !httpsURL(d.LinkURL) {
		return ErrNoticeLink
	}
	if !plainText(d.LinkLabel, NoticeLabelMax, false) {
		return ErrNoticeLabel
	}
	return nil
}

// ToEntity builds the notice stored and served by the API.
func (d NoticeDTO) ToEntity(now time.Time) entities.Notice {
	return entities.Notice{Title: d.Title, Body: d.Body, LinkURL: d.LinkURL, LinkLabel: d.LinkLabel, UpdatedAt: now.UTC()}
}

func plainText(s string, max int, newlines bool) bool {
	if !utf8.ValidString(s) || utf8.RuneCountInString(s) > max {
		return false
	}
	for _, r := range s {
		if r == '\n' && newlines {
			continue
		}
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

func httpsURL(s string) bool {
	if len(s) > noticeURLMax || !plainText(s, noticeURLMax, false) {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil
}
