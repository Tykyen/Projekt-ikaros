import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimelineService } from './timeline.service';
import type { TimelineEvent } from './interfaces/timeline-event.interface';
import { WorldCalendarConfigService } from '../world-calendar-config/world-calendar-config.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockEvent = (overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
  id: 'ev1',
  worldId: 'W1',
  year: 100,
  month: 1,
  day: 5,
  title: 'Bitva',
  text: 'Popis bitvy',
  imageUrl: null,
  imageFocalX: null,
  imageFocalY: null,
  link: null,
  pageSlug: null,
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
    yearCounts: jest.fn(),
  };
  const mockMembership = { findByUserAndWorld: jest.fn() };
  const mockWorlds = { findById: jest.fn() };
  const mockCalendarService = {
    getTimelineConfig: jest.fn().mockResolvedValue(null),
    calculateCelestialStates: jest.fn().mockReturnValue([]),
  };
  const mockEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCalendarService.getTimelineConfig.mockResolvedValue(null);
    mockCalendarService.calculateCelestialStates.mockReturnValue([]);
    const module = await Test.createTestingModule({
      providers: [
        TimelineService,
        { provide: 'ITimelineRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        { provide: WorldCalendarConfigService, useValue: mockCalendarService },
        { provide: EventEmitter2, useValue: mockEmitter },
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
        role: WorldRole.Hrac,
      });
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent()],
        nextCursor: null,
      });
      const result = await service.findMany(
        { worldId: 'W1', limit: 100 },
        Hrac,
      );
      expect(result.events).toHaveLength(1);
      expect(result.events[0].celestialStates).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.findMany({ worldId: 'W1', limit: 100 }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Zadatel (pending) NESMÍ číst → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Zadatel,
      });
      await expect(
        service.findMany({ worldId: 'W1', limit: 100 }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Admin: bez kontroly členství, vrátí events', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent()],
        nextCursor: null,
      });
      const result = await service.findMany(
        { worldId: 'W1', limit: 100 },
        Admin,
      );
      expect(result.events).toHaveLength(1);
      expect(mockMembership.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('neexistující svět: 404', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.findMany({ worldId: 'fake', limit: 100 }, Hrac),
      ).rejects.toThrow(NotFoundException);
    });

    it('default limit je 100, max 500 clamp', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 }),
      );
      jest.clearAllMocks();
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1', limit: 999 }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 500 }),
      );
    });

    it('strippe data: imageUrl v list response', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent({ imageUrl: 'data:image/png;base64,abc' })],
        nextCursor: null,
      });
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result.events[0].imageUrl).toBeNull();
    });

    it('zachová normal URL v list response', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent({ imageUrl: 'https://cdn.example.com/img.png' })],
        nextCursor: null,
      });
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result.events[0].imageUrl).toBe('https://cdn.example.com/img.png');
    });

    it('volá calendar config a obohatí celestialStates pro svět s configem', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      const fakeConfig = { id: 'c1', worldId: 'W1' } as unknown;
      mockCalendarService.getTimelineConfig.mockResolvedValue(fakeConfig);
      mockCalendarService.calculateCelestialStates.mockReturnValue([
        {
          bodyId: 'm1',
          name: 'Měsíc',
          phase: 'full',
          color: '#c0c8d0',
          isManualOverride: false,
        },
      ]);
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent()],
        nextCursor: null,
      });
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result.events[0].celestialStates).toHaveLength(1);
      expect(result.events[0].celestialStates[0].phase).toBe('full');
    });

    it('celestialStates: [] pro svět bez configu (default mock)', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent()],
        nextCursor: null,
      });
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result.events[0].celestialStates).toEqual([]);
    });

    it('celestialOverrides z events se předají do calculateCelestialStates', async () => {
      const Admin = {
        id: 'a',
        role: 2,
        username: 'a',
        elevatedWorldIds: ['W1'] as string[],
      } as const;
      const overrides = [{ bodyId: 'm1', phase: 'full' as const }];
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent({ celestialOverrides: overrides })],
        nextCursor: null,
      });
      mockCalendarService.getTimelineConfig.mockResolvedValue({ id: 'c1' });
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
    const Admin = {
      id: 'a',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;

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
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
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
    const Superadmin = {
      id: 'u1',
      role: 1,
      username: 'sa',
      elevatedWorldIds: ['W1'] as string[],
    } as const;
    const Admin = {
      id: 'u2',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;
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

    // F-02 — timeline `text` se renderuje přes dangerouslySetInnerHTML, takže
    // musí být sanitizován při zápisu (stored XSS guard). Bez sanitizace by se
    // <script>/<img onerror> uložil raw a spustil každému divákovi timeline.
    it('F-02 — create sanitizuje <script> z text (stored XSS guard)', async () => {
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(
        { ...baseDto, text: '<p>ahoj</p><script>alert(1)</script>' },
        Admin,
      );
      const saved = mockRepo.create.mock.calls[0][0] as { text: string };
      expect(saved.text).not.toContain('<script>');
      expect(saved.text).toContain('ahoj');
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
        role: WorldRole.PJ,
      });
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, PJ);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('PomocnyPJ smí vytvořit', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.create.mockResolvedValue(mockEvent());
      await service.create(baseDto, Hrac);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('Korektor NESMÍ vytvořit → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        userId: 'u4',
        worldId: 'W1',
        role: WorldRole.Korektor,
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

    it('de-elevated Admin (bez elevace pro svět) nemá bypass → 403', async () => {
      const DeElevatedAdmin = { id: 'u2', role: 2, username: 'a' } as const;
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create(baseDto, DeElevatedAdmin),
      ).rejects.toMatchObject({ status: 403 });
      // Bypass neproběhl → sáhl na membership.
      expect(mockMembership.findByUserAndWorld).toHaveBeenCalled();
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

  describe('update — partial + immutable worldId + imageUrl null delete (FIX-11)', () => {
    const Admin = {
      id: 'u2',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;

    it('partial update — title', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent());
      mockRepo.update.mockResolvedValue(mockEvent({ title: 'nový' }));
      const result = await service.update('ev1', { title: 'nový' }, Admin);
      expect(result.title).toBe('nový');
    });

    it('imageUrl: null v body → smaže obrázek (FIX-11, mirror game-events/world-news)', async () => {
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
      expect(updateCall.imageUrl).toBe(null);
    });

    it('imageUrl: nový string → nahradí', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent({ imageUrl: 'old' }));
      mockRepo.update.mockResolvedValue(mockEvent({ imageUrl: 'new' }));
      await service.update('ev1', { imageUrl: 'https://new.com/x' }, Admin);
      expect(mockRepo.update.mock.calls[0][1].imageUrl).toBe(
        'https://new.com/x',
      );
    });

    it('FIX-11b — smazání obrázku (null) uklidí starý blob (media.orphaned)', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'https://cdn/old.jpg' }),
      );
      mockRepo.update.mockResolvedValue(mockEvent({ imageUrl: null }));
      await service.update('ev1', { imageUrl: null }, Admin);
      expect(mockEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: ['https://cdn/old.jpg'],
      });
    });

    it('FIX-11b — výměna obrázku uklidí starý blob (media.orphaned)', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'https://cdn/old.jpg' }),
      );
      mockRepo.update.mockResolvedValue(
        mockEvent({ imageUrl: 'https://cdn/new.jpg' }),
      );
      await service.update('ev1', { imageUrl: 'https://cdn/new.jpg' }, Admin);
      expect(mockEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: ['https://cdn/old.jpg'],
      });
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
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.update('ev1', { title: 't' }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('delete', () => {
    const Admin = {
      id: 'u2',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;

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

    // CD-RUN-1 — úklid blobu obrázku smazané události (jinak Cloudinary leak).
    it('CD-RUN-1 — smazání události s obrázkem emituje media.orphaned', async () => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ imageUrl: 'https://cdn/x.jpg' }),
      );
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('ev1', Admin);
      expect(mockEmitter.emit).toHaveBeenCalledWith('media.orphaned', {
        urls: ['https://cdn/x.jpg'],
      });
    });

    it('CD-RUN-1 — událost bez obrázku neemituje media.orphaned', async () => {
      mockRepo.findById.mockResolvedValue(mockEvent({ imageUrl: null }));
      mockRepo.delete.mockResolvedValue(true);
      await service.delete('ev1', Admin);
      expect(mockEmitter.emit).not.toHaveBeenCalledWith(
        'media.orphaned',
        expect.anything(),
      );
    });
  });

  // 9.3 — cursor pagination + sort param
  describe('findMany — cursor + sort (9.3)', () => {
    const Admin = {
      id: 'a',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;

    it('default sort=desc propagován do repo', async () => {
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'desc' }),
      );
    });

    it('explicit sort=asc propagován', async () => {
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1', sort: 'asc' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'asc' }),
      );
    });

    it('repo nextCursor enkódován do opaque base64url', async () => {
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent()],
        nextCursor: { year: 1453, month: 5, day: 14, hour: 12, id: 'abc' },
      });
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(typeof result.nextCursor).toBe('string');
      expect(result.nextCursor).not.toContain('"year"'); // ne plain JSON
    });

    it('repo nextCursor=null → service vrátí null', async () => {
      mockRepo.findMany.mockResolvedValue({
        events: [mockEvent()],
        nextCursor: null,
      });
      const result = await service.findMany({ worldId: 'W1' }, Admin);
      expect(result.nextCursor).toBeNull();
    });

    it('valid cursor → dekódován a propagován do repo', async () => {
      const cursor = Buffer.from(
        JSON.stringify({ year: 100, month: 1, day: 1, hour: 0, id: 'x' }),
        'utf8',
      ).toString('base64url');
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1', cursor }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: expect.objectContaining({ year: 100, id: 'x' }),
        }),
      );
    });

    it('invalid cursor → 400 INVALID_CURSOR', async () => {
      await expect(
        service.findMany({ worldId: 'W1', cursor: '@@invalid@@' }, Admin),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CURSOR' } });
    });
  });

  // 9.3 — yearCounts (sidebar scrubber)
  describe('yearCounts (9.3)', () => {
    const Hrac = { id: 'u1', role: 5, username: 'h' } as const;

    it('Member: propaguje volání do repo', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.yearCounts.mockResolvedValue([
        { year: 2039, count: 12 },
        { year: -487, count: 1 },
      ]);
      const result = await service.yearCounts('W1', Hrac);
      expect(result).toEqual([
        { year: 2039, count: 12 },
        { year: -487, count: 1 },
      ]);
    });

    it('Non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.yearCounts('W1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('Neexistující svět: 404', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(service.yearCounts('fake', Hrac)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // 9.3 — search filter propagace
  describe('findMany — search filter propagace (9.3)', () => {
    const Admin = {
      id: 'a',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;

    it('předává search string do repo', async () => {
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1', search: 'bitva' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'bitva' }),
      );
    });

    it('search undefined je propagován jako undefined (žádný filter)', async () => {
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany({ worldId: 'W1' }, Admin);
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined }),
      );
    });

    it('search + fromYear/toYear kombinace', async () => {
      mockRepo.findMany.mockResolvedValue({ events: [], nextCursor: null });
      await service.findMany(
        { worldId: 'W1', search: 'apokalypsa', fromYear: -1000, toYear: 0 },
        Admin,
      );
      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'apokalypsa',
          fromYear: -1000,
          toYear: 0,
        }),
      );
    });
  });

  // 9.3 — nová pole: pageSlug + imageFocalX/Y
  describe('create — pageSlug + focal point propagace', () => {
    const Admin = {
      id: 'a',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;
    const baseDto = {
      worldId: 'W1',
      year: 1453,
      month: 5,
      day: 14,
      title: 'Bitva u Lipan',
      text: 'Husitské války',
    };

    it('předává pageSlug + focal do repo.create', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve(mockEvent(data)),
      );
      await service.create(
        {
          ...baseDto,
          pageSlug: 'lipany',
          imageFocalX: 30,
          imageFocalY: 70,
        },
        Admin,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSlug: 'lipany',
          imageFocalX: 30,
          imageFocalY: 70,
        }),
      );
    });

    it('default null pro nezadaná pole', async () => {
      mockRepo.create.mockImplementation((data) =>
        Promise.resolve(mockEvent(data)),
      );
      await service.create(baseDto, Admin);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSlug: null,
          imageFocalX: null,
          imageFocalY: null,
        }),
      );
    });
  });

  describe('update — pageSlug + focal patch sémantika', () => {
    const Admin = {
      id: 'a',
      role: 2,
      username: 'a',
      elevatedWorldIds: ['W1'] as string[],
    } as const;

    beforeEach(() => {
      mockRepo.findById.mockResolvedValue(
        mockEvent({ pageSlug: 'old-slug', imageFocalX: 20 }),
      );
      mockRepo.update.mockImplementation((_, patch) =>
        Promise.resolve(mockEvent(patch)),
      );
    });

    it('undefined = beze změny (pole nepřítomné v patch)', async () => {
      await service.update('ev1', { title: 'nový' }, Admin);
      const patch = mockRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('pageSlug');
      expect(patch).not.toHaveProperty('imageFocalX');
      expect(patch).not.toHaveProperty('imageFocalY');
    });

    it('null = clearing (přítomný null patch)', async () => {
      await service.update(
        'ev1',
        { pageSlug: null, imageFocalX: null, imageFocalY: null },
        Admin,
      );
      const patch = mockRepo.update.mock.calls[0][1];
      expect(patch.pageSlug).toBeNull();
      expect(patch.imageFocalX).toBeNull();
      expect(patch.imageFocalY).toBeNull();
    });

    it('value = set', async () => {
      await service.update(
        'ev1',
        { pageSlug: 'new-slug', imageFocalX: 60, imageFocalY: 40 },
        Admin,
      );
      const patch = mockRepo.update.mock.calls[0][1];
      expect(patch.pageSlug).toBe('new-slug');
      expect(patch.imageFocalX).toBe(60);
      expect(patch.imageFocalY).toBe(40);
    });
  });
});
