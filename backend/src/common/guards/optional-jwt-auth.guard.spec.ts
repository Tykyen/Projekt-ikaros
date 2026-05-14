import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard();
  });

  describe('handleRequest', () => {
    it('vrátí user pokud je validní token', () => {
      const user = { id: 'u1', email: 'a@a.com' };
      const result = guard.handleRequest(null, user);
      expect(result).toEqual(user);
    });

    it('vrátí undefined pokud token chybí (user = false)', () => {
      const result = guard.handleRequest(null, false as unknown as never);
      expect(result).toBeUndefined();
    });

    it('vrátí undefined pokud err nastane (např. invalid token)', () => {
      const result = guard.handleRequest(
        new Error('invalid'),
        null as unknown as never,
      );
      expect(result).toBeUndefined();
    });
  });
});
