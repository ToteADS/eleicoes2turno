// Package config loads settings from the environment (and an optional .env).
// Every value here is public; the app needs no secrets.
package config

import (
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/joho/godotenv"
)

// Config holds the runtime settings.
type Config struct {
	Port            string
	StaticDir       string
	AllowedOrigin   string
	TrustCloudflare bool

	TSEBaseURL     string
	FastInterval   time.Duration
	MunConcurrency int

	AdsenseClient      string
	AdsenseSlotResults string
	AdsenseSlotMobile  string
	HouseAdImage       string
	HouseAdLink        string
	HouseAdAlt         string
}

var (
	once     sync.Once
	instance *Config
)

// Get returns the process-wide config, loading it on first use.
func Get() *Config {
	once.Do(func() {
		_ = godotenv.Load() // .env is optional; real deployments use env vars
		c := Load()
		instance = &c
	})
	return instance
}

// Load reads the config from the current environment.
func Load() Config {
	return Config{
		Port:            str("PORT", "8080"),
		StaticDir:       str("STATIC_DIR", "../web/dist"),
		AllowedOrigin:   str("ALLOWED_ORIGIN", "https://eleicoes2turno.tapp.solutions"),
		TrustCloudflare: boolean("TRUST_CLOUDFLARE", false),

		TSEBaseURL:     str("TSE_BASE_URL", "https://resultados.tse.jus.br/oficial"),
		FastInterval:   duration("FAST_INTERVAL", 30*time.Second),
		MunConcurrency: positive("MUN_CONCURRENCY", 4),

		AdsenseClient:      str("ADSENSE_CLIENT", ""),
		AdsenseSlotResults: str("ADSENSE_SLOT_RESULTS", ""),
		AdsenseSlotMobile:  str("ADSENSE_SLOT_MOBILE", ""),
		HouseAdImage:       str("HOUSE_AD_IMAGE", "/ads/tapp-banner.svg"),
		HouseAdLink:        str("HOUSE_AD_LINK", "https://tapp.solutions"),
		HouseAdAlt:         str("HOUSE_AD_ALT", "Tapp Solutions"),
	}
}

func str(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func boolean(key string, def bool) bool {
	if v, err := strconv.ParseBool(os.Getenv(key)); err == nil {
		return v
	}
	return def
}

func duration(key string, def time.Duration) time.Duration {
	if v, err := time.ParseDuration(os.Getenv(key)); err == nil && v > 0 {
		return v
	}
	return def
}

func positive(key string, def int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil && v > 0 {
		return v
	}
	return def
}
