import { LABEL_FONT_PX, renderLabelImage } from './label-image';

describe('renderLabelImage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is null without a 2D canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(renderLabelImage('37,5%')).toBeNull();
  });

  it('draws dark text over a white halo, sized to the text at the pixel ratio', () => {
    const calls: string[] = [];
    const ctx = {
      font: '', textAlign: '', textBaseline: '', lineJoin: '', lineWidth: 0, strokeStyle: '', fillStyle: '',
      measureText: (t: string) => ({ width: t.length * 7 * 2 }),
      strokeText: () => calls.push(`stroke:${ctx.strokeStyle}:${ctx.lineWidth}`),
      fillText: (t: string) => calls.push(`fill:${ctx.fillStyle}:${t}`),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const img = renderLabelImage('37,5%', 2)!;
    expect(img.pixelRatio).toBe(2);
    expect(img.width).toBe(Math.ceil(5 * 14 + 2 * 5 + 4));
    expect(img.height).toBe(Math.ceil(LABEL_FONT_PX * 2 * 1.25 + 10));
    expect(img.data.length).toBe(img.width * img.height * 4);
    expect(ctx.font).toContain('Archivo');
    expect(ctx.font).toContain(`${LABEL_FONT_PX * 2}px`);
    expect(calls).toEqual(['stroke:rgba(255,255,255,0.95):10', 'fill:#111418:37,5%']); // halo first, text on top
  });

  it('uses the screen pixel ratio, capped at 2', () => {
    const ctx = { measureText: () => ({ width: 10 }), strokeText() {}, fillText() {}, getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('devicePixelRatio', 3);
    expect(renderLabelImage('1%')!.pixelRatio).toBe(2);
    vi.stubGlobal('devicePixelRatio', 0);
    expect(renderLabelImage('1%')!.pixelRatio).toBe(1);
    vi.unstubAllGlobals();
  });
});
