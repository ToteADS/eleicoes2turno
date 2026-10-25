package repositories

import "context"

// ResultSource fetches a TSE file by its path under the "oficial" base.
// notModified is true when the file did not change since the last fetch;
// body is then the previously fetched content.
type ResultSource interface {
	Fetch(ctx context.Context, path string) (body []byte, notModified bool, err error)
}
