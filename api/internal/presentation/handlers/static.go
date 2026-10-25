package handlers

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Static serves the built frontend from dir, with an SPA fallback to
// index.html for extension-less routes and no directory listings.
func Static(dir string) http.Handler {
	root := http.Dir(dir)
	files := http.FileServer(root)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := path.Clean("/" + r.URL.Path)
		info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(clean)))

		switch {
		case err == nil && info.IsDir() && clean != "/":
			http.NotFound(w, r)
			return
		case err != nil && path.Ext(clean) == "":
			serveIndex(w, r, dir)
			return
		case err != nil:
			http.NotFound(w, r)
			return
		case clean == "/" || clean == "/index.html":
			serveIndex(w, r, dir)
			return
		}

		switch {
		case strings.HasPrefix(clean, "/assets/"):
			// Vite fingerprints everything under /assets.
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case strings.HasPrefix(clean, "/geo/"), strings.HasPrefix(clean, "/fonts/"):
			w.Header().Set("Cache-Control", "public, max-age=86400")
		case strings.HasPrefix(clean, "/ads/"), strings.HasPrefix(clean, "/brand/"):
			// Not fingerprinted and swapped in place: keep them short-lived.
			w.Header().Set("Cache-Control", "public, max-age=300")
		default:
			w.Header().Set("Cache-Control", "public, max-age=3600")
		}
		r.URL.Path = clean
		files.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, r *http.Request, dir string) {
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(dir, "index.html"))
}
