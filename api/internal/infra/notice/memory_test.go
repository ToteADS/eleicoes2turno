package notice

import (
	"sync"
	"testing"
	"time"

	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/repositories"
)

var _ repositories.NoticeStore = (*MemoryStore)(nil)

func TestMemoryStore(t *testing.T) {
	s := NewMemoryStore()
	if _, ok := s.Get(); ok {
		t.Fatal("new store has a notice")
	}
	n := entities.Notice{Title: "Aviso", UpdatedAt: time.Now()}
	s.Set(n)
	if got, ok := s.Get(); !ok || got != n {
		t.Fatalf("get = %+v %v", got, ok)
	}
	s.Set(entities.Notice{Title: "Outro"})
	if got, _ := s.Get(); got.Title != "Outro" {
		t.Errorf("replace = %+v", got)
	}
	s.Clear()
	if got, ok := s.Get(); ok || got != (entities.Notice{}) {
		t.Errorf("after clear = %+v %v", got, ok)
	}
}

func TestMemoryStore_Concurrent(t *testing.T) {
	s := NewMemoryStore()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		go func() { defer wg.Done(); s.Set(entities.Notice{Title: "x"}) }()
		go func() { defer wg.Done(); s.Get() }()
		go func() { defer wg.Done(); s.Clear() }()
	}
	wg.Wait()
}
