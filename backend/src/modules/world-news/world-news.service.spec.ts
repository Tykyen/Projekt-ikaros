import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorldNewsService } from './world-news.service';
import type { WorldNewsItem } from './interfaces/world-news.interface';

const mockItem = (overrides: Partial<WorldNewsItem> = {}): WorldNewsItem => ({
  id: 'n1',
  worldId: null,
  title: 'Globální oznámení',
  content: 'Obsah',
  date: '2026-05-06T10:00:00.000Z',
  type: 'info',
  ...overrides,
});

describe('WorldNewsService', () => {
  let service: WorldNewsService;

  const mockRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembership = {
    findByUserAndWorld: jest.fn(),
  };
  const mockWorlds = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldNewsService,
        { provide: 'IWorldNewsRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
      ],
    }).compile();
    service = module.get(WorldNewsService);
  });

  describe('findMany (read path)', () => {
    it('bez worldId vrátí vše s default limitem 50', async () => {
      mockRepo.findMany.mockResolvedValue([mockItem()]);
      const result = await service.findMany({});
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: undefined,
        limit: 50,
      });
      expect(result).toHaveLength(1);
    });

    it('s worldId předá filter (svět + globální union v repo)', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'w1', limit: 10 });
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: 'w1',
        limit: 10,
      });
    });

    it('limit nad 200 se klampuje na 200', async () => {
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ limit: 999 });
      expect(mockRepo.findMany).toHaveBeenCalledWith({
        worldId: undefined,
        limit: 200,
      });
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
    const Superadmin = { id: 'u1', role: 1, username: 'sa' } as const; // UserRole.Superadmin
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;
    const PJ = { id: 'u3', role: 3, username: 'pj' } as const;
    const RegularUser = { id: 'u4', role: 5, username: 'h' } as const; // Hrac

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
        role: 3, // WorldRole.PJ
      });
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create({ title: 't', content: 'c', worldId: 'W1' }, PJ);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PomocnyPJ (role 2) smí vytvořit per-world novinku', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 2, // WorldRole.PomocnyPJ
      });
      mockRepo.create.mockResolvedValue(mockItem({ worldId: 'W1' }));
      await service.create(
        { title: 't', content: 'c', worldId: 'W1' },
        { id: 'u4', role: 5, username: 'pp' },
      );
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Korektor (role 1) NESMÍ vytvořit per-world → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 1,
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

    it('default type je info', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({ id: 'x', ...data }),
      );
      await service.create({ title: 't', content: 'c' }, Admin);
      expect(mockRepo.create.mock.calls[0][0].type).toBe('info');
    });
  });

  describe('update — partial + immutable worldId', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

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
      const RegularUser = { id: 'u4', role: 5, username: 'h' } as const;
      await expect(
        service.update('x', { title: 't' }, RegularUser),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PUT s worldId v body → 400 (defense-in-depth, i kdyby DTO whitelist selhal)', async () => {
      mockRepo.findById.mockResolvedValue(mockItem({ worldId: null }));
      // Cast přes `any` simuluje case kdy by class-validator whitelist propustil cizí field.
      // Service to musí zachytit nezávisle.
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

  describe('delete', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

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
});
