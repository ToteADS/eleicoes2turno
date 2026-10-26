import type { MapOptions } from '../domain/map-options';
import { setLocale } from '../i18n';
import { MapOptionsControl } from './map-options-control';
import { mapOptionsUrl, readMapOptions } from './map-options-url';

describe('map options in the URL', () => {
  it('reads ?mapa=votos and ?urnas=1, defaults otherwise', () => {
    expect(readMapOptions('')).toEqual({ type: 'share', sectionLabels: false });
    expect(readMapOptions('?mapa=votos&urnas=1')).toEqual({ type: 'leader', sectionLabels: true });
    expect(readMapOptions('?mapa=x&urnas=0&turno=1')).toEqual({ type: 'share', sectionLabels: false });
  });

  it('writes only what differs from the defaults and keeps the rest of the URL', () => {
    expect(mapOptionsUrl('https://x.app/?turno=1#a', { type: 'leader', sectionLabels: true })).toBe('/?turno=1&mapa=votos&urnas=1#a');
    expect(mapOptionsUrl('https://x.app/?mapa=votos&urnas=1', { type: 'share', sectionLabels: false })).toBe('/');
    expect(mapOptionsUrl('https://x.app/?urnas=1', { type: 'share', sectionLabels: true })).toBe('/?urnas=1');
  });
});

describe('MapOptionsControl', () => {
  let el: HTMLElement;
  const type = () => el.querySelector<HTMLSelectElement>('#fMapType')!;
  const box = () => el.querySelector<HTMLInputElement>('#fSections')!;
  beforeEach(() => {
    setLocale('pt');
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => {
    el.remove();
    setLocale('pt');
  });

  it('renders the type select (Porcentagem first) and an unchecked switch by default', () => {
    const c = new MapOptionsControl(el);
    c.render({ type: 'share', sectionLabels: false }, true);
    expect([...type().options].map((o) => [o.value, o.textContent])).toEqual([['share', 'Porcentagem'], ['leader', 'Mais votos']]);
    expect(type().value).toBe('share');
    expect(box().checked).toBe(false);
    expect(box().getAttribute('role')).toBe('switch');
    expect(el.textContent).toContain('Tipo de mapa');
    expect(el.textContent).toContain('Mostrar % de urnas apuradas');
    expect(el.hidden).toBe(false);
  });

  it('shows the given options and hides itself when they do not apply', () => {
    const c = new MapOptionsControl(el);
    c.render({ type: 'leader', sectionLabels: true }, false);
    expect(type().value).toBe('leader');
    expect(box().checked).toBe(true);
    expect(el.hidden).toBe(true);
  });

  it('reports a new type or switch state, keeping the other option', () => {
    const c = new MapOptionsControl(el);
    const got: MapOptions[] = [];
    c.onChange((o) => got.push(o));
    c.render({ type: 'share', sectionLabels: true }, true);
    type().value = 'leader';
    type().dispatchEvent(new Event('change'));
    box().checked = false;
    box().dispatchEvent(new Event('change'));
    expect(got).toEqual([{ type: 'leader', sectionLabels: true }, { type: 'share', sectionLabels: false }]);
  });

  it('is translated', () => {
    setLocale('en');
    new MapOptionsControl(el).render({ type: 'share', sectionLabels: false }, true);
    expect(el.textContent).toContain('Map type');
    expect(el.textContent).toContain('Most votes');
    setLocale('es');
    new MapOptionsControl(el).render({ type: 'share', sectionLabels: false }, true);
    expect(el.textContent).toContain('Más votos');
    expect(el.textContent).toContain('Mostrar % de urnas escrutadas');
  });
});
