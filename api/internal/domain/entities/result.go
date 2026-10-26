// Package entities holds the business data the API serves. Everything here is
// read-only data that comes from the TSE.
package entities

import "time"

// Candidate numbers in the presidential runoff.
const (
	NumberLula   = 13
	NumberFlavio = 22
)

// AreaResult is the vote count of one area (Brazil, a state, a municipality,
// an abroad city or an aggregated country).
type AreaResult struct {
	Electorate      int64  `json:"el"`
	Turnout         int64  `json:"comp"`
	Abstention      int64  `json:"abst"`
	Valid           int64  `json:"vv"`
	Blank           int64  `json:"vb"`
	Null            int64  `json:"vn"`
	Lula            int64  `json:"l"`
	Flavio          int64  `json:"f"`
	SectionsCounted int64  `json:"st"`
	SectionsTotal   int64  `json:"ts"`
	Date            string `json:"dg"`
	Time            string `json:"hg"`
	// Released is false while the TSE still publishes zeros (before 17h).
	Released bool `json:"released"`
	// Final is true once the TSE flags the count as finished ("tf": "s").
	Final bool `json:"final,omitempty"`
}

// Candidate identifies a runoff candidate.
type Candidate struct {
	Number int    `json:"n"`
	Name   string `json:"name"`
	Party  string `json:"party"`
	Sqcand string `json:"sqcand"`
	// Elected comes only from the TSE's own flag ("e": "s"); it is never
	// inferred from the vote count.
	Elected bool `json:"elected"`
	// Status is the TSE's status text for the candidate (e.g. "Eleito").
	Status string `json:"status"`
}

// Snapshot is the national picture served by /summary.
type Snapshot struct {
	UpdatedAt  time.Time             `json:"updatedAt"`
	Stale      bool                  `json:"stale"`
	Candidates []Candidate           `json:"candidates"`
	BR         AreaResult            `json:"br"`
	BRUfsSum   AreaResult            `json:"brUfsSum"`
	ZZ         AreaResult            `json:"zz"`
	UFs        map[string]AreaResult `json:"ufs"`
	Countries  map[int]AreaResult    `json:"countries"`
}
