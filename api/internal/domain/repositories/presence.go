package repositories

// PresenceTracker counts the browser tabs that sent a heartbeat recently.
// It keeps only opaque tab ids, never anything that identifies a person.
type PresenceTracker interface {
	// Seen records a heartbeat from the tab id.
	Seen(id string)
	// Count returns how many tabs are online.
	Count() int
}
