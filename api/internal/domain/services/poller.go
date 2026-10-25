// Package services holds long-running domain services.
package services

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/repositories"
	"eleicoes2turno/internal/domain/usecases"
)

// staleAfter is how many failed fast cycles in a row mark the data stale.
const staleAfter = 3

// fastConcurrency bounds parallel requests in the fast cycle (BR, UFs, abroad).
const fastConcurrency = 8

// AllUFs are the 27 federative units, lowercase as the TSE uses them.
var AllUFs = []string{"ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa",
	"pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "sp", "se", "to"}

// TSE layout of the 2026 presidential runoff (election 6258, office c0001).
func brPath() string { return "ele2026/6258/dados/br/br-c0001-e006258-u.json" }
func ufPath(uf string) string {
	return fmt.Sprintf("ele2026/6258/dados/%s/%s-c0001-e006258-u.json", uf, uf)
}
func munPath(uf, code string) string {
	return fmt.Sprintf("ele2026/6258/dados/%s/%s%s-c0001-e006258-u.json", uf, uf, code)
}

// PollerOptions tunes the poller.
type PollerOptions struct {
	FastInterval   time.Duration
	MunConcurrency int
	// UFs defaults to AllUFs.
	UFs    []string
	Logger *slog.Logger
	// CycleTimeout bounds one fast cycle so a hanging TSE cannot stall refreshes (default 25s).
	CycleTimeout time.Duration
	// Parse decodes one TSE result file (injected from infra to keep the domain clean).
	Parse func([]byte) (entities.AreaResult, []entities.Candidate, error)
}

// Poller keeps the store filled with the latest TSE results. It never
// replaces good data with a failed fetch.
type Poller struct {
	src    repositories.ResultSource
	store  repositories.ResultStore
	munis  map[string][]entities.Municipality // by UF, only municipalities with an IBGE code
	abroad []entities.AbroadCity
	opt    PollerOptions

	mu         sync.Mutex
	failures   int
	last       entities.Snapshot
	hasLast    bool
	ufs        map[string]entities.AreaResult
	cities     map[string]entities.AreaResult
	munResults map[string]map[string]entities.AreaResult
}

// NewPoller builds a poller over the catalog and abroad city table.
func NewPoller(src repositories.ResultSource, store repositories.ResultStore, cat []entities.Municipality,
	abroad []entities.AbroadCity, opt PollerOptions) *Poller {
	if len(opt.UFs) == 0 {
		opt.UFs = AllUFs
	}
	if opt.MunConcurrency < 1 {
		opt.MunConcurrency = 1
	}
	if opt.Logger == nil {
		opt.Logger = slog.Default()
	}
	if opt.CycleTimeout <= 0 {
		opt.CycleTimeout = 25 * time.Second
	}
	p := &Poller{src: src, store: store, abroad: abroad, opt: opt,
		ufs: map[string]entities.AreaResult{}, cities: map[string]entities.AreaResult{},
		munResults: map[string]map[string]entities.AreaResult{}}
	p.SetCatalog(cat)
	return p
}

// SetCatalog sets the municipality catalog swept by SweepMunicipalitiesOnce.
// The fast cycle does not need it, so the summary is served before it is known.
func (p *Poller) SetCatalog(cat []entities.Municipality) {
	munis := map[string][]entities.Municipality{}
	for _, m := range cat {
		if m.UF != "zz" && m.IBGECode != "" {
			munis[m.UF] = append(munis[m.UF], m)
		}
	}
	p.mu.Lock()
	p.munis = munis
	p.mu.Unlock()
}

// Run polls until ctx is canceled: the fast cycle on a ticker and the
// municipality sweep in a continuous loop.
func (p *Poller) Run(ctx context.Context) {
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		p.loop(ctx, func() {
			if err := p.RunFastOnce(ctx); err != nil && ctx.Err() == nil {
				p.opt.Logger.Warn("fast cycle failed", "err", err)
			}
		})
	}()
	go func() {
		defer wg.Done()
		p.loop(ctx, func() {
			if err := p.SweepMunicipalitiesOnce(ctx); err != nil && ctx.Err() == nil {
				p.opt.Logger.Warn("municipality sweep failed", "err", err)
			}
		})
	}()
	wg.Wait()
}

func (p *Poller) loop(ctx context.Context, step func()) {
	// a ticker keeps the cadence: a slow cycle does not push the next one further out
	t := time.NewTicker(p.opt.FastInterval)
	defer t.Stop()
	for {
		step()
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

type fetched struct {
	key  string
	res  entities.AreaResult
	cand []entities.Candidate
	err  error
}

// fetchAll fetches paths (key -> path) with bounded concurrency.
func (p *Poller) fetchAll(ctx context.Context, paths map[string]string, limit int) []fetched {
	out := make([]fetched, 0, len(paths))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, limit)
	for key, path := range paths {
		wg.Add(1)
		go func(key, path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			f := fetched{key: key}
			body, _, err := p.src.Fetch(ctx, path)
			if err == nil {
				f.res, f.cand, err = p.opt.Parse(body)
			}
			f.err = err
			mu.Lock()
			out = append(out, f)
			mu.Unlock()
		}(key, path)
	}
	wg.Wait()
	return out
}

// RunFastOnce refreshes Brazil, the states, the abroad total and the abroad
// cities, then publishes a new summary.
func (p *Poller) RunFastOnce(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, p.opt.CycleTimeout)
	defer cancel()

	// phase 1: Brazil, states and abroad total — published as soon as they arrive
	paths := map[string]string{"br": brPath(), "uf:zz": ufPath("zz")}
	for _, uf := range p.opt.UFs {
		paths["uf:"+uf] = ufPath(uf)
	}
	if err := p.publish(p.fetchAll(ctx, paths, fastConcurrency), len(paths)); err != nil {
		return err
	}

	// phase 2: abroad cities (countries are built from them)
	cityPaths := make(map[string]string, len(p.abroad))
	for _, c := range p.abroad {
		cityPaths["city:"+c.Code] = munPath("zz", c.Code)
	}
	return p.publish(p.fetchAll(ctx, cityPaths, fastConcurrency), len(cityPaths))
}

// publish merges fetched files into the last known state and stores a new
// summary. Without the BR file it only counts a failure.
func (p *Poller) publish(results []fetched, total int) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	var br *fetched
	var zz entities.AreaResult
	failed := 0
	for i := range results {
		f := results[i]
		if f.err != nil {
			failed++
			continue
		}
		switch {
		case f.key == "br":
			br = &results[i]
		case f.key == "uf:zz":
			zz = f.res
		case strings.HasPrefix(f.key, "city:"):
			p.cities[f.key[5:]] = f.res
		default:
			p.ufs[f.key[3:]] = f.res
		}
	}

	isCityPhase := total > 0 && len(results) > 0 && strings.HasPrefix(results[0].key, "city:")
	if br == nil && isCityPhase {
		if !p.hasLast {
			return nil
		}
		br = &fetched{res: p.last.BR, cand: p.last.Candidates}
	}
	if br == nil {
		p.failures++
		if p.hasLast && p.failures >= staleAfter && !p.last.Stale {
			p.last.Stale = true
			p.store.SetSummary(p.last)
		}
		return fmt.Errorf("brazil total unavailable (%d/%d files failed)", failed, total)
	}
	if !isCityPhase {
		p.failures = 0
	}
	if zz == (entities.AreaResult{}) && p.hasLast {
		zz = p.last.ZZ
	}

	ufs := make(map[string]entities.AreaResult, len(p.opt.UFs))
	parts := make([]entities.AreaResult, 0, len(p.opt.UFs))
	for _, uf := range p.opt.UFs {
		if r, ok := p.ufs[uf]; ok {
			ufs[uf] = r
			parts = append(parts, r)
		}
	}
	cities := make(map[string]entities.AreaResult, len(p.cities))
	for k, v := range p.cities {
		cities[k] = v
	}

	now := time.Now().UTC()
	stale := isCityPhase && p.last.Stale
	p.last = entities.Snapshot{
		UpdatedAt:  now,
		Stale:      stale,
		Candidates: br.cand,
		BR:         br.res,
		BRUfsSum:   usecases.SumResults(parts...),
		ZZ:         zz,
		UFs:        ufs,
		Countries:  usecases.BuildCountries(p.abroad, cities),
	}
	p.hasLast = true
	p.store.SetSummary(p.last)
	p.store.SetAbroadCities(cities, now)
	return nil
}

// SweepMunicipalitiesOnce refreshes every municipality, one state at a time,
// publishing each state as soon as it is done.
func (p *Poller) SweepMunicipalitiesOnce(ctx context.Context) error {
	for _, uf := range p.opt.UFs {
		if err := ctx.Err(); err != nil {
			return err
		}
		p.mu.Lock()
		list := p.munis[uf]
		p.mu.Unlock()
		if len(list) == 0 {
			continue
		}
		paths := make(map[string]string, len(list))
		for _, m := range list {
			paths[m.IBGECode] = munPath(uf, m.TSECode)
		}
		results := p.fetchAll(ctx, paths, p.opt.MunConcurrency)

		p.mu.Lock()
		prev := p.munResults[uf]
		items := make(map[string]entities.AreaResult, len(list))
		for _, f := range results {
			if f.err == nil {
				items[f.key] = f.res
			} else if r, ok := prev[f.key]; ok {
				items[f.key] = r
			}
		}
		p.munResults[uf] = items
		p.mu.Unlock()
		p.store.SetMunicipalities(uf, items, time.Now().UTC())
	}
	return nil
}
