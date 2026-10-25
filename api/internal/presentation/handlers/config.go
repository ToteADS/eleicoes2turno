package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"eleicoes2turno/pkg/response"
)

// AdsConfig is the public ad setup sent to the browser.
type AdsConfig struct {
	AdsenseClient string
	SlotResults   string
	SlotMobile    string
	HouseImage    string
	HouseLink     string
	HouseAlt      string
}

type houseAd struct {
	Image string `json:"image"`
	Link  string `json:"link"`
	Alt   string `json:"alt"`
}

type publicConfig struct {
	Ads struct {
		AdsenseClient string  `json:"adsenseClient"`
		SlotResults   string  `json:"slotResults"`
		SlotMobile    string  `json:"slotMobile"`
		House         houseAd `json:"house"`
	} `json:"ads"`
}

// NewPublicConfig serves GET /api/v1/config.
func NewPublicConfig(ads AdsConfig) http.Handler {
	var c publicConfig
	c.Ads.AdsenseClient, c.Ads.SlotResults, c.Ads.SlotMobile = ads.AdsenseClient, ads.SlotResults, ads.SlotMobile
	c.Ads.House = houseAd{Image: ads.HouseImage, Link: ads.HouseLink, Alt: ads.HouseAlt}
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=300")
		response.JSON(w, http.StatusOK, c)
	})
}

// AdsTxt serves /ads.txt for the AdSense publisher, or 404 when ads are off.
func AdsTxt(adsenseClient string) http.Handler {
	pub := strings.TrimPrefix(adsenseClient, "ca-")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if pub == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		_, _ = fmt.Fprintf(w, "google.com, %s, DIRECT, f08c47fec0942fa0\n", pub)
	})
}

// Health serves GET /healthz.
func Health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte("ok"))
}
