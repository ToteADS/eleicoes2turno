// Package logger builds the structured logger used by the app.
package logger

import (
	"io"
	"log/slog"
)

// New returns a JSON logger writing to w.
func New(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
