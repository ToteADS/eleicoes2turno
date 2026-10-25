package presence

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"eleicoes2turno/internal/domain/repositories"
)

var _ repositories.PresenceTracker = (*MemoryTracker)(nil)

// clock is a settable, concurrency-safe time source.
type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

func newTracker(ttl time.Duration, max int) (*MemoryTracker, *clock) {
	c := &clock{t: time.Date(2026, 10, 25, 20, 0, 0, 0, time.UTC)}
	tr := NewMemoryTracker(ttl, max)
	tr.now = c.now
	return tr, c
}

func TestSeen_CountsDistinctIDs(t *testing.T) {
	tr, _ := newTracker(150*time.Second, 10)
	if tr.Count() != 0 {
		t.Fatalf("empty count = %d", tr.Count())
	}
	tr.Seen("tab-aaaaaaaa")
	tr.Seen("tab-bbbbbbbb")
	tr.Seen("tab-aaaaaaaa")
	if got := tr.Count(); got != 2 {
		t.Errorf("count = %d, want 2", got)
	}
}

func TestPrune_ExpiresAfterTTL(t *testing.T) {
	tr, c := newTracker(150*time.Second, 10)
	tr.Seen("old-tab-1")
	c.advance(100 * time.Second)
	tr.Seen("new-tab-1")
	c.advance(50 * time.Second) // old is exactly 150 s old: still online
	tr.Prune()
	if got := tr.Count(); got != 2 {
		t.Fatalf("at the TTL count = %d, want 2", got)
	}
	c.advance(time.Second)
	tr.Prune()
	if got := tr.Count(); got != 1 {
		t.Errorf("after the TTL count = %d, want 1", got)
	}
}

func TestSeen_RefreshesLastSeen(t *testing.T) {
	tr, c := newTracker(150*time.Second, 10)
	tr.Seen("tab-refresh")
	c.advance(120 * time.Second)
	tr.Seen("tab-refresh")
	c.advance(120 * time.Second)
	tr.Prune()
	if got := tr.Count(); got != 1 {
		t.Errorf("refreshed tab expired: count = %d", got)
	}
}

func TestSeen_CapFailsOpen(t *testing.T) {
	tr, c := newTracker(150*time.Second, 2)
	tr.Seen("tab-one-1")
	tr.Seen("tab-two-2")
	tr.Seen("tab-three") // over the cap: not added
	if got := tr.Count(); got != 2 {
		t.Fatalf("count = %d, want 2 (capped)", got)
	}
	// known ids still refresh while full
	c.advance(100 * time.Second)
	tr.Seen("tab-one-1")
	c.advance(100 * time.Second)
	tr.Prune()
	if got := tr.Count(); got != 1 {
		t.Fatalf("count = %d, want 1", got)
	}
	// room again after pruning
	tr.Seen("tab-three")
	if got := tr.Count(); got != 2 {
		t.Errorf("count = %d, want 2", got)
	}
}

func TestSeen_Concurrent(t *testing.T) {
	tr, _ := newTracker(150*time.Second, 100_000)
	var wg sync.WaitGroup
	for g := 0; g < 16; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 500; i++ {
				tr.Seen(fmt.Sprintf("tab-%02d-%04d", g, i))
				_ = tr.Count()
				if i%100 == 0 {
					tr.Prune()
				}
			}
		}(g)
	}
	wg.Wait()
	if got := tr.Count(); got != 16*500 {
		t.Errorf("count = %d, want %d", got, 16*500)
	}
}

func TestStart_PrunesUntilStopped(t *testing.T) {
	tr, c := newTracker(150*time.Second, 10)
	tr.Seen("tab-expiring")
	c.advance(time.Hour)
	stop := make(chan struct{})
	done := tr.Start(5*time.Millisecond, stop)
	deadline := time.Now().Add(2 * time.Second)
	for tr.Count() != 0 {
		if time.Now().After(deadline) {
			t.Fatal("ticker never pruned")
		}
		time.Sleep(5 * time.Millisecond)
	}
	close(stop)
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("ticker did not stop")
	}
}

func benchIDs(n int) []string {
	ids := make([]string, n)
	for i := range ids {
		ids[i] = fmt.Sprintf("%08x-0000-4000-8000-%012x", i, i)
	}
	return ids
}

// BenchmarkSeenCount is the request path: one heartbeat refresh plus the count,
// with 100k tabs online and all CPUs hammering it.
func BenchmarkSeenCount(b *testing.B) {
	tr := NewMemoryTracker(150*time.Second, 300_000)
	ids := benchIDs(100_000)
	for _, id := range ids {
		tr.Seen(id)
	}
	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		i := 0
		for pb.Next() {
			tr.Seen(ids[i%len(ids)])
			_ = tr.Count()
			i += 7919
		}
	})
}

// BenchmarkPrune100k is one ticker pass over 100k online tabs.
func BenchmarkPrune100k(b *testing.B) {
	tr := NewMemoryTracker(150*time.Second, 300_000)
	for _, id := range benchIDs(100_000) {
		tr.Seen(id)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		tr.Prune()
	}
}
