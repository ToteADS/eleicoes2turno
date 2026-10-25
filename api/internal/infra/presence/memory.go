// Package presence implements PresenceTracker in memory.
//
// Tab ids are kept only as a 64-bit hash with a per-process seed, so the map
// holds no visitor-supplied text and each entry costs a few dozen bytes. The
// count is kept in an atomic next to the map: a heartbeat never scans it, and
// expired ids are dropped by a ticker (Start), so a tab can stay counted for up
// to one tick past the TTL.
package presence

import (
	"hash/maphash"
	"sync"
	"sync/atomic"
	"time"
)

// MemoryTracker is a concurrency-safe PresenceTracker.
type MemoryTracker struct {
	ttl   time.Duration
	max   int
	seed  maphash.Seed
	now   func() time.Time
	mu    sync.Mutex
	seen  map[uint64]int64 // id hash -> last heartbeat (unix nanoseconds)
	count atomic.Int64
}

// NewMemoryTracker counts tabs seen within ttl, tracking at most max of them;
// past the cap new tabs are not added (fail open: the count is still served).
func NewMemoryTracker(ttl time.Duration, max int) *MemoryTracker {
	return &MemoryTracker{ttl: ttl, max: max, seed: maphash.MakeSeed(), now: time.Now, seen: map[uint64]int64{}}
}

// Seen records a heartbeat from id.
func (t *MemoryTracker) Seen(id string) {
	key := maphash.String(t.seed, id)
	at := t.now().UnixNano()
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, ok := t.seen[key]; !ok && len(t.seen) >= t.max {
		return
	}
	t.seen[key] = at
	t.count.Store(int64(len(t.seen)))
}

// Count returns the tabs seen within the TTL (as of the last prune).
func (t *MemoryTracker) Count() int { return int(t.count.Load()) }

// Prune forgets the tabs whose last heartbeat is older than the TTL.
func (t *MemoryTracker) Prune() {
	cutoff := t.now().Add(-t.ttl).UnixNano()
	t.mu.Lock()
	defer t.mu.Unlock()
	for key, at := range t.seen {
		if at < cutoff {
			delete(t.seen, key)
		}
	}
	t.count.Store(int64(len(t.seen)))
}

// Start prunes every interval until stop is closed; the returned channel is
// closed once the ticker has stopped.
func (t *MemoryTracker) Start(interval time.Duration, stop <-chan struct{}) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		tick := time.NewTicker(interval)
		defer tick.Stop()
		for {
			select {
			case <-stop:
				return
			case <-tick.C:
				t.Prune()
			}
		}
	}()
	return done
}
