package entities

// AbroadCity is a city abroad with polling stations. The TSE has no country
// grouping; Country and ISO come from our own table (api/assets).
type AbroadCity struct {
	Code    string  `json:"cd"`
	Name    string  `json:"nm"`
	Country string  `json:"country"`
	ISO     int     `json:"iso"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
}

// Municipality is one entry of the TSE catalog. Abroad cities have UF "zz"
// and no IBGE code.
type Municipality struct {
	UF       string
	TSECode  string
	IBGECode string
	Name     string
}
