import { ExecutionContext } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

const mockFindById = jest.fn();
const mockUsersRepo = { findById: mockFindById } as never;
const mockListWorldIds = jest.fn().mockResolvedValue([]);
const mockElevationService = {
  listWorldIdsForUser: mockListWorldIds,
} as never;

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function activeUser(extra: Record<string, unknown> = {}) {
  return { id: 'u1', isDeleted: false, ...extra };
}

describe('OptionalJwtAuthGuard', () => {
  let guard: OptionalJwtAuthGuard;

  beforeEach(() => {
    guard = new OptionalJwtAuthGuard(mockUsersRepo, mockElevationService);
    jest.clearAllMocks();
    mockFindById.mockResolvedValue(activeUser({ role: 5 }));
    mockListWorldIds.mockResolvedValue([]);
  });

  describe('handleRequest (anonymní kontrakt — nehází)', () => {
    it('vrátí user pokud je validní token', () => {
      const user = { id: 'u1', email: 'a@a.com' };
      expect(guard.handleRequest(null, user)).toEqual(user);
    });
    it('vrátí undefined pokud token chybí (user = false)', () => {
      expect(
        guard.handleRequest(null, false as unknown as never),
      ).toBeUndefined();
    });
    it('vrátí undefined při chybě (invalid token)', () => {
      expect(
        guard.handleRequest(new Error('invalid'), null as unknown as never),
      ).toBeUndefined();
    });
  });

  describe('PT-35e · freshness role + degradace nepoužitelného účtu', () => {
    async function run(reqUser: Record<string, unknown>) {
      jest
        .spyOn(
          Object.getPrototypeOf(OptionalJwtAuthGuard.prototype),
          'canActivate',
        )
        .mockResolvedValue(true);
      const ctx = makeContext(reqUser);
      await guard.canActivate(ctx);
      return reqUser;
    }

    it('přepíše roli ze staré JWT čerstvou rolí z DB (demotovaný admin ztratí elevaci)', async () => {
      // DB: už NENÍ admin (role 5). Stará JWT ještě nese admin (role 2).
      mockFindById.mockResolvedValue(activeUser({ role: 5 }));
      const user = await run({ id: 'u1', role: 2 });

      expect(user.role).toBe(5);
      expect(mockListWorldIds).not.toHaveBeenCalled(); // žádná admin elevace
    });

    it('čerstvý admin (DB role Admin) elevaci dostane', async () => {
      mockFindById.mockResolvedValue(activeUser({ role: 2 }));
      mockListWorldIds.mockResolvedValue(['w1']);
      const user = await run({ id: 'u1', role: 2 });

      expect(mockListWorldIds).toHaveBeenCalledWith('u1');
      expect(user.elevatedWorldIds).toEqual(['w1']);
    });

    it('zabanovaný účet s platným tokenem → degradace na anonyma (user = undefined)', async () => {
      mockFindById.mockResolvedValue(
        activeUser({ role: 2, bannedAt: new Date() }),
      );
      const req: { user?: unknown } = { user: { id: 'u1', role: 2 } };
      jest
        .spyOn(
          Object.getPrototypeOf(OptionalJwtAuthGuard.prototype),
          'canActivate',
        )
        .mockResolvedValue(true);
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext);

      expect(req.user).toBeUndefined();
      expect(mockListWorldIds).not.toHaveBeenCalled();
    });

    it('smazaný účet → degradace na anonyma', async () => {
      mockFindById.mockResolvedValue(null);
      const req: { user?: unknown } = { user: { id: 'gone', role: 5 } };
      jest
        .spyOn(
          Object.getPrototypeOf(OptionalJwtAuthGuard.prototype),
          'canActivate',
        )
        .mockResolvedValue(true);
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext);

      expect(req.user).toBeUndefined();
    });
  });
});
