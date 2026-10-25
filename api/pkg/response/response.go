// Package response writes JSON HTTP responses.
package response

import (
	"encoding/json"
	"net/http"
)

// JSON writes v as a JSON body with status.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes {"error": code} with status.
func Error(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Cache-Control", "no-store")
	JSON(w, status, map[string]string{"error": code})
}
