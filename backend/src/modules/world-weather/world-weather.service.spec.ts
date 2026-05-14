import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorldWeatherService } from './world-weather.service';
import { ChatService } from '../chat/chat.service';

const mockRepo = {
  findById: jest.fn(),
  findByWorldId: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  setCurrentWeather: jest.fn(),
  delete: jest.fn(),
};
const mockMembership = { findByUserAndWorld: jest.fn() };
const mockWorlds = { findById: jest.fn() };
const mockChatService = { createSystemMessage: jest.fn() };
const mockEventEmitter = { emit: jest.fn() };

// UserRole: Admin=2, Hrac=5
// WorldRole: Pending=-1, Hrac=0, Korektor=1, PomocnyPJ=2, PJ=3
const Admin = { id: 'a', role: 2, username: 'a' } as const;
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
    const module = await Test.createTestingModule({
      providers: [
        WorldWeatherService,
        { provide: 'IWeatherGeneratorRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        { provide: ChatService, useValue: mockChatService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
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

    it('Hrac jako člen světa: vrátí generátory', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 }); // WorldRole.Hrac
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

    it('Pending (role -1): 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: -1 });
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
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 0 });
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

    it('PomocnyPJ (world role 2): smí vytvořit', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 2 }); // PomocnyPJ
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

    it('Hrac jako Korektor (world role 1): 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({ role: 1 }); // Korektor
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

    it('generate: sets currentWeather with correct temperature range', async () => {
      mockRepo.findById.mockResolvedValue(MOCK_GENERATOR);
      mockRepo.setCurrentWeather.mockImplementation(
        (_id: string, weather: unknown) =>
          Promise.resolve({
            ...MOCK_GENERATOR,
            currentWeather: weather,
          }),
      );

      const result = await service.generate('world1', 'gen1', Admin);
      const w = result.currentWeather!;

      expect(w.temperature).toBeGreaterThanOrEqual(
        MOCK_GENERATOR.config.tempMin,
      );
      expect(w.temperature).toBeLessThanOrEqual(MOCK_GENERATOR.config.tempMax);
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
});
