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
	"eleicoes2turno/internal/domain/entities"
	"eleicoes2turno/internal/domain/services"
	"eleicoes2turno/internal/infra/cache"
	"eleicoes2turno/internal/infra/tse"
	"eleicoes2turno/internal/presentation/middlewares"
	"eleicoes2turno/internal/presentation/routes"
	"eleicoes2turno/pkg/config"
	"eleicoes2turno/pkg/logger"
)

const catalogPath = "ele2026/6258/config/mun-e006258-cm.json"

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
	client := tse.NewClient(cfg.TSEBaseURL, 15*time.Second)
	go startPolling(ctx, log, cfg, client, store, abroad)

	limiter := middlewares.NewRateLimiter(20, 40, cfg.TrustCloudflare)
	limiter.StartCleanup(time.Minute, ctx.Done())

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           routes.New(routes.Deps{Config: *cfg, Store: store, RateLimiter: limiter}),
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
	log.Info("stopped")
}

// startPolling loads the TSE municipality catalog (retrying until it works)
// and then runs the poller until ctx ends.
func startPolling(ctx context.Context, log *slog.Logger, cfg *config.Config, client *tse.Client,
	store *cache.MemoryStore, abroad []entities.AbroadCity) {
	var catalog []entities.Municipality
	for catalog == nil {
		body, _, err := client.Fetch(ctx, catalogPath)
		if err == nil {
			catalog, err = tse.ParseCatalog(body)
		}
		if err != nil {
			log.Warn("load catalog, retrying", "err", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(10 * time.Second):
			}
		}
	}
	log.Info("catalog loaded", "entries", len(catalog))
	services.NewPoller(client, store, catalog, abroad, services.PollerOptions{
		FastInterval: cfg.FastInterval, MunConcurrency: cfg.MunConcurrency, Logger: log, Parse: tse.ParseResult,
	}).Run(ctx)
}
