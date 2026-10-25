const KEY = 'presence-tab-id';
const VALID = /^[A-Za-z0-9-]{8,64}$/;

type TabStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface TabIdDeps {
  storage?: () => TabStorage;
  uuid?: () => string;
}

/** Same rule as the API: 8–64 characters of [A-Za-z0-9-]. */
export const isTabId = (id: string | null): id is string => id !== null && VALID.test(id);

/** randomUUID is missing outside secure contexts (plain http on a LAN), so fall back to 128 random bits. */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Random id of this browser tab, kept in sessionStorage so a reload counts as
 * the same visitor. Where storage is blocked the id lives only in memory.
 */
export function tabId({ storage = () => sessionStorage, uuid = randomId }: TabIdDeps = {}): string {
  try {
    const stored = storage().getItem(KEY);
    if (isTabId(stored)) return stored;
  } catch {
    return uuid();
  }
  const id = uuid();
  try {
    storage().setItem(KEY, id);
  } catch {
    // private mode or blocked site data: the in-memory id is enough
  }
  return id;
}
