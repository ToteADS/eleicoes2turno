import { PresenceDto } from './presence-dto';

describe('PresenceDto', () => {
  it('serializes only the tab id', () => {
    expect(new PresenceDto('3f2b9c1e-7a4d-4e8b-9c2a-1b2c3d4e5f60').toJson()).toEqual({ id: '3f2b9c1e-7a4d-4e8b-9c2a-1b2c3d4e5f60' });
  });
});
