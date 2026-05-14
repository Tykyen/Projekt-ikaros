import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import type { TimelineEvent } from './interfaces/timeline-event.interface';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';

const mockEvent = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'ev1',
  worldId: 'W1',
  year: 100,
  month: 1,
  day: 5,
  title: 'Bitva',
  text: 'Popis bitvy',
  imageUrl: null,
  link: null,
  celestialOverrides: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('TimelineService', () => {
  let service: TimelineService;

  const mockRepo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mockMembership = { findByUserAndWorld: jest.fn() };
  const mockWorlds = { findById: jest.fn() };
  const mockCalendarService = {
    getConfigInternal: jest.fn().mockResolvedValue(null),
    calculateCelestialStates: jest.fn().mockReturnValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCalendarService.getConfigInternal.mockResolvedValue(null);
    mockCalendarService.calculateCelestialStates.mockReturnValue([]);
    const module = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: 'ITimelineRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        { provide: WorldCalendarConfigService, useValue: mockCalendarService },
      ],
    }).compile();
    service = module.get(TimelineService);
  });

  describe('findMany (read path)', () => {
    const Hrac = { id: 'u1', role: 5, username: 'h' } as const;

    it('member světa: vrátí events s placeholder celestialStates', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u1',
        worldId: 'W1',
        role: 0, // Hrac
      });
      mockRepo.findMany.mockResolvedValue([mockEvent()]);
      const result = await service.findMany(
        { worldId: 'W1', limit: 100 },
        Hrac,
      );
      expect(result).toHaveLength(1);
      expect(result[0].celestialStates).toEqual([]);
    });

    it('non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findMany({ worldId: 'W1', limit: 100 }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Pending (role -1): 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: -1 });
      await expect(
        service.findMany({ worldId: 'W1', limit: 100 }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Admin: bez kontroly členství, vrátí events', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([mockEvent()]);
      const result = await service.findMany(
        { worldId: 'W1', limit: 100 },
        Admin,
      );
      expect(result).toHaveLength(1);
      expect(mockMembership.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('neexistující svět: 404', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.findMany({ worldId: 'fake', limit: 100 }, Hrac),
      ).rejects.toThrow(NotFoundException);
    });

    it('default limit je 100, max 500 clamp', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'W1' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
      jest.clearAllMocks();
      mockRepo.findMany.mockResolvedValue([]);
      await service.findMany({ worldId: 'W1', limit: 999 }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });

    it('strippe data: imageUrl v list response', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([
        mockEvent({ imageUrl: 'data:image/png;base64,abc' }),
      ]);
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result[0].imageUrl).toBeNull();
    });

    it('zachová normal URL v list response', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([
        mockEvent({ imageUrl: 'https://cdn.example.com/img.png' }),
      ]);
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result[0].imageUrl).toBe('https://cdn.example.com/img.png');
    });

    it('volá calendar config a obohatí celestialStates pro svět s configem', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      const fakeConfig = { id: 'c1', worldId: 'W1' } as unknown;
      mockCalendarService.getConfigInternal.mockResolvedValue(fakeConfig);
      mockCalendarService.calculateCelestialStates.mockReturnValue([
        {
          bodyId: 'm1',
          name: 'Měsíc',
          type: 'moon',
          state: 'úplněk',
          isManualOverride: false,
        },
      ]);
      mockRepo.findMany.mockResolvedValue([mockEvent()]);
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result[0].celestialStates).toHaveLength(1);
      expect(result[0].celestialStates[0].state).toBe('úplněk');
    });

    it('celestialStates: [] pro svět bez configu (default mock)', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      mockRepo.findMany.mockResolvedValue([mockEvent()]);
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result[0].celestialStates).toEqual([]);
    });

    it('celestialOverrides z events se předají do calculateCelestialStates', async () => {
      const Admin = { id: 'a', role: 2, username: 'a' } as const;
      const overrides = [{ bodyId: 'm1', value: 'úplněk' }];
      mockRepo.findMany.mockResolvedValue([
        mockEvent({ celestialOverrides: overrides }),
      ]);
      mockCalendarService.getConfigInternal.mockResolvedValue({ id: 'c1' });
      await service.findMany({ worldId: 'W1' }, Admin);
      expect(mockCalendarService.calculateCelestialStates).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Object),
        overrides,
      );
    });
  });

  describe('findById (detail)', () => {
    const Admin = { id: 'a', role: 2, username: 'a' } as const;

    it('zachová data: imageUrl v detail response', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'data:image/png;base64,abc' }),
      );
      const result = await service.findById('ev1', Admin);
      expect(result.imageUrl).toBe('data:image/png;base64,abc');
      expect(result.celestialStates).toEqual([]);
    });

    it('non-existing: 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.findById('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('member světa události: 200', async () => {
      const Hrac = { id: 'u1', role: 5, username: 'h' } as const;
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 });
      const result = await service.findById('ev1', Hrac);
      expect(result.id).toBe('ev1');
    });

    it('non-member světa události: 403', async () => {
      const Hrac = { id: 'u1', role: 5, username: 'h' } as const;
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.findById('ev1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('create — autorizace', () => {
    const Superadmin = { id: 'u1', role: 1, username: 'sa' } as const;
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;
    const PJ = { id: 'u3', role: 3, username: 'pj' } as const;
    const Hrac = { id: 'u4', role: 5, username: 'h' } as const;

    const baseDto = {
      worldId: 'W1',
      year: 100,
      month: 1,
      day: 5,
      title: 'Bitva',
      text: 'Popis',
    };

    it('Admin smí vytvořit', async () => {
      mockRepo.create.mockResolvedValue(mockEvent());
      const result = await service.create(baseDto, Admin);
      expect(result.id).toBe('ev1');
    });

    it('Superadmin smí vytvořit', async () => {
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, Superadmin);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PJ světa W1 smí vytvořit v W1', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u3',
        worldId: 'W1',
        role: 3, // WorldRole.PJ
      });
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, PJ);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PomocnyPJ (role 2) smí vytvořit', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 2, // PomocnyPJ
      });
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, Hrac);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Korektor (role 1) NESMÍ vytvořit → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: 1,
      });
      await expect(service.create(baseDto, Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('PJ světa W1 nesmí vytvořit v W2 → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W2' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create({ ...baseDto, worldId: 'W2' }, PJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('neexistující svět → 404 (per auth-leak-policy: auth-required)', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.create({ ...baseDto, worldId: 'fake' }, PJ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('default celestialOverrides je []', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({
          id: 'x',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      await service.create(baseDto, Admin);
      expect(mockRepo.create.mock.calls[0][0].celestialOverrides).toEqual([]);
    });

    it('default imageUrl/link je null', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve({
          id: 'x',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
      await service.create(baseDto, Admin);
      expect(mockRepo.create.mock.calls[0][0].imageUrl).toBeNull();
      expect(mockRepo.create.mock.calls[0][0].link).toBeNull();
    });
  });

  describe('update — partial + immutable worldId + imageUrl null preserve', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

    it('partial update — title', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockRepo.update.mockResolvedValue(mockEvent({ title: 'nový' }));
      const result = await service.update('ev1', { title: 'nový' }, Admin);
      expect(result.title).toBe('nový');
    });

    it('imageUrl: null v body → zachová stávající (per parity)', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'https://cdn.example.com/img.png' }),
      );
      mockRepo.update.mockImplementation((id, patch) =>
        Promise.resolve({
          ...mockEvent({ imageUrl: 'https://cdn.example.com/img.png' }),
          ...patch,
        }),
      );
      await service.update('ev1', { imageUrl: null }, Admin);
      const updateCall = mockRepo.update.mock.calls[0][1];
      expect(updateCall.imageUrl).toBe('https://cdn.example.com/img.png');
    });

    it('imageUrl: nový string → nahradí', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent({ imageUrl: 'old' }));
      mockRepo.update.mockResolvedValue(mockEvent({ imageUrl: 'new' }));
      await service.update('ev1', { imageUrl: 'https://new.com/x' }, Admin);
      expect(mockRepo.update.mock.calls[0][1].imageUrl).toBe(
        'https://new.com/x',
      );
    });

    it('hour: null v body → smaže hodinu (uloží null do patche)', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent({ hour: 12 }));
      mockRepo.update.mockResolvedValue(mockEvent());
      await service.update('ev1', { hour: null }, Admin);
      expect(mockRepo.update.mock.calls[0][1]).toHaveProperty('hour', null);
    });

    it('hour: number v body → uloží hodnotu', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockRepo.update.mockResolvedValue(mockEvent({ hour: 8 }));
      await service.update('ev1', { hour: 8 }, Admin);
      expect(mockRepo.update.mock.calls[0][1].hour).toBe(8);
    });

    it('worldId v body → 400 (immutability)', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      await expect(
        service.update(
          'ev1',
          { worldId: 'W2' } as unknown as Parameters<typeof service.update>[1],
          Admin,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('non-existing :id → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { title: 't' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('běžný User nesmí upravit → 403', async () => {
      const Hrac = { id: 'u4', role: 5, username: 'h' } as const;
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 });
      await expect(
        service.update('ev1', { title: 't' }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('delete', () => {
    const Admin = { id: 'u2', role: 2, username: 'a' } as const;

    it('non-existing :id → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.delete('missing', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Admin smí smazat', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('ev1', Admin);
      expect(mockRepo.delete).toHaveBeenCalledWith('ev1');
    });
  });
});
