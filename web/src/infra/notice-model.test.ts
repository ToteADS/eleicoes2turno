import { noticeFromJson } from './notice-model';

describe('noticeFromJson', () => {
  it('reads a full notice', () => {
    expect(noticeFromJson({ notice: { title: ' Aviso ', body: 'Corpo', linkUrl: 'https://www.tse.jus.br/x', linkLabel: 'Saiba mais', updatedAt: '2026-10-25T20:00:00Z' } }))
      .toEqual({ title: 'Aviso', body: 'Corpo', linkUrl: 'https://www.tse.jus.br/x', linkLabel: 'Saiba mais', updatedAt: '2026-10-25T20:00:00Z' });
  });

  it('fills missing optional fields', () => {
    expect(noticeFromJson({ notice: { title: 'Aviso' } })).toEqual({ title: 'Aviso', body: '', linkUrl: '', linkLabel: '', updatedAt: '' });
  });

  it('treats null and malformed answers as no notice', () => {
    for (const raw of [null, undefined, 'x', {}, { notice: null }, { notice: 'x' }, { notice: {} }, { notice: { title: '  ' } }, { notice: { title: 5 } }]) {
      expect(noticeFromJson(raw)).toBeNull();
    }
  });

  it('drops links that are not https', () => {
    for (const linkUrl of ['javascript:alert(1)', 'http://a.com', '/relative', 'not a url', 42]) {
      expect(noticeFromJson({ notice: { title: 'Aviso', linkUrl } })?.linkUrl).toBe('');
    }
  });
});
