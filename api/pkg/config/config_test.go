package config

import (
	"testing"
	"time"
)

func TestLoad_Defaults(t *testing.T) {
	for _, k := range []string{"PORT", "FAST_INTERVAL", "MUN_CONCURRENCY", "MUN_PACE", "ABROAD_EVERY", "TRUST_CLOUDFLARE", "ADSENSE_CLIENT", "HOUSE_AD_LINK"} {
		t.Setenv(k, "")
	}
	c := Load()
	if c.Port != "8080" || c.FastInterval != 30*time.Second || c.MunConcurrency != 1 || c.TrustCloudflare {
		t.Errorf("defaults = %+v", c)
	}
	if c.MunPace != 500*time.Millisecond || c.AbroadEvery != 4 {
		t.Errorf("TSE pacing defaults = %v / %d", c.MunPace, c.AbroadEvery)
	}
	if c.TSEBaseURL != "https://resultados.tse.jus.br/oficial" || c.AllowedOrigin != "https://eleicoes2turno.tapp.solutions" {
		t.Errorf("defaults = %+v", c)
	}
	if c.HouseAdLink != "https://tapp.solutions" || c.HouseAdImage != "/ads/tapp-banner-v2.svg" || c.AdsenseClient != "" {
		t.Errorf("ad defaults = %+v", c)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	t.Setenv("PORT", "9000")
	t.Setenv("FAST_INTERVAL", "45s")
	t.Setenv("MUN_CONCURRENCY", "2")
	t.Setenv("MUN_PACE", "1s")
	t.Setenv("ABROAD_EVERY", "2")
	t.Setenv("TRUST_CLOUDFLARE", "true")
	t.Setenv("ADSENSE_CLIENT", "ca-pub-9424129340132469")
	c := Load()
	if c.Port != "9000" || c.FastInterval != 45*time.Second || c.MunConcurrency != 2 || !c.TrustCloudflare {
		t.Errorf("env = %+v", c)
	}
	if c.MunPace != time.Second || c.AbroadEvery != 2 {
		t.Errorf("pacing = %v / %d", c.MunPace, c.AbroadEvery)
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
	if c.FastInterval != 30*time.Second || c.MunConcurrency != 1 || c.TrustCloudflare {
		t.Errorf("fallbacks = %+v", c)
	}
}

func TestGet_Singleton(t *testing.T) {
	if Get() != Get() {
		t.Error("Get must return the same instance")
	}
}
