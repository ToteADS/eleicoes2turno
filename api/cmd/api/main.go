// Command api polls the TSE and serves the results API and the web app.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"eleicoes2turno/assets"
	"eleicoes2turno/internal/domain/dtos"
	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/services"
	"eleicoes2turno/internal/infra/cache"
	"eleicoes2turno/internal/infra/notice"
	"eleicoes2turno/internal/infra/presence"
	"eleicoes2turno/internal/infra/tse"
	"eleicoes2turno/internal/presentation/middlewares"
	"eleicoes2turno/internal/presentation/routes"
	"eleicoes2turno/pkg/config"
	"eleicoes2turno/pkg/logger"
)

const catalogPath = "ele2026/6258/config/mun-e006258-cm.json"

// Presence counter: a tab heartbeats every 60 s and counts as online for
// 150 s (two missed beats). Expired tabs are dropped every 10 s; past 300k
// tracked tabs new ones are not added (the count is still served).
const (
	presenceTTL   = 150 * time.Second
	presencePrune = 10 * time.Second
	presenceMax   = 300_000
)

func main() {
	log := logger.New(os.Stdout)
	slog.SetDefault(log)
	cfg := config.Get()

	abroad, err := assets.AbroadCities()
	if err != nil {
		log.Error("load abroad cities", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	store := cache.NewMemoryStore()
	client := tse.NewClient(cfg.TSEBaseURL, 8*time.Second)
	go startPolling(ctx, log, cfg, client, store, abroad)

	limiter := middlewares.NewRateLimiter(30, 60, cfg.TrustCloudflare)
	limiter.StartCleanup(time.Minute, ctx.Done())
	tracker := presence.NewMemoryTracker(presenceTTL, presenceMax)
	trackerDone := tracker.Start(presencePrune, ctx.Done())
	notices := notice.NewMemoryStore()
	seedNotice(log, cfg, notices)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           routes.New(routes.Deps{Config: *cfg, Store: store, RateLimiter: limiter, Presence: tracker, Notice: notices}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 16,
	}
	go func() {
		log.Info("listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown", "err", err)
	}
	<-trackerDone
	log.Info("stopped")
}

// startPolling starts the fast cycle right away and the municipality sweep as
// soon as a catalog is known: the TSE one, or the bundled snapshot if the TSE
// does not answer at boot.
func startPolling(ctx context.Context, log *slog.Logger, cfg *config.Config, client *tse.Client,
	store *cache.MemoryStore, abroad []entities.AbroadCity) {
	poller := services.NewPoller(client, store, nil, abroad, services.PollerOptions{
		FastInterval: cfg.FastInterval, MunConcurrency: cfg.MunConcurrency, MunPace: cfg.MunPace,
		AbroadEvery: cfg.AbroadEvery, Logger: log, Parse: tse.ParseResult,
	})
	poller.SetCatalog(loadCatalog(ctx, log, client))
	poller.Run(ctx)
}

func loadCatalog(ctx context.Context, log *slog.Logger, client *tse.Client) []entities.Municipality {
	fetchCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	body, _, err := client.Fetch(fetchCtx, catalogPath)
	if err == nil {
		if cat, perr := tse.ParseCatalog(body); perr == nil {
			log.Info("catalog loaded from TSE", "entries", len(cat))
			return cat
		}
	}
	cat, perr := tse.ParseCatalog(assets.FallbackCatalog())
	if perr != nil {
		log.Error("bundled catalog unreadable", "err", perr)
		return nil
	}
	log.Warn("TSE catalog unavailable, using bundled snapshot", "err", err, "entries", len(cat))
	return cat
}

// seedNotice publishes the NOTICE_* notice from the environment, if any, so a
// restart does not drop a notice that was meant to stay up.
func seedNotice(log *slog.Logger, cfg *config.Config, store *notice.MemoryStore) {
	if cfg.NoticeTitle == "" {
		return
	}
	dto := dtos.NoticeDTO{Title: cfg.NoticeTitle, Body: cfg.NoticeBody, LinkURL: cfg.NoticeLinkURL, LinkLabel: cfg.NoticeLinkLabel}.Normalize()
	if err := dto.Validate(); err != nil {
		log.Warn("NOTICE_* env ignored", "err", err)
		return
	}
	store.Set(dto.ToEntity(time.Now()))
	log.Info("notice seeded from env")
}
