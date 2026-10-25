package entities

import "time"

// Notice is the site-wide banner an operator publishes (e.g. "TSE paused the
// count"). Its text is plain: the web app never renders it as HTML.
type Notice struct {
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	LinkURL   string    `json:"linkUrl"`
	LinkLabel string    `json:"linkLabel"`
	UpdatedAt time.Time `json:"updatedAt"`
}
