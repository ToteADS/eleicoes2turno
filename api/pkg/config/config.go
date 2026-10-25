// Package config loads settings from the environment (and an optional .env).
// Every value here is public except NoticeAdminToken, which guards the
// notice write endpoints and must only come from the environment.
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
	MunPace        time.Duration
	AbroadEvery    int

	AdsenseClient      string
	AdsenseSlotResults string
	AdsenseSlotMobile  string
	HouseAdImage       string
	HouseAdLink        string
	HouseAdAlt         string

	// NoticeAdminToken enables PUT/DELETE /api/v1/notice ("" disables them).
	NoticeAdminToken string
	// Notice seeded at boot (NoticeTitle "" seeds none), so a restart keeps it.
	NoticeTitle     string
	NoticeBody      string
	NoticeLinkURL   string
	NoticeLinkLabel string
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

		TSEBaseURL:   str("TSE_BASE_URL", "https://resultados.tse.jus.br/oficial"),
		FastInterval: duration("FAST_INTERVAL", 30*time.Second),
		// The TSE throttles heavy clients: the sweep defaults to ~2 requests/s.
		MunConcurrency: positive("MUN_CONCURRENCY", 1),
		MunPace:        duration("MUN_PACE", 500*time.Millisecond),
		AbroadEvery:    positive("ABROAD_EVERY", 4),

		AdsenseClient:      str("ADSENSE_CLIENT", ""),
		AdsenseSlotResults: str("ADSENSE_SLOT_RESULTS", ""),
		AdsenseSlotMobile:  str("ADSENSE_SLOT_MOBILE", ""),
		HouseAdImage:       str("HOUSE_AD_IMAGE", "/ads/tapp-banner-v2.svg"),
		HouseAdLink:        str("HOUSE_AD_LINK", "https://tapp.solutions"),
		HouseAdAlt:         str("HOUSE_AD_ALT", "Tapp Solutions"),

		NoticeAdminToken: str("NOTICE_ADMIN_TOKEN", ""),
		NoticeTitle:      str("NOTICE_TITLE", ""),
		NoticeBody:       str("NOTICE_BODY", ""),
		NoticeLinkURL:    str("NOTICE_LINK_URL", ""),
		NoticeLinkLabel:  str("NOTICE_LINK_LABEL", ""),
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
