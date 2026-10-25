import { CreatorCredit } from './creator-credit';

describe('CreatorCredit', () => {
  it('links the creator to the portfolio in a new tab', () => {
    const el = document.createElement('div');
    new CreatorCredit(el).render();
    const a = el.querySelector('a')!;
    expect(a.href).toBe('https://aristoteles.tapp.solutions/');
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
    expect(a.textContent).toContain('Aristóteles Araújo');
    expect(a.textContent).toContain('Criado por');
    expect(a.querySelector('img')!.getAttribute('src')).toBe('/brand/aristoteles.webp');
  });
});
