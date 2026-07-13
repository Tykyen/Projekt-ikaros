/**
 * 9.2b — Refactor pro multi-config kolekci.
 *
 * Stará upsertConfig/getConfig API nahrazena CRUD (list/getBySlug/create/patch/remove)
 * + seedGregorianDefault + getConfigInternal.
 */
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorldCalendarConfigService } from './world-calendar-config.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

describe('WorldCalendarConfigService', () => {
  let service: WorldCalendarConfigService;

  const mockRepo = {
    findAllByWorldId: jest.fn(),
    // D-SEC-GAP-2026-07-11 — creation-flood cap; default hluboko pod stropem.
    countByWorldId: jest.fn().mockResolvedValue(0),
    findBySlug: jest.fn(),
    create: jest.fn(),
    patch: jest.fn(),
    remove: jest.fn(),
  };
  const mockMembership = { findByUserAndWorld: jest.fn() };
  const mockWorlds = { findById: jest.fn() };
  const mockWorldSettings = { findByWorldId: jest.fn(), upsert: jest.fn() };

  const Admin = {
    id: 'a',
    role: UserRole.Admin,
    username: 'a',
    elevatedWorldIds: ['W1'],
  };
  // De-elevated admin (bez elevace pro W1) → world bypass NEPLATÍ.
  const DeElevatedAdmin = { id: 'a', role: UserRole.Admin, username: 'a' };
  const Hrac = { id: 'h', role: UserRole.Ikarus, username: 'h' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WorldCalendarConfigService,
        { provide: 'IWorldCalendarConfigRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        { provide: 'IWorldSettingsRepository', useValue: mockWorldSettings },
      ],
    }).compile();
    service = module.get(WorldCalendarConfigService);
  });

  describe('list', () => {
    it('Admin vidí všechny configs', async () => {
      mockRepo.findAllByWorldId.mockResolvedValue([{ slug: 'gregorian' }]);
      const result = await service.list('W1', Admin);
      expect(result).toEqual([{ slug: 'gregorian' }]);
    });

    it('Member smí list', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findAllByWorldId.mockResolvedValue([]);
      await service.list('W1', Hrac);
      expect(mockRepo.findAllByWorldId).toHaveBeenCalled();
    });

    it('Non-member → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.list('W1', Hrac)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getBySlug', () => {
    it('vrátí config', async () => {
      mockRepo.findBySlug.mockResolvedValue({ slug: 'gregorian' });
      const result = await service.getBySlug('W1', 'gregorian', Admin);
      expect(result.slug).toBe('gregorian');
    });

    it('404 když neexistuje', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      await expect(service.getBySlug('W1', 'x', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const dto = {
      slug: 'elfi',
      name: 'Elfí kalendář',
      hoursPerDay: 24,
      daysOfWeek: ['1', '2', '3'],
      months: [{ name: 'M1', daysCount: 30 }],
      celestialBodies: [],
      seasons: [],
      epochOffset: 0,
    };

    it('Admin smí create → vrátí nový config', async () => {
      mockRepo.create.mockResolvedValue({ id: '1', worldId: 'W1', ...dto });
      const result = await service.create('W1', dto, Admin);
      expect(result.slug).toBe('elfi');
      expect(mockRepo.create).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({ slug: 'elfi' }),
      );
    });

    it('Slug taken → 409', async () => {
      mockRepo.create.mockResolvedValue(null);
      await expect(service.create('W1', dto, Admin)).rejects.toThrow(
        ConflictException,
      );
    });

    it('Hrac → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(service.create('W1', dto, Hrac)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('de-elevated Admin (bez elevace pro svět) nemá bypass → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'W1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.create('W1', dto, DeElevatedAdmin)).rejects.toThrow(
        ForbiddenException,
      );
      // Bypass neproběhl → sáhl na membership.
      expect(mockMembership.findByUserAndWorld).toHaveBeenCalled();
    });
  });

  describe('patch — delta merge', () => {
    it('Pouze poslané fields se předají do repo', async () => {
      mockRepo.patch.mockResolvedValue({ slug: 'g', name: 'New' });
      await service.patch('W1', 'g', { name: 'New' }, Admin);
      expect(mockRepo.patch).toHaveBeenCalledWith(
        'W1',
        'g',
        expect.objectContaining({ name: 'New' }),
      );
    });

    it('404 když config neexistuje', async () => {
      mockRepo.patch.mockResolvedValue(null);
      await expect(
        service.patch('W1', 'x', { name: 'y' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    // FIX-62 — patch jen {seasons} (bez months) musí validovat proti
    // STÁVAJÍCÍM měsícům configu, ne rovnou projít (`!dto.months` → return).
    it('PATCH jen {seasons} (bez months) validuje proti stávajícím měsícům → SEASON_OUT_OF_RANGE', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        slug: 'g',
        months: [{ name: 'M1', daysCount: 30 }],
      });
      await expect(
        service.patch(
          'W1',
          'g',
          {
            seasons: [
              {
                id: 's1',
                name: 'Zima',
                startMonthIndex: 5,
                startDay: 1,
                color: '#000000',
              },
            ],
          },
          Admin,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.patch).not.toHaveBeenCalled();
    });

    it('PATCH jen {seasons} platné proti stávajícím měsícům → projde do repo', async () => {
      mockRepo.findBySlug.mockResolvedValue({
        slug: 'g',
        months: [
          { name: 'M1', daysCount: 30 },
          { name: 'M2', daysCount: 30 },
        ],
      });
      mockRepo.patch.mockResolvedValue({ slug: 'g' });
      const seasons = [
        {
          id: 's1',
          name: 'Zima',
          startMonthIndex: 1,
          startDay: 1,
          color: '#000000',
        },
      ];
      await service.patch('W1', 'g', { seasons }, Admin);
      expect(mockRepo.patch).toHaveBeenCalledWith(
        'W1',
        'g',
        expect.objectContaining({ seasons }),
      );
    });
  });

  describe('remove', () => {
    it('Smaže non-default config', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      mockRepo.remove.mockResolvedValue(true);
      await service.remove('W1', 'elfi', Admin);
      expect(mockRepo.remove).toHaveBeenCalledWith('W1', 'elfi');
    });

    it('Default config → 403 DEFAULT_CONFIG_LOCKED', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      await expect(service.remove('W1', 'gregorian', Admin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Non-existing config → 404', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      mockRepo.remove.mockResolvedValue(false);
      await expect(service.remove('W1', 'x', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    // CD-RUN-2 — smazaný config zvolený jako timeline kalendář → vynuluj
    // dangling `worldSettings.timelineCalendarSlug`.
    it('CD-RUN-2 — smazání config zvoleného jako timeline vynuluje slug', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      mockRepo.remove.mockResolvedValue(true);
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: 'elfi',
      });
      await service.remove('W1', 'elfi', Admin);
      expect(mockWorldSettings.upsert).toHaveBeenCalledWith('W1', {
        timelineCalendarSlug: null,
      });
    });

    it('CD-RUN-2 — smazání config, který NENÍ timeline, slug nemění', async () => {
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      mockRepo.remove.mockResolvedValue(true);
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: 'jiny-cal',
      });
      await service.remove('W1', 'elfi', Admin);
      expect(mockWorldSettings.upsert).not.toHaveBeenCalled();
    });
  });

  describe('seedGregorianDefault', () => {
    it('vytvoří Gregorian config', async () => {
      mockRepo.findBySlug.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue({ slug: 'gregorian' });
      const result = await service.seedGregorianDefault('W1');
      expect(result.slug).toBe('gregorian');
      expect(mockRepo.create).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({
          slug: 'gregorian',
          name: 'Gregoriánský kalendář',
        }),
      );
    });

    it('Idempotent — pokud existuje, vrátí existing', async () => {
      mockRepo.findBySlug.mockResolvedValue({ slug: 'gregorian' });
      const result = await service.seedGregorianDefault('W1');
      expect(result.slug).toBe('gregorian');
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  // 9.3 — dedicated timeline getter. Záměrně izolovaný od getConfigInternal.
  // 9.3-followup-FIX 2026-05-25: fallback hierarchie
  //   timelineSlug → world.defaultCalendarConfigSlug → configs[0] → null
  describe('getTimelineConfig', () => {
    const A = { slug: 'gregorian', name: 'Gregorian' } as never;
    const B = { slug: 'elf-cal', name: 'Elf' } as never;
    const C = { slug: 'dwarf-cal', name: 'Dwarf' } as never;

    it('1) explicit timelineSlug → vrátí ten config', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: 'elf-cal',
      });
      mockRepo.findAllByWorldId.mockResolvedValue([A, B, C]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBe(B);
      // World.defaultCalendarConfigSlug lookup vůbec neproběhne (early return).
      expect(mockWorlds.findById).not.toHaveBeenCalled();
    });

    it('2) timelineSlug=null → fallback na world.defaultCalendarConfigSlug', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: null,
      });
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'dwarf-cal',
      });
      mockRepo.findAllByWorldId.mockResolvedValue([A, B, C]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBe(C);
    });

    it('2) timelineSlug existuje ale config smazán → fallback default svět', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: 'deleted-cal',
      });
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'elf-cal',
      });
      mockRepo.findAllByWorldId.mockResolvedValue([A, B]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBe(B);
    });

    it('3) timelineSlug null + default slug taky chybí v configs → fallback configs[0]', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: null,
      });
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'phantom-cal',
      });
      mockRepo.findAllByWorldId.mockResolvedValue([A, B]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBe(A);
    });

    it('4) žádné configs → null', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: 'elf-cal',
      });
      mockRepo.findAllByWorldId.mockResolvedValue([]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBeNull();
    });

    it('worldSettings null + default svět → fallback default', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue(null);
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      mockRepo.findAllByWorldId.mockResolvedValue([A, B]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBe(A);
    });

    it('worldSettings null + svět null → fallback configs[0]', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue(null);
      mockWorlds.findById.mockResolvedValue(null);
      mockRepo.findAllByWorldId.mockResolvedValue([B, A]);
      const result = await service.getTimelineConfig('W1');
      expect(result).toBe(B);
    });

    it('regression: getConfigInternal stále používá defaultCalendarConfigSlug, ne settings', async () => {
      // 9.3 audit: změna timelineCalendarSlug nesmí ovlivnit getConfigInternal.
      mockWorldSettings.findByWorldId.mockResolvedValue({
        timelineCalendarSlug: 'elf-cal',
      });
      mockWorlds.findById.mockResolvedValue({
        id: 'W1',
        defaultCalendarConfigSlug: 'gregorian',
      });
      mockRepo.findBySlug.mockImplementation((_, slug) =>
        slug === 'gregorian' ? A : null,
      );
      const result = await service.getConfigInternal('W1');
      expect(result).toBe(A);
      expect(mockRepo.findBySlug).toHaveBeenCalledWith('W1', 'gregorian');
      // worldSettingsRepo MUSÍ zůstat nedotčeno
      expect(mockWorldSettings.findByWorldId).not.toHaveBeenCalled();
    });
  });
});
