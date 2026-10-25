package tse

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// maxBody caps a single TSE file; the largest result file is a few KB.
const maxBody = 5 << 20

type cachedFile struct {
	lastModified string
	body         []byte
}

// Client fetches TSE files and remembers Last-Modified per path, so repeated
// polls are conditional requests answered with 304 when nothing changed.
type Client struct {
	base string
	http *http.Client
	mu   sync.Mutex
	seen map[string]cachedFile
}

// NewClient builds a client for base (e.g. https://resultados.tse.jus.br/oficial).
func NewClient(base string, timeout time.Duration) *Client {
	return &Client{
		base: strings.TrimRight(base, "/"),
		http: &http.Client{Timeout: timeout},
		seen: map[string]cachedFile{},
	}
}

// Fetch implements repositories.ResultSource.
func (c *Client) Fetch(ctx context.Context, path string) ([]byte, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+"/"+path, nil)
	if err != nil {
		return nil, false, fmt.Errorf("build request %s: %w", path, err)
	}
	req.Header.Set("User-Agent", "eleicoes2turno (+https://github.com/ToteADS/eleicoes2turno)")

	c.mu.Lock()
	prev, hasPrev := c.seen[path]
	c.mu.Unlock()
	if hasPrev && prev.lastModified != "" {
		req.Header.Set("If-Modified-Since", prev.lastModified)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, fmt.Errorf("get %s: %w", path, err)
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusNotModified && hasPrev:
		return prev.body, true, nil
	case resp.StatusCode != http.StatusOK:
		return nil, false, fmt.Errorf("get %s: status %d", path, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return nil, false, fmt.Errorf("read %s: %w", path, err)
	}
	c.mu.Lock()
	c.seen[path] = cachedFile{lastModified: resp.Header.Get("Last-Modified"), body: body}
	c.mu.Unlock()
	return body, false, nil
}
