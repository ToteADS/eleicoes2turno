import type { Notice } from '../domain/types';

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const httpsOnly = (v: string): string => {
  try {
    return new URL(v).protocol === 'https:' ? v : '';
  } catch {
    return '';
  }
};

/**
 * Reads the `notice` field of GET /api/v1/notice. Anything malformed counts as
 * no notice, and a link that is not https is dropped (defense in depth: the API
 * validates it too).
 */
export function noticeFromJson(raw: unknown): Notice | null {
  const n = (raw as { notice?: unknown } | null)?.notice;
  if (!n || typeof n !== 'object') return null;
  const o = n as Record<string, unknown>;
  const title = str(o.title);
  if (!title) return null;
  return { title, body: str(o.body), linkUrl: httpsOnly(str(o.linkUrl)), linkLabel: str(o.linkLabel), updatedAt: str(o.updatedAt) };
}
