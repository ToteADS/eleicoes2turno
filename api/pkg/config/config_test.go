package config

import (
	"testing"
	"time"
)

func TestLoad_Defaults(t *testing.T) {
	for _, k := range []string{"PORT", "FAST_INTERVAL", "MUN_CONCURRENCY", "TRUST_CLOUDFLARE", "ADSENSE_CLIENT", "HOUSE_AD_LINK"} {
		t.Setenv(k, "")
	}
	c := Load()
	if c.Port != "8080" || c.FastInterval != 30*time.Second || c.MunConcurrency != 4 || c.TrustCloudflare {
		t.Errorf("defaults = %+v", c)
	}
	if c.TSEBaseURL != "https://resultados.tse.jus.br/oficial" || c.AllowedOrigin != "https://eleicoes2turno.tapp.solutions" {
		t.Errorf("defaults = %+v", c)
	}
	if c.HouseAdLink != "https://tapp.solutions" || c.HouseAdImage != "/ads/tapp-banner.svg" || c.AdsenseClient != "" {
		t.Errorf("ad defaults = %+v", c)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	t.Setenv("PORT", "9000")
	t.Setenv("FAST_INTERVAL", "45s")
	t.Setenv("MUN_CONCURRENCY", "2")
	t.Setenv("TRUST_CLOUDFLARE", "true")
	t.Setenv("ADSENSE_CLIENT", "ca-pub-9424129340132469")
	c := Load()
	if c.Port != "9000" || c.FastInterval != 45*time.Second || c.MunConcurrency != 2 || !c.TrustCloudflare {
		t.Errorf("env = %+v", c)
	}
	if c.AdsenseClient != "ca-pub-9424129340132469" {
		t.Errorf("adsense = %q", c.AdsenseClient)
	}
}

func TestLoad_InvalidValuesFallBack(t *testing.T) {
	t.Setenv("FAST_INTERVAL", "soon")
	t.Setenv("MUN_CONCURRENCY", "-3")
	t.Setenv("TRUST_CLOUDFLARE", "maybe")
	c := Load()
	if c.FastInterval != 30*time.Second || c.MunConcurrency != 4 || c.TrustCloudflare {
		t.Errorf("fallbacks = %+v", c)
	}
}

func TestGet_Singleton(t *testing.T) {
	if Get() != Get() {
		t.Error("Get must return the same instance")
	}
}
