import { detectLocale, setLocale, t } from './index';
import pt from './pt.json';
import en from './en.json';
import es from './es.json';

describe('i18n', () => {
  it('defaults to Portuguese', () => {
    setLocale('pt');
    expect(t('filters_country')).toBe('País');
  });
  it('switches locale', () => {
    setLocale('en');
    expect(t('filters_country')).toBe('Country');
    setLocale('pt');
  });
  it('falls back to the key when missing', () => {
    expect(t('nope_missing' as never)).toBe('nope_missing');
  });
  it('replaces placeholders', () => {
    setLocale('pt');
    expect(t('status_updated', { time: '17:30' })).toContain('17:30');
  });
  it('detects locale from the browser language', () => {
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('es-AR')).toBe('es');
    expect(detectLocale('fr-FR')).toBe('pt');
  });
  it('all locales have the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    expect(Object.keys(es).sort()).toEqual(Object.keys(pt).sort());
  });
});
