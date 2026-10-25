import type { Summary } from '../domain/types';

/** Our data is older than this, or polls keep failing: warn the visitor. */
const MAX_AGE_MS = 2 * 60_000;
const MAX_FAILED_POLLS = 2;

export function isStale(summary: Summary | null, failedPolls: number, now = Date.now()): boolean {
  if (!summary) return false;
  return summary.stale || failedPolls >= MAX_FAILED_POLLS || now - Date.parse(summary.updatedAt) > MAX_AGE_MS;
}
