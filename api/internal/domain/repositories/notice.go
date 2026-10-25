package repositories

import "eleicoes2turno/internal/domain/entities"

// NoticeStore keeps the current site-wide notice, if any.
type NoticeStore interface {
	// Get returns the notice and whether one is set.
	Get() (entities.Notice, bool)
	// Set replaces the notice.
	Set(n entities.Notice)
	// Clear removes the notice.
	Clear()
}
