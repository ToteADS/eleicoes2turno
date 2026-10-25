import pt from './pt.json';
import en from './en.json';
import es from './es.json';

export type Locale = 'pt' | 'en' | 'es';
export type I18nKey = keyof typeof pt;

const dictionaries: Record<Locale, Record<string, string>> = { pt, en, es };
let current: Locale = 'pt';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Picks pt (default), en or es from a BCP-47 language tag. */
export function detectLocale(language: string): Locale {
  const base = language.toLowerCase().slice(0, 2);
  return base === 'en' || base === 'es' ? base : 'pt';
}

/** Translates key, replacing {placeholders} with vars. Missing keys come back as the key. */
export function t(key: I18nKey, vars: Record<string, string | number> = {}): string {
  const text = dictionaries[current][key] ?? dictionaries.pt[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
