import { defaultMapOptions, type MapOptions } from '../domain/map-options';

const TYPE = 'mapa';
const LABELS = 'urnas';

/** `?mapa=votos` = "Mais votos", `?urnas=1` = section labels on; anything else is the default. */
export function readMapOptions(search: string): MapOptions {
  const q = new URLSearchParams(search);
  return { type: q.get(TYPE) === 'votos' ? 'leader' : 'share', sectionLabels: q.get(LABELS) === '1' };
}

/** Path + query + hash of `href` with `o`; defaults leave the URL clean (like `?turno`). */
export function mapOptionsUrl(href: string, o: MapOptions): string {
  const url = new URL(href);
  const d = defaultMapOptions();
  if (o.type !== d.type) url.searchParams.set(TYPE, 'votos');
  else url.searchParams.delete(TYPE);
  if (o.sectionLabels !== d.sectionLabels) url.searchParams.set(LABELS, '1');
  else url.searchParams.delete(LABELS);
  return url.pathname + url.search + url.hash;
}
