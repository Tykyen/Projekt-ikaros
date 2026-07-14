import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DungeonMapsService } from './dungeon-maps.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';
import { UsersService } from '../users/users.service';

const mockDungeon = {
  id: 'dun1',
  worldId: 'world1',
  ownerId: 'pj1',
  name: 'Kobka',
  gridType: 'square' as const,
  gridWidth: 20,
  gridHeight: 20,
  cellSize: 40,
  theme: 'dyson' as const,
  cells: [],
  decorations: [],
  lastModified: new Date(),
};

// 21.3a — legacy dokument z doby před ownerId: edit jen PJ+.
const legacyDungeon = { ...mockDungeon, id: 'dunLegacy', ownerId: undefined };

describe('DungeonMapsService', () => {
  let service: DungeonMapsService;

  const mockRepo = {
    findByWorld: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembershipRepo = { findByUserAndWorld: jest.fn() };
  const mockTemplateRepo = { create: jest.fn() };
  const mockMapsRepo = { create: jest.fn() };
  const mockUsersService = { findById: jest.fn() };

  /** Zkratky: nastavení world role requestera + globálního user profilu. */
  const memberAs = (role: WorldRole | null) =>
    mockMembershipRepo.findByUserAndWorld.mockResolvedValue(
      role === null ? null : { role },
    );
  const userIs = (opts: { role?: UserRole; isSupporter?: boolean }) =>
    mockUsersService.findById.mockResolvedValue({
      role: opts.role ?? UserRole.Ikarus,
      isSupporter: opts.isSupporter ?? false,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DungeonMapsService,
        { provide: 'IDungeonMapsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IMapTemplatesRepository', useValue: mockTemplateRepo },
        { provide: 'IMapsRepository', useValue: mockMapsRepo },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();
    service = module.get(DungeonMapsService);
  });

  describe('findByWorld (21.3a read-gate Hrac+)', () => {
    it('PJ vidí všechna podzemí světa (bez owner filtru)', async () => {
      memberAs(WorldRole.PJ);
      mockRepo.findByWorld.mockResolvedValue([mockDungeon]);
      const result = await service.findByWorld('world1', {
        id: 'pj',
        role: UserRole.Ikarus,
      });
      expect(result).toEqual([mockDungeon]);
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });

    it('hráč vidí JEN svoje podzemí (owner filtr)', async () => {
      memberAs(WorldRole.Hrac);
      mockRepo.findByWorld.mockResolvedValue([]);
      await service.findByWorld('world1', { id: 'h1', role: UserRole.Ikarus });
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1', 'h1');
    });

    it('Čtenář → 403 NOT_WORLD_MEMBER, žádný dump', async () => {
      memberAs(WorldRole.Ctenar);
      await expect(
        service.findByWorld('world1', { id: 'c', role: UserRole.Ikarus }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.findByWorld).not.toHaveBeenCalled();
    });

    it('non-member → 403', async () => {
      memberAs(null);
      await expect(
        service.findByWorld('world1', { id: 'x', role: UserRole.Ikarus }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('elevovaný Admin vidí vše bez membership dotazu', async () => {
      mockRepo.findByWorld.mockResolvedValue([mockDungeon]);
      await service.findByWorld('world1', {
        id: 'a',
        role: UserRole.Admin,
        elevatedWorldIds: ['world1'],
      });
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
      expect(mockRepo.findByWorld).toHaveBeenCalledWith('world1');
    });
  });

  describe('findById', () => {
    it('vrátí dungeon pro PJ', async () => {
      memberAs(WorldRole.PJ);
      mockRepo.findById.mockResolvedValue(mockDungeon);
      const result = await service.findById('dun1', {
        id: 'pj',
        role: UserRole.Ikarus,
      });
      expect(result).toEqual(mockDungeon);
    });

    it('owner (hráč) vidí svoje', async () => {
      memberAs(WorldRole.Hrac);
      mockRepo.findById.mockResolvedValue({ ...mockDungeon, ownerId: 'h1' });
      await expect(
        service.findById('dun1', { id: 'h1', role: UserRole.Ikarus }),
      ).resolves.toMatchObject({ ownerId: 'h1' });
    });

    it('hráč na cizí dungeon → 403 NOT_DUNGEON_OWNER', async () => {
      memberAs(WorldRole.Hrac);
      mockRepo.findById.mockResolvedValue(mockDungeon); // owner pj1
      await expect(
        service.findById('dun1', { id: 'h1', role: UserRole.Ikarus }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.findById('neexistuje', {
          id: 'x',
          role: UserRole.Admin,
          elevatedWorldIds: ['world1'],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertCanManage (PJ+ — exporty)', () => {
    it('projde pro elevovaného Admina bez kontroly členství', async () => {
      await expect(
        service.assertCanManage(
          { id: 'u1', role: UserRole.Admin, elevatedWorldIds: ['world1'] },
          'world1',
        ),
      ).resolves.toBeUndefined();
      expect(mockMembershipRepo.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Admin BEZ elevace → padá na membership (žádný → 403)', async () => {
      memberAs(null);
      await expect(
        service.assertCanManage({ id: 'u1', role: UserRole.Admin }, 'world1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.findByUserAndWorld).toHaveBeenCalled();
    });

    it('projde pro PJ světa', async () => {
      memberAs(WorldRole.PJ);
      await expect(
        service.assertCanManage({ id: 'pj1', role: UserRole.Ikarus }, 'world1'),
      ).resolves.toBeUndefined();
    });

    it('hodí ForbiddenException pro hráče bez PJ role', async () => {
      memberAs(WorldRole.Hrac);
      await expect(
        service.assertCanManage({ id: 'u1', role: UserRole.Ikarus }, 'world1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create (21.3a supporter gating)', () => {
    it('PJ (ne-podporovatel) vytvoří; ownerId = requester', async () => {
      memberAs(WorldRole.PJ);
      mockRepo.create.mockResolvedValue(mockDungeon);
      await service.create(
        { worldId: 'world1', name: 'Kobka' },
        { id: 'pj1', role: UserRole.Ikarus },
      );
      expect(mockUsersService.findById).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', ownerId: 'pj1' }),
      );
    });

    it('hráč-Podporovatel vytvoří; ownerId = requester', async () => {
      memberAs(WorldRole.Hrac);
      userIs({ isSupporter: true });
      mockRepo.create.mockResolvedValue(mockDungeon);
      await service.create(
        { worldId: 'world1' },
        { id: 'h1', role: UserRole.Ikarus },
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'h1' }),
      );
    });

    it('týmová role (Správce článků) = podporovatel automaticky', async () => {
      memberAs(WorldRole.Hrac);
      userIs({ role: UserRole.SpravceClanku, isSupporter: false });
      mockRepo.create.mockResolvedValue(mockDungeon);
      await expect(
        service.create(
          { worldId: 'world1' },
          { id: 's1', role: UserRole.SpravceClanku },
        ),
      ).resolves.toBeDefined();
    });

    it('hráč bez Podporovatele → 403 NOT_SUPPORTER', async () => {
      memberAs(WorldRole.Hrac);
      userIs({ isSupporter: false });
      await expect(
        service.create(
          { worldId: 'world1' },
          { id: 'h1', role: UserRole.Ikarus },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_SUPPORTER' }),
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('Čtenář (i Podporovatel) → 403 NOT_WORLD_MEMBER', async () => {
      memberAs(WorldRole.Ctenar);
      userIs({ isSupporter: true });
      await expect(
        service.create(
          { worldId: 'world1' },
          { id: 'c1', role: UserRole.Ikarus },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_WORLD_MEMBER' }),
      });
    });

    it('non-member → 403', async () => {
      memberAs(null);
      await expect(
        service.create(
          { worldId: 'world1' },
          { id: 'x', role: UserRole.Ikarus },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('replace (owner ∨ PJ+)', () => {
    it('PJ nahradí cizí dungeon; ownerId původního vlastníka se zachová', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDungeon, ownerId: 'h1' });
      memberAs(WorldRole.PJ);
      mockRepo.replace.mockResolvedValue(mockDungeon);
      await service.replace(
        'dun1',
        { name: 'Nové jméno' },
        { id: 'pj1', role: UserRole.Ikarus },
      );
      // replace jede overwrite → ownerId musí být explicitně zachován.
      expect(mockRepo.replace).toHaveBeenCalledWith(
        'dun1',
        expect.objectContaining({ worldId: 'world1', ownerId: 'h1' }),
      );
    });

    it('owner (hráč) edituje svoje i bez Podporovatele (grandfathering)', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDungeon, ownerId: 'h1' });
      memberAs(WorldRole.Hrac);
      mockRepo.replace.mockResolvedValue(mockDungeon);
      await expect(
        service.replace(
          'dun1',
          { name: 'X' },
          { id: 'h1', role: UserRole.Ikarus },
        ),
      ).resolves.toBeDefined();
      expect(mockUsersService.findById).not.toHaveBeenCalled();
    });

    it('hráč na cizí dungeon → 403 NOT_DUNGEON_OWNER', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon); // owner pj1
      memberAs(WorldRole.Hrac);
      await expect(
        service.replace('dun1', {}, { id: 'h1', role: UserRole.Ikarus }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_DUNGEON_OWNER' }),
      });
      expect(mockRepo.replace).not.toHaveBeenCalled();
    });

    it('legacy bez ownerId: hráč → 403, PJ → OK', async () => {
      mockRepo.findById.mockResolvedValue(legacyDungeon);
      memberAs(WorldRole.Hrac);
      await expect(
        service.replace('dunLegacy', {}, { id: 'h1', role: UserRole.Ikarus }),
      ).rejects.toThrow(ForbiddenException);

      memberAs(WorldRole.PJ);
      mockRepo.replace.mockResolvedValue(legacyDungeon);
      await expect(
        service.replace('dunLegacy', {}, { id: 'pj1', role: UserRole.Ikarus }),
      ).resolves.toBeDefined();
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.replace('x', {}, { id: 'pj1', role: UserRole.Ikarus }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete (owner ∨ PJ+)', () => {
    it('owner smaže svoje', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDungeon, ownerId: 'h1' });
      memberAs(WorldRole.Hrac);
      mockRepo.delete.mockResolvedValue(true);
      await expect(
        service.delete('dun1', { id: 'h1', role: UserRole.Ikarus }),
      ).resolves.toBeUndefined();
    });

    it('hráč cizí nesmaže → 403', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon); // owner pj1
      memberAs(WorldRole.Hrac);
      await expect(
        service.delete('dun1', { id: 'h1', role: UserRole.Ikarus }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.delete('x', { id: 'pj1', role: UserRole.Ikarus }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportTemplate (PJ+)', () => {
    it('vytvoří MapTemplate z dungeonu a vrátí templateId', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      memberAs(WorldRole.PJ);
      mockTemplateRepo.create.mockResolvedValue({ id: 'tpl1', name: 'Kobka' });
      const result = await service.exportTemplate(
        'dun1',
        'https://example.com/img.png',
        { id: 'pj1', role: UserRole.Ikarus },
      );
      expect(result).toEqual({ templateId: 'tpl1' });
      expect(mockTemplateRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kobka',
          imageUrl: 'https://example.com/img.png',
          config: expect.objectContaining({ size: 40 }),
        }),
      );
    });

    it('owner-hráč exportovat nesmí (PJ-only zápis do TM)', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockDungeon, ownerId: 'h1' });
      memberAs(WorldRole.Hrac);
      await expect(
        service.exportTemplate('dun1', 'https://img.png', {
          id: 'h1',
          role: UserRole.Ikarus,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.exportTemplate('x', 'https://img.png', {
          id: 'pj1',
          role: UserRole.Ikarus,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportScene (PJ+)', () => {
    it('vytvoří MapScene z dungeonu a vrátí sceneId', async () => {
      mockRepo.findById.mockResolvedValue(mockDungeon);
      memberAs(WorldRole.PJ);
      mockMapsRepo.create.mockResolvedValue({
        id: 'scene1',
        worldId: 'world1',
      });
      const result = await service.exportScene(
        'dun1',
        'https://example.com/img.png',
        { id: 'pj1', role: UserRole.Ikarus },
      );
      expect(result).toEqual({ sceneId: 'scene1' });
      expect(mockMapsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Kobka',
          imageUrl: 'https://example.com/img.png',
          worldId: 'world1',
          isActive: false,
        }),
      );
    });

    it('hodí NotFoundException pokud dungeon neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.exportScene('x', 'https://img.png', {
          id: 'pj1',
          role: UserRole.Ikarus,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
