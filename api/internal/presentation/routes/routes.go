// Package routes wires handlers and middlewares into the HTTP router.
package routes

import (
	"net/http"

	"github.com/gorilla/mux"

	"eleicoes2turno/internal/domain/repositories"
	"eleicoes2turno/internal/presentation/handlers"
	"eleicoes2turno/internal/presentation/middlewares"
	"eleicoes2turno/pkg/config"
	"eleicoes2turno/pkg/response"
)

// Per-IP API limits. A page load makes ~3 API calls, then one every 30 s.
const (
	apiRPS   = 20
	apiBurst = 40
)

// Deps are the router's dependencies.
type Deps struct {
	Config      config.Config
	Store       repositories.ResultStore
	RateLimiter *middlewares.RateLimiter
}

// New builds the full HTTP handler.
func New(d Deps) http.Handler {
	cfg := d.Config
	if d.RateLimiter == nil {
		d.RateLimiter = middlewares.NewRateLimiter(apiRPS, apiBurst, cfg.TrustCloudflare)
	}
	data := handlers.NewData(d.Store)

	r := mux.NewRouter()

	api := r.PathPrefix("/api/v1").Subrouter()
	api.Use(d.RateLimiter.Middleware, middlewares.CORS(cfg.AllowedOrigin))
	api.HandleFunc("/summary", data.Summary).Methods(http.MethodGet)
	api.HandleFunc("/abroad/cities", data.AbroadCities).Methods(http.MethodGet)
	api.HandleFunc("/uf/{uf}/municipalities", data.Municipalities).Methods(http.MethodGet)
	api.Handle("/config", handlers.NewPublicConfig(handlers.AdsConfig{
		AdsenseClient: cfg.AdsenseClient, SlotResults: cfg.AdsenseSlotResults, SlotMobile: cfg.AdsenseSlotMobile,
		HouseImage: cfg.HouseAdImage, HouseLink: cfg.HouseAdLink, HouseAlt: cfg.HouseAdAlt,
	})).Methods(http.MethodGet)
	api.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		response.Error(w, http.StatusNotFound, "not_found")
	})

	r.HandleFunc("/healthz", handlers.Health).Methods(http.MethodGet)
	r.Handle("/ads.txt", handlers.AdsTxt(cfg.AdsenseClient)).Methods(http.MethodGet)
	r.PathPrefix("/").Handler(handlers.Static(cfg.StaticDir)).Methods(http.MethodGet, http.MethodHead)
	// wrap the whole router so not-found and method-not-allowed responses get the headers too
	return middlewares.SecurityHeaders(middlewares.BuildCSP(cfg.AdsenseClient != ""))(r)
}
