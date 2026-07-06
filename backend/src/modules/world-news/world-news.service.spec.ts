import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldNewsService } from './world-news.service';
import type { WorldNewsItem } from './interfaces/world-news.interface';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockItem = (overrides: Partial<WorldNewsItem> = {}): WorldNewsItem => ({
  id: 'n1',
  worldId: null,
  title: 'Globální oznámení',
  content: 'Obsah',
  date: '2026-05-06T10:00:00.000Z',
  type: 'info',
  linkPageSlug: null,
  imageUrl: null,
  imageFocalX: null,
  imageFocalY: null,
  imageZoom: null,
  imageFit: null,
  calendarConfigId: null,
  calendarDate: null,
  archived: false,
  ...overrides,
});

describe('WorldNewsService', () => {
  let service: WorldNewsService;

  const mockRepo = {
    findMany: jest.fn(),
    count: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setArchived: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembership = {
    findByUserAndWorld: jest.fn(),
  };
  const mockWorlds = {
    findById: jest.fn(),
  };

  const Superadmin = { id: 'u1', role: 1, username: 'sa' } as const;
  const Admin = { id: 'u2', role: 2, username: 'a' } as const;
  const PJ = { id: 'u3', role: 3, username: 'pj' } as const;
  const RegularUser = { id: 'u4', role: 5, username: 'h' } as const; // Hrac

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldNewsService,
        { provide: 'IWorldNewsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        // C-04 — service emituje 'world-news.changed' po mutaci.
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorldNewsService);
  });

  describe('findMany (read path)', () => {
    it('bez worldId vrátí vše s default limitem 50, scope active, offset 0', async () => {
      mockRepo.findMany.mockResolvedValue([mockItem()]);
      const result = await service.findMany({});
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: undefined,
        limit: 50,
        scope: 'active',
        offset: 0,
      });
      expect(result).toHaveLength(1);
    });

    it('s worldId předá filter (svět + globální union v repo)', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'w1', limit: 10 });
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: 'w1',
        limit: 10,
        scope: 'active',
        offset: 0,
      });
    });

    it('limit nad 200 se klampuje na 200', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ limit: 999 });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 200 }),
      );
    });

    it('offset se předá repo', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'w1', offset: 20 });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 20 }),
      );
    });
  });

  describe('findMany — scope autorizace (5.5b)', () => {
    it('scope=active je veřejný (bez requestera)', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await expect(
        service.findMany({ worldId: 'w1', scope: 'active' }),
      ).resolves.toBeDefined();
    });

    it('scope=archived bez přihlášení → 401', async () => {
      await expect(
        service.findMany({ worldId: 'w1', scope: 'archived' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('scope=archived — elevovaný Admin smí (per-world)', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({
        worldId: 'w1',
        scope: 'archived',
        requester: { ...Admin, elevatedWorldIds: ['w1'] },
      });
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'archived' }),
      );
    });

    it('scope=archived — de-elevated Admin (per-world) → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'w1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findMany({
          worldId: 'w1',
          scope: 'archived',
          requester: Admin,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('scope=archived — PomocnyPJ světa smí', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'w1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({
        worldId: 'w1',
        scope: 'all',
        requester: RegularUser,
      });
      expect(mockRepo.findMany).toHaveBeenCalled();
    });

    it('scope=archived — běžný hráč světa → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'w1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.findMany({
          worldId: 'w1',
          scope: 'archived',
          requester: RegularUser,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('findMany — FIX-22 scope=active world-scoped accessMode gate', () => {
    it('scope=active bez worldId (globální/vše) zůstává veřejné', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await expect(service.findMany({})).resolves.toBeDefined();
      expect(mockWorlds.findById).not.toHaveBeenCalled();
    });

    it('scope=active pro PUBLIC svět čte i anonym', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'w1', accessMode: 'public' });
      mockRepo.findMany.mockResolvedValue([]);
      await expect(
        service.findMany({ worldId: 'w1', scope: 'active' }),
      ).resolves.toBeDefined();
    });

    it('scope=active pro PRIVATE svět + anonym → 403 (dřív leak)', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'w1',
        accessMode: 'private',
      });
      await expect(
        service.findMany({ worldId: 'w1', scope: 'active' }),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockRepo.findMany).not.toHaveBeenCalled();
    });

    it('scope=active pro PRIVATE svět + přihlášený nečlen → 403', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'w1',
        accessMode: 'private',
      });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findMany({
          worldId: 'w1',
          scope: 'active',
          requester: RegularUser,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('scope=active pro PRIVATE svět + member smí', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'w1',
        accessMode: 'private',
      });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findMany.mockResolvedValue([]);
      await expect(
        service.findMany({
          worldId: 'w1',
          scope: 'active',
          requester: RegularUser,
        }),
      ).resolves.toBeDefined();
    });

    it('scope=active pro PRIVATE svět + elevovaný Admin smí (bez membershipu)', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'w1',
        accessMode: 'private',
      });
      mockRepo.findMany.mockResolvedValue([]);
      await expect(
        service.findMany({
          worldId: 'w1',
          scope: 'active',
          requester: { ...Admin, elevatedWorldIds: ['w1'] },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('count (5.5b)', () => {
    it('vrátí počet pro scope active (veřejné)', async () => {
      // FIX-22 — scope=active teď taky čte accessMode světa; explicitní mock,
      // ať test nezávisí na leftover stavu z předchozích testů (clearAllMocks
      // nemaže mockResolvedValue).
      mockWorlds.findById.mockResolvedValue({ id: 'w1', accessMode: 'public' });
      mockRepo.count.mockResolvedValue(7);
      const total = await service.count({ worldId: 'w1' });
      expect(total).toBe(7);
      expect(mockRepo.count).toHaveBeenCalledWith({
        worldId: 'w1',
        scope: 'active',
      });
    });

    it('count scope=archived bez přihlášení → 401', async () => {
      await expect(
        service.count({ worldId: 'w1', scope: 'archived' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findById', () => {
    it('vrátí položku', async () => {
      mockRepo.findById.mockResolvedValue(mockItem());
      const result = await service.findById('n1');
      expect(result).toEqual(mockItem());
    });

    it('hází 404 když neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create — autorizace', () => {
    it('Superadmin smí vytvořit globální (worldId=null)', async () => {
      mockRepo.create.mockResolvedValue(mockItem({ id: 'new', worldId: null }));
      await service.create(
        { title: 't', content: 'c', worldId: null },
        Superadmin,
      );
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Admin smí vytvořit globální', async () => {
      mockRepo.create.mockResolvedValue(mockItem({ id: 'new' }));
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('běžný User nesmí vytvořit globální → 403', async () => {
      await expect(
        service.create({ title: 't', content: 'c' }, RegularUser),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PJ světa W1 smí vytvořit per-world novinku v W1', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u3',
        worldId: 'W1',
        role: WorldRole.PJ,
      });
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create({ title: 't', content: 'c', worldId: 'W1' }, PJ);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PomocnyPJ smí vytvořit per-world novinku', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create(
        { title: 't', content: 'c', worldId: 'W1' },
        { id: 'u4', role: 5, username: 'pp' },
      );
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Korektor NESMÍ vytvořit per-world → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: WorldRole.Korektor,
      });
      await expect(
        service.create(
          { title: 't', content: 'c', worldId: 'W1' },
          RegularUser,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PJ světa W1 nesmí vytvořit per-world v W2 (cross-world isolation) → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W2' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create({ title: 't', content: 'c', worldId: 'W2' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('worldId odkazuje na neexistující svět → 403 (anti-leak)', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.create({ title: 't', content: 'c', worldId: 'fake' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('elevovaný Admin smí vytvořit per-world novinku (bypass)', async () => {
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create(
        { title: 't', content: 'c', worldId: 'W1' },
        { ...Admin, elevatedWorldIds: ['W1'] },
      );
      expect(mockRepo.create).toHaveBeenCalled();
      // bypass = neptá se na svět ani membership
      expect(mockWorlds.findById).not.toHaveBeenCalled();
      expect(mockMembership.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('de-elevovaný Admin NEMÁ per-world bypass → padá na membership → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create({ title: 't', content: 'c', worldId: 'W1' }, Admin),
      ).rejects.toMatchObject({ status: 403 });
      expect(mockMembership.findByUserAndWorld).toHaveBeenCalled();
    });

    it('default date je nastaven na server-side ISO UTC', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: 'x', ...data }),
      );
      await service.create({ title: 't', content: 'c' }, Admin);
      const callArg = mockRepo.create.mock.calls[0][0];
      expect(callArg.date).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    });

    it('createdBy je naplněn z requestera', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: 'x', ...data }),
      );
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create.mock.calls[0][0].createdBy).toBe('u2');
    });

    it('default type je info, archived false', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: 'x', ...data }),
      );
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create.mock.calls[0][0].type).toBe('info');
      expect(mockRepo.create.mock.calls[0][0].archived).toBe(false);
    });
  });

  describe('update — partial + immutable worldId', () => {
    it('partial update zachová ostatní pole', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ id: 'x', worldId: null }));
      mockRepo.update.mockResolvedValue(mockItem({ id: 'x', title: 'nový' }));
      const result = await service.update('x', { title: 'nový' }, Admin);
      expect(mockRepo.update).toHaveBeenCalledWith('x', { title: 'nový' });
      expect(result.title).toBe('nový');
    });

    it('hází 404 když news neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 't' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('Admin smí upravit globální news', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.update.mockResolvedValue(mockItem());
      await service.update('x', { title: 't' }, Admin);
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('běžný User nesmí upravit globální → 403', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      await expect(
        service.update('x', { title: 't' }, RegularUser),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PUT s worldId v body → 400 (defense-in-depth)', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      await expect(
        service.update(
          'x',
          { worldId: 'changed', title: 't' } as unknown as Parameters<
            typeof service.update
          >[1],
          Admin,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('archive / unarchive (5.5b)', () => {
    it('archive — 404 když news neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.archive('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Admin smí archivovat globální novinku', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.setArchived.mockResolvedValue(mockItem({ archived: true }));
      const res = await service.archive('n1', Admin);
      expect(mockRepo.setArchived).toHaveBeenCalledWith('n1', true, 'u2');
      expect(res.archived).toBe(true);
    });

    it('PJ světa smí archivovat per-world novinku', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: 'W1' }));
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.setArchived.mockResolvedValue(
        mockItem({ worldId: 'W1', archived: true }),
      );
      await service.archive('n1', PJ);
      expect(mockRepo.setArchived).toHaveBeenCalledWith('n1', true, 'u3');
    });

    it('běžný hráč nesmí archivovat per-world novinku → 403', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: 'W1' }));
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(service.archive('n1', RegularUser)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('unarchive volá setArchived s false', async () => {
      mockRepo.findById.mockResolvedValue(
        mockItem({ worldId: null, archived: true }),
      );
      mockRepo.setArchived.mockResolvedValue(mockItem({ archived: false }));
      await service.unarchive('n1', Admin);
      expect(mockRepo.setArchived).toHaveBeenCalledWith('n1', false, 'u2');
    });
  });

  describe('delete', () => {
    it('hází 404 když news neexistuje', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Admin smí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('x', Admin);
      expect(mockRepo.delete).toHaveBeenCalledWith('x');
    });
  });

  // ── 9.5 — image focal + linkPageSlug ───────────────────────────────────
  describe('9.5 — image focal point + linkPageSlug', () => {
    it('create propaguje imageUrl/imageFocalX/Y a linkPageSlug do repo', async () => {
      mockRepo.create.mockResolvedValue(mockItem());
      await service.create(
        {
          worldId: null,
          title: 'X',
          content: 'Y',
          imageUrl: 'https://example.com/img.png',
          imageFocalX: 25,
          imageFocalY: 75,
          linkPageSlug: 'mages-tower',
        },
        Admin,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: 'https://example.com/img.png',
          imageFocalX: 25,
          imageFocalY: 75,
          linkPageSlug: 'mages-tower',
        }),
      );
    });

    it('create bez nových polí → null defaults', async () => {
      mockRepo.create.mockResolvedValue(mockItem());
      await service.create({ worldId: null, title: 'X', content: 'Y' }, Admin);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: null,
          imageFocalX: null,
          imageFocalY: null,
          linkPageSlug: null,
        }),
      );
    });

    it('update s imageFocalX=null explicit clearuje', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.update.mockResolvedValue(mockItem());
      await service.update(
        'n1',
        { imageFocalX: null, imageFocalY: null },
        Admin,
      );
      expect(mockRepo.update).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ imageFocalX: null, imageFocalY: null }),
      );
    });

    it('update s linkPageSlug=null clearuje stránku-odkaz', async () => {
      mockRepo.findById.mockResolvedValue(
        mockItem({ worldId: null, linkPageSlug: 'old-page' }),
      );
      mockRepo.update.mockResolvedValue(mockItem());
      await service.update('n1', { linkPageSlug: null }, Admin);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ linkPageSlug: null }),
      );
    });

    it('update neposlané fields nemodifikuje (žádný omyl null)', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      mockRepo.update.mockResolvedValue(mockItem());
      await service.update('n1', { title: 'Nový titulek' }, Admin);
      const callArg = mockRepo.update.mock.calls[0][1];
      expect(callArg).toEqual({ title: 'Nový titulek' });
      expect('imageUrl' in callArg).toBe(false);
      expect('linkPageSlug' in callArg).toBe(false);
    });
  });
});
