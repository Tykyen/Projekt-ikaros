import { Test } from '@nestjs/testing';
import { PendingActionsService } from './pending-actions.service';
import { PendingActionType } from './pending-action-type.enum';
import { IPendingActionProvider } from './pending-action-provider.interface';
import { UserRole } from '../users/interfaces/user.interface';

function makeProvider(
  type: PendingActionType,
  opts: {
    canHandle: boolean;
    count: number;
    items?: unknown[];
  },
): IPendingActionProvider {
  return {
    type,
    canHandle: () => opts.canHandle,
    countForUser: () => Promise.resolve(opts.count),
    listForUser: () =>
      Promise.resolve({
        items: opts.items ?? [],
        total: opts.items?.length ?? 0,
      }),
  };
}

describe('PendingActionsService', () => {
  let service: PendingActionsService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [PendingActionsService],
    }).compile();
    service = mod.get(PendingActionsService);
  });

  describe('register', () => {
    it('registruje provider a vrátí ho v getRegisteredTypes', () => {
      const p = makeProvider(PendingActionType.UsernameRequest, {
        canHandle: true,
        count: 0,
      });
      service.register(p);
      expect(service.getRegisteredTypes()).toEqual([
        PendingActionType.UsernameRequest,
      ]);
    });

    it('opakovaná registrace přepíše předchozí (s warningem)', () => {
      const p1 = makeProvider(PendingActionType.UsernameRequest, {
        canHandle: true,
        count: 3,
      });
      const p2 = makeProvider(PendingActionType.UsernameRequest, {
        canHandle: true,
        count: 5,
      });
      service.register(p1);
      service.register(p2);
      expect(service.getRegisteredTypes()).toEqual([
        PendingActionType.UsernameRequest,
      ]);
    });
  });

  describe('countForUser', () => {
    it('sčítá pouze providery, kde canHandle = true', async () => {
      service.register(
        makeProvider(PendingActionType.UsernameRequest, {
          canHandle: true,
          count: 3,
        }),
      );
      service.register(
        makeProvider(PendingActionType.FriendRequest, {
          canHandle: false,
          count: 99,
        }),
      );
      const result = await service.countForUser('u1', UserRole.Admin);
      expect(result.total).toBe(3);
    });

    it('vrátí 0 pokud žádný provider canHandle = true', async () => {
      service.register(
        makeProvider(PendingActionType.UsernameRequest, {
          canHandle: false,
          count: 99,
        }),
      );
      const result = await service.countForUser('u1', UserRole.Ikarus);
      expect(result.total).toBe(0);
    });

    it('vrátí 0 pokud nejsou registrováni žádní providers', async () => {
      const result = await service.countForUser('u1', UserRole.Admin);
      expect(result.total).toBe(0);
    });

    it('byType obsahuje jen typy s canHandle = true; total = suma byType', async () => {
      service.register(
        makeProvider(PendingActionType.ArticlePendingReview, {
          canHandle: true,
          count: 4,
        }),
      );
      service.register(
        makeProvider(PendingActionType.GalleryPendingReview, {
          canHandle: true,
          count: 2,
        }),
      );
      service.register(
        makeProvider(PendingActionType.DiscussionPendingReview, {
          canHandle: false,
          count: 99,
        }),
      );
      const result = await service.countForUser('u1', UserRole.SpravceClanku);
      expect(result.byType).toEqual({
        [PendingActionType.ArticlePendingReview]: 4,
        [PendingActionType.GalleryPendingReview]: 2,
      });
      expect(
        result.byType[PendingActionType.DiscussionPendingReview],
      ).toBeUndefined();
      expect(result.total).toBe(6);
    });

    it('byType je prázdné pokud uživatel nevidí žádný typ', async () => {
      service.register(
        makeProvider(PendingActionType.ArticlePendingReview, {
          canHandle: false,
          count: 99,
        }),
      );
      const result = await service.countForUser('u1', UserRole.Ikarus);
      expect(result.byType).toEqual({});
      expect(result.total).toBe(0);
    });
  });

  describe('listForType', () => {
    it('vrátí items z provideru pokud canHandle = true', async () => {
      service.register(
        makeProvider(PendingActionType.UsernameRequest, {
          canHandle: true,
          count: 2,
          items: [{ id: 'a' }, { id: 'b' }],
        }),
      );
      const result = await service.listForType(
        PendingActionType.UsernameRequest,
        'u1',
        UserRole.Admin,
        1,
        20,
      );
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('vrátí prázdný response pokud canHandle = false', async () => {
      service.register(
        makeProvider(PendingActionType.UsernameRequest, {
          canHandle: false,
          count: 99,
          items: [{ id: 'a' }],
        }),
      );
      const result = await service.listForType(
        PendingActionType.UsernameRequest,
        'u1',
        UserRole.Ikarus,
        1,
        20,
      );
      expect(result).toEqual({ items: [], total: 0 });
    });

    it('vrátí prázdný response pokud provider pro daný typ neexistuje', async () => {
      const result = await service.listForType(
        PendingActionType.FriendRequest,
        'u1',
        UserRole.Admin,
        1,
        20,
      );
      expect(result).toEqual({ items: [], total: 0 });
    });
  });
});
