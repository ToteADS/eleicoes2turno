package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/repositories"
	"eleicoes2turno/internal/infra/cache"
	"eleicoes2turno/internal/infra/tse"
)

// fakeSource serves canned TSE files by path; unknown paths fail.
type fakeSource struct {
	mu    sync.Mutex
	files map[string]string
	fail  bool
	calls map[string]int
}

func (f *fakeSource) Fetch(_ context.Context, path string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.calls == nil {
		f.calls = map[string]int{}
	}
	f.calls[path]++
	if f.fail {
		return nil, false, errors.New("tse down")
	}
	b, ok := f.files[path]
	if !ok {
		return nil, false, fmt.Errorf("not found: %s", path)
	}
	return []byte(b), false, nil
}

func tseFile(electorate, lula, flavio int) string {
	return fmt.Sprintf(`{"dg":"25/10/2026","hg":"17:30:00","s":{"st":"1","ts":"2"},"e":{"te":"%d"},"v":{"vv":"%d"},
"carg":[{"agr":[{"par":[{"sg":"PT","cand":[{"n":"13","nmu":"LULA","sqcand":"280002542548","vap":"%d"}]},
{"sg":"PL","cand":[{"n":"22","nmu":"FLÁVIO BOLSONARO","sqcand":"280002551544","vap":"%d"}]}]}]}]}`,
		electorate, lula+flavio, lula, flavio)
}

func newFixture() (*fakeSource, []entities.Municipality, []entities.AbroadCity) {
	files := map[string]string{
		brPath():               tseFile(1000, 60, 40),
		ufPath("ba"):           tseFile(500, 40, 10),
		ufPath("sp"):           tseFile(400, 10, 20),
		ufPath("zz"):           tseFile(100, 10, 10),
		munPath("zz", "30627"): tseFile(30, 1, 2),
		munPath("zz", "30198"): tseFile(40, 3, 4),
		munPath("zz", "29742"): tseFile(30, 5, 6),
		munPath("ba", "33030"): tseFile(20, 7, 1),
	}
	cat := []entities.Municipality{
		{UF: "ba", TSECode: "33030", IBGECode: "2900207", Name: "ABARÉ"},
		{UF: "ba", TSECode: "99999", IBGECode: "", Name: "SEM IBGE"},
		{UF: "zz", TSECode: "30627", Name: "TÓQUIO"},
	}
	abroad := []entities.AbroadCity{
		{Code: "30627", ISO: 392}, {Code: "30198", ISO: 392}, {Code: "29742", ISO: 392},
	}
	return &fakeSource{files: files}, cat, abroad
}

func newTestPoller(src *fakeSource, cat []entities.Municipality, abroad []entities.AbroadCity, store repositories.ResultStore) *Poller {
	return NewPoller(src, store, cat, abroad, PollerOptions{
		FastInterval: 10 * time.Millisecond, MunConcurrency: 2, UFs: []string{"ba", "sp"}, Parse: tse.ParseResult,
	})
}

func decodeSummary(t *testing.T, store repositories.ResultStore) entities.Snapshot {
	t.Helper()
	body, _, _, ok := store.Payload(repositories.KeySummary)
	if !ok {
		t.Fatal("no summary payload")
	}
	var s entities.Snapshot
	if err := json.Unmarshal(body, &s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestPoller_FastOnce_BuildsSummary(t *testing.T) {
	src, cat, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := newTestPoller(src, cat, abroad, store)

	if err := p.RunFastOnce(context.Background()); err != nil {
		t.Fatalf("RunFastOnce: %v", err)
	}
	s := decodeSummary(t, store)
	if s.BR.Lula != 60 || s.BR.Flavio != 40 {
		t.Errorf("BR = %+v", s.BR)
	}
	if s.BRUfsSum.Lula != 50 || s.BRUfsSum.Electorate != 900 {
		t.Errorf("BRUfsSum = %+v, want sum of ba+sp", s.BRUfsSum)
	}
	if s.ZZ.Electorate != 100 {
		t.Errorf("ZZ = %+v", s.ZZ)
	}
	if len(s.UFs) != 2 || s.UFs["ba"].Lula != 40 {
		t.Errorf("UFs = %+v", s.UFs)
	}
	if s.Countries[392].Lula != 9 || s.Countries[392].Electorate != 100 {
		t.Errorf("Japan = %+v", s.Countries[392])
	}
	if len(s.Candidates) != 2 || s.Stale {
		t.Errorf("candidates = %+v stale = %v", s.Candidates, s.Stale)
	}
	if body, _, _, ok := store.Payload(repositories.KeyAbroad); !ok || !strings.Contains(string(body), `"30627"`) {
		t.Errorf("abroad payload = %s", body)
	}
}

func TestPoller_KeepsLastGoodOnError(t *testing.T) {
	src, cat, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := newTestPoller(src, cat, abroad, store)
	if err := p.RunFastOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	src.fail = true
	for i := 0; i < 2; i++ {
		if err := p.RunFastOnce(context.Background()); err == nil {
			t.Fatal("expected error while TSE is down")
		}
		if s := decodeSummary(t, store); s.BR.Lula != 60 || s.Stale {
			t.Fatalf("after %d failures: BR=%+v stale=%v", i+1, s.BR, s.Stale)
		}
	}
	_ = p.RunFastOnce(context.Background())
	if s := decodeSummary(t, store); s.BR.Lula != 60 || !s.Stale {
		t.Errorf("after 3 failures want last data marked stale, got BR=%+v stale=%v", s.BR, s.Stale)
	}
	src.fail = false
	if err := p.RunFastOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s := decodeSummary(t, store); s.Stale {
		t.Error("stale must clear after a successful cycle")
	}
}

func TestPoller_PartialUFFailureKeepsPrevious(t *testing.T) {
	src, cat, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := newTestPoller(src, cat, abroad, store)
	if err := p.RunFastOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	delete(src.files, ufPath("sp"))
	if err := p.RunFastOnce(context.Background()); err != nil {
		t.Fatalf("partial failure should not fail the cycle: %v", err)
	}
	if s := decodeSummary(t, store); s.UFs["sp"].Flavio != 20 {
		t.Errorf("sp should keep last good value, got %+v", s.UFs["sp"])
	}
}

func TestPoller_SweepGroupsByUF(t *testing.T) {
	src, cat, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := newTestPoller(src, cat, abroad, store)
	if err := p.SweepMunicipalitiesOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	body, _, _, ok := store.Payload(repositories.KeyMunicipalities("ba"))
	if !ok {
		t.Fatal("no mun:ba payload")
	}
	var got struct {
		Items map[string]entities.AreaResult `json:"items"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 || got.Items["2900207"].Lula != 7 {
		t.Errorf("items = %+v", got.Items)
	}
	if _, _, _, ok := store.Payload(repositories.KeyMunicipalities("zz")); ok {
		t.Error("abroad cities must not be swept as municipalities")
	}
}

func TestPoller_SweepCanceled(t *testing.T) {
	src, cat, abroad := newFixture()
	p := newTestPoller(src, cat, abroad, cache.NewMemoryStore())
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := p.SweepMunicipalitiesOnce(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

func TestPoller_RunStopsOnCancel(t *testing.T) {
	src, cat, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := newTestPoller(src, cat, abroad, store)
	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	done := make(chan struct{})
	go func() { p.Run(ctx); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancel")
	}
	if _, _, _, ok := store.Payload(repositories.KeyMunicipalities("ba")); !ok {
		t.Error("Run should have swept municipalities")
	}
}

// blockingSource never answers until the request context ends (a hanging TSE).
type blockingSource struct{}

func (blockingSource) Fetch(ctx context.Context, _ string) ([]byte, bool, error) {
	<-ctx.Done()
	return nil, false, ctx.Err()
}

func TestPoller_FastCycleHasDeadline(t *testing.T) {
	_, cat, abroad := newFixture()
	p := NewPoller(blockingSource{}, cache.NewMemoryStore(), cat, abroad, PollerOptions{
		FastInterval: time.Second, CycleTimeout: 50 * time.Millisecond, UFs: []string{"ba"}, Parse: tse.ParseResult,
	})
	start := time.Now()
	if err := p.RunFastOnce(context.Background()); err == nil {
		t.Fatal("expected error from hanging source")
	}
	if d := time.Since(start); d > time.Second {
		t.Errorf("fast cycle took %v, want it bounded by CycleTimeout", d)
	}
}

func TestPoller_SummaryWithoutCatalog(t *testing.T) {
	src, _, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := newTestPoller(src, nil, abroad, store)
	if err := p.RunFastOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := p.SweepMunicipalitiesOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, _, _, ok := store.Payload(repositories.KeySummary); !ok {
		t.Fatal("summary must be published before the catalog is known")
	}
	p.SetCatalog([]entities.Municipality{{UF: "ba", TSECode: "33030", IBGECode: "2900207"}})
	if err := p.SweepMunicipalitiesOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, _, _, ok := store.Payload(repositories.KeyMunicipalities("ba")); !ok {
		t.Error("sweep should run once the catalog is set")
	}
}

func TestPoller_FailureReportsCause(t *testing.T) {
	src, cat, abroad := newFixture()
	src.fail = true
	p := newTestPoller(src, cat, abroad, cache.NewMemoryStore())
	err := p.RunFastOnce(context.Background())
	if err == nil || !strings.Contains(err.Error(), "tse down") {
		t.Errorf("err = %v, want it to carry the fetch error", err)
	}
}

func TestPoller_AbroadCitiesEveryNthCycle(t *testing.T) {
	src, cat, abroad := newFixture()
	store := cache.NewMemoryStore()
	p := NewPoller(src, store, cat, abroad, PollerOptions{
		FastInterval: time.Second, UFs: []string{"ba", "sp"}, Parse: tse.ParseResult, AbroadEvery: 3,
	})
	for i := 0; i < 4; i++ {
		if err := p.RunFastOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
		if s := decodeSummary(t, store); s.Countries[392].Lula != 9 {
			t.Fatalf("cycle %d: Japan = %+v, want kept between abroad refreshes", i+1, s.Countries[392])
		}
	}
	if n := src.calls[munPath("zz", "30627")]; n != 2 {
		t.Errorf("abroad city fetched %d times in 4 cycles, want 2 (cycles 1 and 4)", n)
	}
	if n := src.calls[brPath()]; n != 4 {
		t.Errorf("BR fetched %d times, want every cycle", n)
	}
}

func TestPoller_SweepIsPaced(t *testing.T) {
	src, cat, abroad := newFixture()
	for i := 0; i < 3; i++ {
		cat = append(cat, entities.Municipality{UF: "ba", TSECode: fmt.Sprintf("9000%d", i), IBGECode: fmt.Sprintf("290000%d", i)})
	}
	p := NewPoller(src, cache.NewMemoryStore(), cat, abroad, PollerOptions{
		FastInterval: time.Second, MunConcurrency: 1, MunPace: 30 * time.Millisecond, UFs: []string{"ba"}, Parse: tse.ParseResult,
	})
	start := time.Now()
	if err := p.SweepMunicipalitiesOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if d := time.Since(start); d < 90*time.Millisecond {
		t.Errorf("4 municipalities swept in %v, want at least 3 pauses of 30ms", d)
	}
}
