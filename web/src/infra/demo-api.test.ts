import type { AreaListResponse, AreaResult, Summary } from '../domain/types';
import type { AppDeps } from '../presenter/app';
import { bump, demoApi } from './demo-api';

const r = (l: number, f: number, released = true): AreaResult => ({ el: 1000, comp: l + f + 30, abst: 10, vv: l + f, vb: 10, vn: 20, l, f, st: 50, ts: 100, dg: '', hg: '', released });
const summary: Summary = { updatedAt: '', stale: false, candidates: [], br: r(600, 400), brUfsSum: r(600, 400), zz: r(1, 1), ufs: { ba: r(70, 30) }, countries: { '392': r(1, 3) } };
const list = (): AreaListResponse => ({ updatedAt: '', items: { a: r(10, 10) } });

describe('demo api (dev only)', () => {
  it('bump grows the counts consistently and moves the sections on', () => {
    const b = bump(r(600, 400), () => 0.5);
    expect([b.l, b.f, b.vv, b.comp, b.st]).toEqual([636, 424, 1060, 1060 + b.vb + b.vn, 53]);
    expect(bump(r(1, 1, false))).toEqual(r(1, 1, false));
    expect(bump({ ...r(1, 1), st: 100 }).st).toBe(100);
  });

  it('first answers are the real ones, later ones move on from the last', async () => {
    const calls: string[] = [];
    const api: AppDeps['api'] = {
      summary: () => { calls.push('summary'); return Promise.resolve(summary); },
      municipalities: (uf) => { calls.push(uf); return Promise.resolve(list()); },
      abroadCities: () => { calls.push('abroad'); return Promise.resolve(list()); },
      config: () => Promise.resolve({ ads: { adsenseClient: '', slotResults: '', slotMobile: '', house: { image: '', link: '', alt: '' } } }),
      presence: () => Promise.resolve({ online: 1 }),
      notice: () => Promise.resolve(null),
    };
    const demo = demoApi(api, () => 0.5);
    expect(await demo.summary()).toBe(summary);
    const second = await demo.summary();
    expect(second.br.l).toBe(636);
    expect((await demo.summary()).br.l).toBe(674);
    expect((await demo.municipalities('ba')).items.a.l).toBe(10);
    expect((await demo.municipalities('ba')).items.a.l).toBe(11);
    expect((await demo.abroadCities()).items.a.l).toBe(10);
    expect((await demo.abroadCities()).items.a.l).toBe(11);
    expect(calls).toEqual(['summary', 'ba', 'abroad']);
    expect((await demo.presence({ toJson: () => ({ id: 'x' }) } as never)).online).toBe(1);
    expect(await demo.notice()).toBeNull();
    expect((await demo.config()).ads.adsenseClient).toBe('');
  });
});
