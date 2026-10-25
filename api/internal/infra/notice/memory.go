// Package notice implements NoticeStore in memory: the notice lives as long as
// the process (a restart restores it from the NOTICE_* environment, if set).
package notice

import (
	"sync"

	"eleicoes2turno/internal/domain/entities"
)

// MemoryStore is a concurrency-safe NoticeStore.
type MemoryStore struct {
	mu     sync.RWMutex
	notice entities.Notice
	set    bool
}

// NewMemoryStore returns an empty store.
func NewMemoryStore() *MemoryStore { return &MemoryStore{} }

// Get returns the notice and whether one is set.
func (s *MemoryStore) Get() (entities.Notice, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.notice, s.set
}

// Set replaces the notice.
func (s *MemoryStore) Set(n entities.Notice) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notice, s.set = n, true
}

// Clear removes the notice.
func (s *MemoryStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notice, s.set = entities.Notice{}, false
}
