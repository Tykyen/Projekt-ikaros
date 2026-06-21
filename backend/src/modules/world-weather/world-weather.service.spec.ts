import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WorldWeatherService,
  type WeatherRequester,
} from './world-weather.service';
import { ChatService } from '../chat/chat.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

const mockRepo = {
  findById: jest.fn(),
  findByWorldId: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  setCurrentWeather: jest.fn(),
  delete: jest.fn(),
  reorder: jest.fn(), // 9.4-I
};
const mockMembership = { findByUserAndWorld: jest.fn() };
const mockWorlds = {
  findById: jest.fn(),
  setActiveMapWeather: jest.fn(),
  clearActiveMapWeather: jest.fn(),
};
const mockChatService = { createSystemMessage: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };
// 9.4-I — nové dependency
const mockWorldSettings = {
  findByWorldId: jest.fn(),
  upsert: jest.fn(),
};
const mockWorldCalendar = { findBySlug: jest.fn() };
// 9.4-dluh — custom presets
const mockCustomPresetRepo = {
  findByWorldId: jest.fn(),
  findById: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  incrementUsage: jest.fn(),
};
// 9.4 dluh #2 — historie počasí
const mockHistoryRepo = {
  appendSnapshot: jest.fn().mockResolvedValue({}),
  findByGenerator: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};

// UserRole: Admin=2, Hrac=5
// WorldRole (D-053, 2026-05-13): Zadatel=0, Ctenar=1, Hrac=2, Korektor=3, PomocnyPJ=4, PJ=5
// World elevation: platform Admin má world bypass jen pokud je elevated pro daný svět.
const Admin: WeatherRequester = {
  id: 'a',
  role: 2,
  username: 'a',
  elevatedWorldIds: ['world1'],
};
// De-elevated admin (bez elevace pro world1) → world bypass NEPLATÍ.
const DeElevatedAdmin: WeatherRequester = { id: 'a', role: 2, username: 'a' };
const PomocnyPJ = { id: 'p', role: 5, username: 'p' } as const;
const Hrac = { id: 'h', role: 5, username: 'h' } as const;

const MOCK_GENERATOR = {
  id: 'gen1',
  worldId: 'world1',
  name: 'Albánie',
  config: {
    tempMin: 5,
    tempMax: 30,
    tempUnit: 'C' as const,
    weatherTypes: [
      {
        type: 'clear' as const,
        label: 'Jasno',
        icon: 'clear',
        probability: 100,
        cloudRange: [0, 1] as [number, number],
        precipRange: [0, 0] as [number, number],
      },
    ],
    windMin: 0,
    windMax: 20,
    windGustMultiplier: 2.0,
    pressureMin: 990,
    pressureMax: 1030,
    humidityMin: 20,
    humidityMax: 80,
    customFields: [],
  },
  currentWeather: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WorldWeatherService', () => {
  let service: WorldWeatherService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // 9.4-I — default mocks pro calendar context (žádný custom calendar = Gregorian fallback)
    mockWorldSettings.findByWorldId.mockResolvedValue(null);
    mockWorldCalendar.findBySlug.mockResolvedValue(null);
    // 9.4 dluh #2 — default historie mock (žádné explody)
    mockHistoryRepo.appendSnapshot.mockResolvedValue({});
    mockHistoryRepo.findByGenerator.mockResolvedValue([]);
    mockHistoryRepo.count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        WorldWeatherService,
        { provide: 'IWeatherGeneratorRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        { provide: 'IWorldSettingsRepository', useValue: mockWorldSettings },
        {
          provide: 'IWorldCalendarConfigRepository',
          useValue: mockWorldCalendar,
        },
        { provide: ChatService, useValue: mockChatService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        {
          provide: 'ICustomWeatherPresetRepository',
          useValue: mockCustomPresetRepo,
        },
        { provide: 'IWeatherHistoryRepository', useValue: mockHistoryRepo },
      ],
    }).compile();
    service = module.get(WorldWeatherService);
  });

  // ─── getAll ───────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('Admin: vrátí generátory bez kontroly členství', async () => {
      mockRepo.findByWorldId.mockResolvedValue([MOCK_GENERATOR]);
      const result = await service.getAll('world1', Admin);
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorldId).toHaveBeenCalledWith('world1');
      expect(mockMembership.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('de-elevated Admin (bez elevace pro svět) nemá bypass → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getAll('world1', DeElevatedAdmin),
      ).rejects.toMatchObject({ status: 403 });
      // Bypass neproběhl → sáhl na membership.
      expect(mockMembership.findByUserAndWorld).toHaveBeenCalled();
    });

    it('Hrac jako člen světa: vrátí generátory', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findByWorldId.mockResolvedValue([MOCK_GENERATOR]);
      const result = await service.getAll('world1', Hrac);
      expect(result).toHaveLength(1);
    });

    it('Hrac non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.getAll('world1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('Zadatel (pending) NESMÍ číst → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Zadatel,
      });
      await expect(service.getAll('world1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('neexistující svět: 404', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(service.getAll('fake', Hrac)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getOne ───────────────────────────────────────────────────────────────

  describe('getOne', () => {
    it('Admin: najde generátor', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      const result = await service.getOne('world1', 'gen1', Admin);
      expect(result.id).toBe('gen1');
    });

    it('neznámé id: 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.getOne('world1', 'bad', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('worldId mismatch: 404', async () => {
      mockRepo.findById.mockResolvedValue({
        ...MOCK_GENERATOR,
        worldId: 'other',
      });
      await expect(service.getOne('world1', 'gen1', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Hrac jako člen: vrátí generátor', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      const result = await service.getOne('world1', 'gen1', Hrac);
      expect(result.id).toBe('gen1');
    });

    it('non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getOne('world1', 'gen1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('Admin: uloží a vrátí generátor', async () => {
      mockRepo.save.mockResolvedValue(MOCK_GENERATOR);
      const dto = { name: 'Albánie', config: MOCK_GENERATOR.config };
      const result = await service.create('world1', dto, Admin);
      expect(result.name).toBe('Albánie');
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'world1', name: 'Albánie' }),
      );
    });

    it('PomocnyPJ: smí vytvořit', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.save.mockResolvedValue(MOCK_GENERATOR);
      await service.create(
        'world1',
        { name: 'X', config: MOCK_GENERATOR.config },
        PomocnyPJ,
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('Hrac bez členství: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.create(
          'world1',
          { name: 'X', config: MOCK_GENERATOR.config },
          Hrac,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('Korektor NESMÍ vytvořit: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Korektor,
      });
      await expect(
        service.create(
          'world1',
          { name: 'X', config: MOCK_GENERATOR.config },
          Hrac,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('neexistující svět: 404 (per auth-leak-policy: auth-required)', async () => {
      mockWorlds.findById.mockResolvedValue(null);
      await expect(
        service.create(
          'fake',
          { name: 'X', config: MOCK_GENERATOR.config },
          Hrac,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('Admin: partial update — name', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.update.mockResolvedValue({ ...MOCK_GENERATOR, name: 'Nový' });
      const result = await service.update(
        'world1',
        'gen1',
        { name: 'Nový' },
        Admin,
      );
      expect(result.name).toBe('Nový');
    });

    it('neznámé id: 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.update('world1', 'bad', { name: 'X' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('worldId mismatch: 404', async () => {
      mockRepo.findById.mockResolvedValue({
        ...MOCK_GENERATOR,
        worldId: 'other',
      });
      await expect(
        service.update('world1', 'gen1', { name: 'X' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('Hrac bez členství: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.update('world1', 'gen1', { name: 'X' }, Hrac),
      ).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('Admin: smaže a vrátí true', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.delete.mockResolvedValue(true);
      const result = await service.remove('world1', 'gen1', Admin);
      expect(result).toBe(true);
      expect(mockRepo.delete).toHaveBeenCalledWith('gen1');
    });

    it('neznámé id: 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.remove('world1', 'gen1', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('worldId mismatch: 404', async () => {
      mockRepo.findById.mockResolvedValue({
        ...MOCK_GENERATOR,
        worldId: 'other',
      });
      await expect(service.remove('world1', 'gen1', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Hrac bez členství: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.remove('world1', 'gen1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ─── validateConfig ───────────────────────────────────────────────────────

  describe('validateConfig (přes create)', () => {
    const badConfigBase = {
      ...MOCK_GENERATOR.config,
      weatherTypes: [
        {
          type: 'clear' as const,
          label: 'Jasno',
          icon: 'clear',
          probability: 100,
          cloudRange: [0, 1] as [number, number],
          precipRange: [0, 0] as [number, number],
        },
      ],
    };

    it('tempMin > tempMax: BadRequestException', async () => {
      const dto = {
        name: 'X',
        config: { ...badConfigBase, tempMin: 40, tempMax: 10 },
      };
      await expect(
        service.create('world1', dto as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('windMin > windMax: BadRequestException', async () => {
      const dto = {
        name: 'X',
        config: { ...badConfigBase, windMin: 50, windMax: 10 },
      };
      await expect(
        service.create('world1', dto as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('pressureMin > pressureMax: BadRequestException', async () => {
      const dto = {
        name: 'X',
        config: { ...badConfigBase, pressureMin: 1050, pressureMax: 980 },
      };
      await expect(
        service.create('world1', dto as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('humidityMin > humidityMax: BadRequestException', async () => {
      const dto = {
        name: 'X',
        config: { ...badConfigBase, humidityMin: 90, humidityMax: 10 },
      };
      await expect(
        service.create('world1', dto as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('windGustMultiplier < 1: BadRequestException', async () => {
      const dto = {
        name: 'X',
        config: { ...badConfigBase, windGustMultiplier: 0.5 },
      };
      await expect(
        service.create('world1', dto as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('probability součet != 100: BadRequestException', async () => {
      const dto = {
        name: 'X',
        config: {
          ...badConfigBase,
          weatherTypes: [
            {
              type: 'clear' as const,
              label: 'Jasno',
              icon: 'clear',
              probability: 60,
              cloudRange: [0, 1] as [number, number],
              precipRange: [0, 0] as [number, number],
            },
            {
              type: 'rain' as const,
              label: 'Déšť',
              icon: 'rain',
              probability: 60,
              cloudRange: [6, 8] as [number, number],
              precipRange: [1, 8] as [number, number],
            },
          ],
        },
      };
      await expect(
        service.create('world1', dto as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── seedDefaultForWorld ──────────────────────────────────────────────────

  describe('seedDefaultForWorld', () => {
    it('uloží výchozí generátor pro svět', async () => {
      mockRepo.save.mockResolvedValue(MOCK_GENERATOR);
      await service.seedDefaultForWorld('world1', 'fantasy');
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          name: 'Výchozí prostředí',
        }),
      );
    });

    it('genre fantasy: tempMin=-5, tempMax=30', async () => {
      let savedConfig: Record<string, unknown> | null = null;
      mockRepo.save.mockImplementation(
        (data: { config: Record<string, unknown> }) => {
          savedConfig = data.config;
          return Promise.resolve(MOCK_GENERATOR);
        },
      );
      await service.seedDefaultForWorld('world1', 'fantasy');
      expect(savedConfig).toMatchObject({ tempMin: -5, tempMax: 30 });
    });

    it('genre sci-fi: tempMin=-60, tempMax=60', async () => {
      let savedConfig: Record<string, unknown> | null = null;
      mockRepo.save.mockImplementation(
        (data: { config: Record<string, unknown> }) => {
          savedConfig = data.config;
          return Promise.resolve(MOCK_GENERATOR);
        },
      );
      await service.seedDefaultForWorld('world1', 'sci-fi');
      expect(savedConfig).toMatchObject({ tempMin: -60, tempMax: 60 });
    });
  });

  // ─── generate ─────────────────────────────────────────────────────────────

  describe('generate', () => {
    it('generate: Hrac non-member throws 403 (auth before impl)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.generate('world1', 'gen1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('generate: sets currentWeather with reasonable temperature', async () => {
      // 9.4-J — MOCK_GENERATOR nemá monthlyTemps → synth Gauss(střed, σ=4).
      // Střed = (5+30)/2 = 17.5, 4σ range = [1.5, 33.5]. Seed zajišťuje determinism.
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({
            ...MOCK_GENERATOR,
            currentWeather: weather,
          }),
      );

      const result = await service.generate('world1', 'gen1', Admin, {
        seed: 42,
      });
      const w = result.currentWeather!;

      // Široký rozsah — pokrývá synth Gauss i extreme events (do 3σ navíc).
      expect(w.temperature).toBeGreaterThanOrEqual(-3.5);
      expect(w.temperature).toBeLessThanOrEqual(38.5);
      expect(w.tempUnit).toBe('C');
      expect(w.isManual).toBe(false);
      expect(w.weatherType).toBe('Jasno');
      expect(w.weatherIcon).toBe('clear');
    });

    it('generate: picks weatherType by weighted probability', async () => {
      const genWith50_50 = {
        ...MOCK_GENERATOR,
        config: {
          ...MOCK_GENERATOR.config,
          weatherTypes: [
            {
              type: 'clear' as const,
              label: 'Jasno',
              icon: 'clear',
              probability: 50,
              cloudRange: [0, 1] as [number, number],
              precipRange: [0, 0] as [number, number],
            },
            {
              type: 'rain' as const,
              label: 'Déšť',
              icon: 'rain',
              probability: 50,
              cloudRange: [6, 8] as [number, number],
              precipRange: [2, 5] as [number, number],
            },
          ],
        },
      };
      mockRepo.findById.mockResolvedValue(genWith50_50);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({
            ...genWith50_50,
            currentWeather: weather,
          }),
      );

      // Math.random = 0.3 → cumulative 0–50, picks clear (index 0)
      jest.spyOn(Math, 'random').mockReturnValue(0.3);
      const r1 = await service.generate('world1', 'gen1', Admin);
      expect(r1.currentWeather!.weatherIcon).toBe('clear');

      // Math.random = 0.7 → cumulative 50–100, picks rain (index 1)
      jest.spyOn(Math, 'random').mockReturnValue(0.7);
      const r2 = await service.generate('world1', 'gen1', Admin);
      expect(r2.currentWeather!.weatherIcon).toBe('rain');

      jest.spyOn(Math, 'random').mockRestore();
    });

    it('generate: applies customFields when probability hits', async () => {
      const genWithCustom = {
        ...MOCK_GENERATOR,
        config: {
          ...MOCK_GENERATOR.config,
          customFields: [
            {
              label: 'Magická anomálie',
              possibleValues: ['Přítomna', 'Silná'],
              probability: 100,
            },
          ],
        },
      };
      mockRepo.findById.mockResolvedValue(genWithCustom);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({
            ...genWithCustom,
            currentWeather: weather,
          }),
      );

      const result = await service.generate('world1', 'gen1', Admin);
      expect(result.currentWeather!.extras).toHaveLength(1);
      expect(result.currentWeather!.extras[0].label).toBe('Magická anomálie');
      expect(['Přítomna', 'Silná']).toContain(
        result.currentWeather!.extras[0].value,
      );
    });

    it('generate: neznámé id throws 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.generate('world1', 'bad', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    // 9.4-J — Fallback pro generátory bez klimatického modelu.
    //   Před fixem: uniform random na [tempMin, tempMax] → ignoroval sezónu i klima,
    //                Ghana v únoru mohla dát 3°C i 20°C s rovnou pravděpodobností.
    //   Po fixu: synth Array(12).fill((min+max)/2) + defaultStdDev=4 → Gauss kolem středu.
    //   Response navíc nese `climateModelMissing: true` aby FE zobrazil banner.
    it('generate: fallback Gauss když chybí monthlyTemps (9.4-J)', async () => {
      const noClimateGen = {
        ...MOCK_GENERATOR,
        config: {
          ...MOCK_GENERATOR.config,
          tempMin: 0,
          tempMax: 25,
          // monthlyTemps záměrně chybí
        },
      };
      mockRepo.findById.mockResolvedValue(noClimateGen);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...noClimateGen, currentWeather: weather }),
      );

      // Seed → deterministický gaussianRandom v simulation modulu.
      const result = await service.generate('world1', 'gen1', Admin, {
        seed: 42,
      });
      const w = result.currentWeather!;

      expect(w.climateModelMissing).toBe(true);
      // Synth střed = (0+25)/2 = 12.5, σ = 4. 4σ range = [-3.5, 28.5].
      expect(w.temperature).toBeGreaterThanOrEqual(-3.5);
      expect(w.temperature).toBeLessThanOrEqual(28.5);
      expect(Number.isFinite(w.temperature)).toBe(true);
    });

    it('generate: climateModelMissing=false když config má monthlyTemps', async () => {
      const withClimate = {
        ...MOCK_GENERATOR,
        config: {
          ...MOCK_GENERATOR.config,
          monthlyTemps: [27, 28, 28, 28, 28, 27, 26, 25, 26, 27, 28, 27],
          climateZone: 'Aw' as const,
        },
      };
      mockRepo.findById.mockResolvedValue(withClimate);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...withClimate, currentWeather: weather }),
      );
      const result = await service.generate('world1', 'gen1', Admin, {
        seed: 42,
      });
      expect(result.currentWeather!.climateModelMissing).toBe(false);
    });
  });

  // ─── setCurrentWeather ────────────────────────────────────────────────────

  describe('setCurrentWeather', () => {
    const manualWeatherDto = {
      temperature: 22,
      tempUnit: 'C',
      weatherType: 'Jasno',
      weatherIcon: 'clear',
      cloudiness: { value: '0/8 Jasno', description: 'Obloha bez mraků' },
      precipitation: { value: 'Beze srážek', description: '' },
      wind: { speed: 5, gusts: 10, unit: 'kmh' },
      pressure: { value: 1015, trend: 'Stabilní' },
      humidity: 45,
      extras: [],
    };

    it('setCurrentWeather: Admin uloží manuální počasí s isManual=true', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({
            ...MOCK_GENERATOR,
            currentWeather: weather,
          }),
      );

      const result = await service.setCurrentWeather(
        'world1',
        'gen1',
        manualWeatherDto,
        Admin,
      );
      expect(result.currentWeather!.isManual).toBe(true);
      expect(result.currentWeather!.temperature).toBe(22);
      expect(result.currentWeather!.weatherType).toBe('Jasno');
      expect(mockRepo.setCurrentWeather).toHaveBeenCalledWith(
        'gen1',
        expect.objectContaining({ isManual: true }),
      );
    });

    it('setCurrentWeather: Hrac non-member throws 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.setCurrentWeather(
          'world1',
          'gen1',
          manualWeatherDto as never,
          Hrac,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('setCurrentWeather: neznámé id throws 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.setCurrentWeather(
          'world1',
          'bad',
          manualWeatherDto as never,
          Admin,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── broadcast ────────────────────────────────────────────────────────────

  describe('broadcast', () => {
    const GEN_WITH_WEATHER = {
      ...MOCK_GENERATOR,
      currentWeather: {
        generatedAt: new Date(),
        isManual: false,
        temperature: 21,
        tempUnit: 'C',
        weatherType: 'Jasno',
        weatherIcon: 'clear',
        cloudiness: { value: '0/8 Jasno', description: 'Obloha bez mraků' },
        precipitation: { value: 'Beze srážek', description: '' },
        wind: { speed: 5, gusts: 10, unit: 'kmh' },
        pressure: { value: 1015, trend: 'Stabilní' },
        humidity: 45,
        extras: [],
      },
    };

    it('broadcast do chatu volá createSystemMessage', async () => {
      mockRepo.findById.mockResolvedValue(GEN_WITH_WEATHER);
      mockChatService.createSystemMessage.mockResolvedValue(undefined);
      await service.broadcast(
        'world1',
        'gen1',
        { target: 'chat', channelId: 'ch1' },
        Admin,
      );
      expect(mockChatService.createSystemMessage).toHaveBeenCalledWith(
        'ch1',
        'world1',
        expect.stringContaining('Jasno'),
        expect.stringContaining('Albánie'),
      );
    });

    it('broadcast do mapy emituje weather.updated event', async () => {
      mockRepo.findById.mockResolvedValue(GEN_WITH_WEATHER);
      await service.broadcast('world1', 'gen1', { target: 'map' }, Admin);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'weather.updated',
        expect.objectContaining({
          worldId: 'world1',
          generatorId: 'gen1',
          generatorName: 'Albánie',
        }),
      );
    });

    it('broadcast do mapy persistuje World.activeMapWeather (10.2i)', async () => {
      mockRepo.findById.mockResolvedValue(GEN_WITH_WEATHER);
      await service.broadcast('world1', 'gen1', { target: 'map' }, Admin);
      expect(mockWorlds.setActiveMapWeather).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({
          generatorId: 'gen1',
          generatorName: 'Albánie',
          weather: GEN_WITH_WEATHER.currentWeather,
          setAt: expect.any(Date),
        }),
      );
    });

    it('broadcast: chybějící currentWeather → ConflictException', async () => {
      mockRepo.findById.mockResolvedValue({
        ...MOCK_GENERATOR,
        currentWeather: undefined,
      });
      await expect(
        service.broadcast(
          'world1',
          'gen1',
          { target: 'chat', channelId: 'ch1' },
          Admin,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('broadcast do chatu bez channelId → BadRequestException', async () => {
      mockRepo.findById.mockResolvedValue(GEN_WITH_WEATHER);
      await expect(
        service.broadcast('world1', 'gen1', { target: 'chat' } as never, Admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('broadcast: neexistující generátor → NotFoundException', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(
        service.broadcast('world1', 'bad', { target: 'map' }, Admin),
      ).rejects.toThrow(NotFoundException);
    });

    it('broadcast: Hrac non-member → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.broadcast('world1', 'gen1', { target: 'map' }, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ─── clearMapWeather (10.2i) ────────────────────────────────────────────────

  describe('clearMapWeather', () => {
    it('vyčistí World.activeMapWeather a emituje weather.updated s null', async () => {
      await service.clearMapWeather('world1', Admin);
      expect(mockWorlds.clearActiveMapWeather).toHaveBeenCalledWith('world1');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'weather.updated',
        expect.objectContaining({
          worldId: 'world1',
          weather: null,
          activeMapWeather: null,
        }),
      );
    });

    it('Hrac non-member → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.clearMapWeather('world1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ─── Custom presets (9.4-dluh) ─────────────────────────────────────────

  describe('Custom presets', () => {
    const MOCK_CUSTOM_PRESET = {
      id: 'cp1',
      worldId: 'world1',
      name: 'Severní lesy mého světa',
      description: 'Pro lesní regiony Aelos',
      emoji: '🌲',
      config: MOCK_GENERATOR.config,
      createdBy: 'p',
      usageCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const validConfigDto = {
      tempMin: 5,
      tempMax: 30,
      tempUnit: 'C' as const,
      weatherTypes: [
        {
          type: 'clear',
          label: 'Jasno',
          icon: 'clear',
          probability: 100,
          cloudRange: [0, 1] as [number, number],
          precipRange: [0, 0] as [number, number],
        },
      ],
      windMin: 0,
      windMax: 20,
      windGustMultiplier: 2.0,
      pressureMin: 990,
      pressureMax: 1030,
      humidityMin: 20,
      humidityMax: 80,
      customFields: [],
    };

    it('list: member načte presety světa', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockCustomPresetRepo.findByWorldId.mockResolvedValue([
        MOCK_CUSTOM_PRESET,
      ]);
      const result = await service.listCustomPresets('world1', Hrac);
      expect(result).toHaveLength(1);
      expect(mockCustomPresetRepo.findByWorldId).toHaveBeenCalledWith('world1');
    });

    it('create: PomocnyPJ uloží preset z dto + nastaví createdBy=requester.id', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockCustomPresetRepo.save.mockImplementation((data) =>
        Promise.resolve({
          ...data,
          id: 'new',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      const dto = {
        name: 'Můj preset',
        description: 'desc',
        emoji: '🌲',
        config: validConfigDto,
      };
      await service.createCustomPreset('world1', dto, PomocnyPJ);
      expect(mockCustomPresetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          name: 'Můj preset',
          emoji: '🌲',
          createdBy: 'p',
          usageCount: 0,
        }),
      );
    });

    it('create: Hrac (non-PomocnyPJ) → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      const dto = { name: 'X', config: validConfigDto };
      await expect(
        service.createCustomPreset('world1', dto, Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('update: změní jen metadata (name/description/emoji), config nikoli', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockCustomPresetRepo.findById.mockResolvedValue(MOCK_CUSTOM_PRESET);
      mockCustomPresetRepo.update.mockResolvedValue({
        ...MOCK_CUSTOM_PRESET,
        name: 'Nové jméno',
      });
      await service.updateCustomPreset(
        'world1',
        'cp1',
        { name: 'Nové jméno', description: 'nový popis', emoji: '⭐' },
        PomocnyPJ,
      );
      expect(mockCustomPresetRepo.update).toHaveBeenCalledWith('cp1', {
        name: 'Nové jméno',
        description: 'nový popis',
        emoji: '⭐',
      });
      // Důležité: update payload NEMÁ klíč `config` (immutability invariant)
      const args = mockCustomPresetRepo.update.mock.calls[0][1];
      expect(args).not.toHaveProperty('config');
    });

    it('update: world isolation — preset z jiného světa → 404', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockCustomPresetRepo.findById.mockResolvedValue({
        ...MOCK_CUSTOM_PRESET,
        worldId: 'world2', // patří jinému světu
      });
      await expect(
        service.updateCustomPreset('world1', 'cp1', { name: 'X' }, PomocnyPJ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('delete: vyžaduje PJ — PomocnyPJ dostane 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        service.deleteCustomPreset('world1', 'cp1', PomocnyPJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('delete: PJ smaže preset', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockCustomPresetRepo.findById.mockResolvedValue(MOCK_CUSTOM_PRESET);
      mockCustomPresetRepo.delete.mockResolvedValue(true);
      const ok = await service.deleteCustomPreset('world1', 'cp1', {
        id: 'pj',
        role: 5,
        username: 'pj',
      } as const);
      expect(ok).toBe(true);
      expect(mockCustomPresetRepo.delete).toHaveBeenCalledWith('cp1');
    });

    it('use: PomocnyPJ inkrementuje usageCount', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockCustomPresetRepo.findById.mockResolvedValue(MOCK_CUSTOM_PRESET);
      mockCustomPresetRepo.incrementUsage.mockResolvedValue({
        ...MOCK_CUSTOM_PRESET,
        usageCount: 4,
      });
      const result = await service.useCustomPreset('world1', 'cp1', PomocnyPJ);
      expect(result.usageCount).toBe(4);
      expect(mockCustomPresetRepo.incrementUsage).toHaveBeenCalledWith('cp1');
    });
  });

  // ─── 9.4 dluh #1 — advanceDay ────────────────────────────────────────────
  describe('advanceDay (dluh #1)', () => {
    it('init currentInGameDate z new Date() při null + advance o 1 den', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([MOCK_GENERATOR]);
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, currentWeather: weather }),
      );

      const result = await service.advanceDay('world1', Admin, 1);

      expect(mockWorldSettings.upsert).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ currentInGameDate: expect.any(Date) }),
      );
      expect(result.updatedGenerators).toHaveLength(1);
      expect(result.newInGameDate).toBeInstanceOf(Date);
      expect(result.monthIndex).toBeGreaterThanOrEqual(0);
      expect(result.monthIndex).toBeLessThanOrEqual(11);
    });

    it('advance o 7 dní v Gregorian režimu posune datum o 7 dní', async () => {
      const startDate = new Date('2026-05-26T00:00:00.000Z');
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: startDate,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([]);
      const result = await service.advanceDay('world1', Admin, 7);

      const expectedTime = startDate.getTime() + 7 * 86_400_000;
      expect(result.newInGameDate.getTime()).toBe(expectedTime);
      expect(result.day).toBe(2); // 26 + 7 = 33 → 2. června
      expect(result.monthIndex).toBe(5); // Červen (0-based)
    });

    it('custom calendar advance — monthIndex + day valid', async () => {
      const calendar = {
        worldId: 'world1',
        slug: 'cal1',
        months: [
          { name: 'Praimul', daysCount: 10 },
          { name: 'Septimul', daysCount: 10 },
          { name: 'Hexul', daysCount: 10 },
        ],
        epochOffset: 0,
        celestialBodies: [],
        seasons: [],
      };
      const startDate = new Date('2026-05-26T00:00:00.000Z');
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: startDate,
        timelineCalendarSlug: 'cal1',
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockWorldCalendar.findBySlug.mockResolvedValue(calendar);
      mockRepo.findByWorldId.mockResolvedValue([]);

      const result = await service.advanceDay('world1', Admin, 5);

      expect(['Praimul', 'Septimul', 'Hexul']).toContain(result.monthName);
      expect(result.monthIndex).toBeGreaterThanOrEqual(0);
      expect(result.monthIndex).toBeLessThan(3);
      expect(result.day).toBeGreaterThanOrEqual(1);
      expect(result.day).toBeLessThanOrEqual(10);
    });

    it('PomocnyPJ smí volat advanceDay', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: new Date('2026-05-26'),
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([]);
      await expect(
        service.advanceDay('world1', PomocnyPJ, 1),
      ).resolves.toBeDefined();
    });

    it('Hrac non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.advanceDay('world1', Hrac, 1)).rejects.toMatchObject(
        { status: 403 },
      );
    });

    it('days mimo rozsah → BadRequestException', async () => {
      await expect(service.advanceDay('world1', Admin, 0)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.advanceDay('world1', Admin, 1000)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── 9.4 — setInGameDate ────────────────────────────────────────────────
  describe('setInGameDate', () => {
    it('Admin: updates worldSettings.currentInGameDate', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockImplementation((_w, data) =>
        Promise.resolve({ worldId: 'world1', ...data }),
      );
      mockRepo.findByWorldId.mockResolvedValue([]);

      const result = await service.setInGameDate(
        'world1',
        { year: 2026, monthIndex: 4, day: 15 },
        Admin,
      );

      expect(mockWorldSettings.upsert).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ currentInGameDate: expect.any(Date) }),
      );
      const upsertedDate = mockWorldSettings.upsert.mock.calls[0][1]
        .currentInGameDate as Date;
      expect(upsertedDate.getUTCFullYear()).toBe(2026);
      expect(upsertedDate.getUTCMonth()).toBe(4);
      expect(upsertedDate.getUTCDate()).toBe(15);
      expect(result.regenerated).toEqual([]);
    });

    it('regenerateAll: true → volá generate pro každý generátor', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([
        MOCK_GENERATOR,
        { ...MOCK_GENERATOR, id: 'gen2' },
      ]);
      mockRepo.findById.mockImplementation((id: string) =>
        Promise.resolve({ ...MOCK_GENERATOR, id }),
      );
      mockRepo.setCurrentWeather.mockImplementation(
        (id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, id, currentWeather: weather }),
      );

      const result = await service.setInGameDate(
        'world1',
        { year: 1180, monthIndex: 6, day: 20, regenerateAll: true },
        Admin,
      );

      expect(result.regenerated).toHaveLength(2);
      expect(mockRepo.setCurrentWeather).toHaveBeenCalledTimes(2);
    });

    it('regenerateAll: best-effort — chyba u jednoho neshazuje ostatní', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([
        MOCK_GENERATOR,
        { ...MOCK_GENERATOR, id: 'gen2' },
      ]);
      // První findById úspěch, druhý vyhodí chybu (simulace broken gen).
      mockRepo.findById
        .mockResolvedValueOnce(MOCK_GENERATOR)
        .mockResolvedValueOnce(null); // 404 → throw v generate()
      mockRepo.setCurrentWeather.mockImplementation(
        (id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, id, currentWeather: weather }),
      );

      const result = await service.setInGameDate(
        'world1',
        { year: 2026, monthIndex: 4, day: 15, regenerateAll: true },
        Admin,
      );

      // Jeden generátor selhal → regenerated obsahuje jen 1.
      expect(result.regenerated).toHaveLength(1);
    });

    it('custom calendar — monthIndex >= monthsTotal: BadRequestException', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: 'cal1',
      });
      mockWorldCalendar.findBySlug.mockResolvedValue({
        worldId: 'world1',
        slug: 'cal1',
        months: [
          { name: 'Praimul', daysCount: 10 },
          { name: 'Septimul', daysCount: 10 },
          { name: 'Hexul', daysCount: 10 },
        ],
        epochOffset: 0,
      });
      // monthIndex=5 > monthsTotal=3 → reject
      await expect(
        service.setInGameDate(
          'world1',
          { year: 100, monthIndex: 5, day: 1 },
          Admin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('PomocnyPJ smí volat setInGameDate', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([]);

      await expect(
        service.setInGameDate(
          'world1',
          { year: 2026, monthIndex: 4, day: 15 },
          PomocnyPJ,
        ),
      ).resolves.toBeDefined();
    });

    it('Hrac non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.setInGameDate(
          'world1',
          { year: 2026, monthIndex: 4, day: 15 },
          Hrac,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('negative year (BCE) supported', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: null,
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockImplementation((_w, data) =>
        Promise.resolve({ worldId: 'world1', ...data }),
      );
      mockRepo.findByWorldId.mockResolvedValue([]);

      await service.setInGameDate(
        'world1',
        { year: -500, monthIndex: 2, day: 10 },
        Admin,
      );
      const upsertedDate = mockWorldSettings.upsert.mock.calls[0][1]
        .currentInGameDate as Date;
      expect(upsertedDate.getUTCFullYear()).toBe(-500);
      expect(upsertedDate.getUTCMonth()).toBe(2);
    });
  });

  // ─── 9.4 dluh #2 — historie počasí ───────────────────────────────────────
  describe('history (dluh #2)', () => {
    it('generate volá appendSnapshot s trigger="generate"', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, currentWeather: weather }),
      );
      await service.generate('world1', 'gen1', Admin);
      expect(mockHistoryRepo.appendSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          generatorId: 'gen1',
          trigger: 'generate',
        }),
      );
    });

    it('setCurrentWeather volá appendSnapshot s trigger="manual"', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, currentWeather: weather }),
      );
      const dto = {
        temperature: 22,
        tempUnit: 'C',
        weatherType: 'Jasno',
        weatherIcon: 'clear',
        cloudiness: { value: '0/8', description: '' },
        precipitation: { value: '', description: '' },
        wind: { speed: 5, gusts: 10, unit: 'kmh' },
        pressure: { value: 1015, trend: '' },
        humidity: 45,
        extras: [],
      };
      await service.setCurrentWeather('world1', 'gen1', dto, Admin);
      expect(mockHistoryRepo.appendSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: 'manual' }),
      );
    });

    it('advance-day appendSnapshot má trigger="advance-day" + inGameDate', async () => {
      mockWorldSettings.findByWorldId.mockResolvedValue({
        worldId: 'world1',
        currentInGameDate: new Date('2026-05-26'),
        timelineCalendarSlug: null,
      });
      mockWorldSettings.upsert.mockResolvedValue({});
      mockRepo.findByWorldId.mockResolvedValue([MOCK_GENERATOR]);
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, currentWeather: weather }),
      );
      await service.advanceDay('world1', Admin, 1);
      expect(mockHistoryRepo.appendSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'advance-day',
          inGameDate: expect.any(Date),
        }),
      );
    });

    it('getHistory vrátí items + total', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockHistoryRepo.findByGenerator.mockResolvedValue([
        { id: 'h1', trigger: 'generate' },
        { id: 'h2', trigger: 'manual' },
      ]);
      mockHistoryRepo.count.mockResolvedValue(12);
      const result = await service.getHistory('world1', 'gen1', Admin, {
        limit: 10,
        offset: 0,
      });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(12);
      expect(mockHistoryRepo.findByGenerator).toHaveBeenCalledWith(
        'world1',
        'gen1',
        10,
        0,
      );
    });

    it('getHistory: Hrac non-member → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getHistory('world1', 'gen1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('getHistory: neznámý generátor → 404', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.getHistory('world1', 'bad', Admin)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('history append failure NEZASTAVÍ primary generate', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({ ...MOCK_GENERATOR, currentWeather: weather }),
      );
      mockHistoryRepo.appendSnapshot.mockRejectedValueOnce(
        new Error('DB outage'),
      );
      await expect(
        service.generate('world1', 'gen1', Admin),
      ).resolves.toBeDefined();
    });
  });
});
