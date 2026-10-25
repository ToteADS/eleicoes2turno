package tse

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// maxBody caps a single TSE file; the largest result file is a few KB.
const maxBody = 5 << 20

// After a 429 the client sends nothing for a cooldown, doubling while the TSE
// keeps throttling: requests sent during a throttle only extend it.
const (
	minCooldown = time.Minute
	maxCooldown = 10 * time.Minute
)

type cachedFile struct {
	lastModified string
	body         []byte
}

// Client fetches TSE files and remembers Last-Modified per path, so repeated
// polls are conditional requests answered with 304 when nothing changed.
type Client struct {
	base string
	http *http.Client
	now  func() time.Time
	mu   sync.Mutex
	seen map[string]cachedFile

	coolUntil time.Time
	coolStep  time.Duration
}

// NewClient builds a client for base (e.g. https://resultados.tse.jus.br/oficial).
func NewClient(base string, timeout time.Duration) *Client {
	return &Client{
		base: strings.TrimRight(base, "/"),
		http: &http.Client{Timeout: timeout},
		now:  time.Now,
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
	until := c.coolUntil
	c.mu.Unlock()
	if c.now().Before(until) {
		return nil, false, fmt.Errorf("get %s: throttled by the TSE, waiting until %s", path, until.Format(time.TimeOnly))
	}
	if hasPrev && prev.lastModified != "" {
		req.Header.Set("If-Modified-Since", prev.lastModified)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, false, fmt.Errorf("get %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusTooManyRequests {
		wait := c.backOff(resp.Header.Get("Retry-After"))
		return nil, false, fmt.Errorf("get %s: status 429, pausing requests for %s", path, wait)
	}
	c.mu.Lock()
	c.coolStep = 0
	c.mu.Unlock()

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

// backOff starts or lengthens the cooldown and returns its length.
func (c *Client) backOff(retryAfter string) time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	if now := c.now(); now.Before(c.coolUntil) { // same burst: already cooling down
		return c.coolUntil.Sub(now)
	}
	step := min(max(c.coolStep*2, minCooldown), maxCooldown)
	if secs, err := strconv.Atoi(retryAfter); err == nil && secs > 0 {
		step = max(step, time.Duration(secs)*time.Second)
	}
	c.coolStep = step
	c.coolUntil = c.now().Add(step)
	return step
}
