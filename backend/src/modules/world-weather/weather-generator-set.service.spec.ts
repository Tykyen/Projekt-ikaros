// backend/src/modules/world-weather/weather-generator-set.service.spec.ts

import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeatherGeneratorSetService } from './weather-generator-set.service';
import { WorldWeatherService } from './world-weather.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';

/**
 * 9.4 Weather Generator Set — service spec.
 *
 * Pokrytí: list, create, update whitelist (nemůže přepsat appliedCount/createdBy
 * přes update), delete role gate (PJ+), apply increment counter, apply empty
 * resolvedItems → 400, world isolation, member auth.
 */

const mockRepo = {
  findByWorldId: jest.fn(),
  findById: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  incrementAppliedCount: jest.fn(),
};
const mockMembership = { findByUserAndWorld: jest.fn() };
const mockWorlds = { findById: jest.fn() };
const mockWeatherService = {
  create: jest.fn(),
};

// UserRole: Admin=2, Hrac=5
// WorldRole: Zadatel=0, Ctenar=1, Hrac=2, Korektor=3, PomocnyPJ=4, PJ=5
const Admin = { id: 'a', role: 2, username: 'a' } as const;
const PomocnyPJ = { id: 'p', role: 5, username: 'p' } as const;
const Hrac = { id: 'h', role: 5, username: 'h' } as const;
const PJ = { id: 'pj', role: 5, username: 'pj' } as const;

const MOCK_SET = {
  id: 'set1',
  worldId: 'world1',
  name: 'Evropa cestování',
  description: 'Praha, Vídeň, Berlín',
  emoji: '🌧️',
  items: [
    {
      presetId: 'city:Evropa:Česko:Praha',
      generatorName: 'Praha',
    },
    {
      presetId: 'city:Evropa:Rakousko:Vídeň',
      generatorName: 'Vídeň',
    },
  ],
  createdBy: 'p',
  appliedCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('WeatherGeneratorSetService', () => {
  let service: WeatherGeneratorSetService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        WeatherGeneratorSetService,
        { provide: 'IWeatherGeneratorSetRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembership },
        { provide: 'IWorldsRepository', useValue: mockWorlds },
        { provide: WorldWeatherService, useValue: mockWeatherService },
      ],
    }).compile();
    service = module.get(WeatherGeneratorSetService);
  });

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('Admin: vrátí sety bez kontroly členství', async () => {
      mockRepo.findByWorldId.mockResolvedValue([MOCK_SET]);
      const result = await service.list('world1', Admin);
      expect(result).toHaveLength(1);
      expect(mockRepo.findByWorldId).toHaveBeenCalledWith('world1');
      expect(mockMembership.findByUserAndWorld).not.toHaveBeenCalled();
    });

    it('Hrac jako člen: vrátí sety', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findByWorldId.mockResolvedValue([MOCK_SET]);
      const result = await service.list('world1', Hrac);
      expect(result).toHaveLength(1);
    });

    it('Hrac non-member: 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.list('world1', Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('PomocnyPJ: uloží set s createdBy=requester.id', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.save.mockImplementation((data) =>
        Promise.resolve({
          ...data,
          id: 'new',
          appliedCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      const dto = {
        name: 'Můj set',
        emoji: '🌲',
        items: [{ presetId: 'archetype:cfb-oceanic', generatorName: 'Praha' }],
      };
      await service.create('world1', dto, PomocnyPJ);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'world1',
          name: 'Můj set',
          emoji: '🌲',
          createdBy: 'p',
          items: expect.arrayContaining([
            expect.objectContaining({
              presetId: 'archetype:cfb-oceanic',
              generatorName: 'Praha',
            }),
          ]),
        }),
      );
      // save NESMÍ obsahovat appliedCount — to nastavuje repo
      const args = mockRepo.save.mock.calls[0][0];
      expect(args).not.toHaveProperty('appliedCount');
    });

    it('Hrac (non-PomocnyPJ) → 403', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      const dto = {
        name: 'X',
        items: [{ presetId: 'archetype:x', generatorName: 'Y' }],
      };
      await expect(service.create('world1', dto, Hrac)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('empty items → 400 (defense-in-depth, validator chytne dřív)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      const dto = { name: 'X', items: [] };
      await expect(service.create('world1', dto, PomocnyPJ)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('whitelist — repo.update dostane jen name/description/emoji/items, ne appliedCount ani createdBy', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue(MOCK_SET);
      mockRepo.update.mockResolvedValue({
        ...MOCK_SET,
        name: 'Nový název',
      });
      await service.update(
        'world1',
        'set1',
        {
          name: 'Nový název',
          description: 'nové',
          emoji: '⭐',
          items: [{ presetId: 'archetype:x', generatorName: 'Y' }],
          // Klienti by mohli zkusit poslat tohle, ale TS to nepustí — service
          // jen pole z whitelist propaguje.
        },
        PomocnyPJ,
      );
      const args = mockRepo.update.mock.calls[0][1];
      expect(args).toHaveProperty('name', 'Nový název');
      expect(args).toHaveProperty('items');
      expect(args).not.toHaveProperty('appliedCount');
      expect(args).not.toHaveProperty('createdBy');
      expect(args).not.toHaveProperty('worldId');
    });

    it('world isolation — set z jiného světa → 404', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue({ ...MOCK_SET, worldId: 'world2' });
      await expect(
        service.update('world1', 'set1', { name: 'X' }, PomocnyPJ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('empty items v update → 400', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue(MOCK_SET);
      await expect(
        service.update('world1', 'set1', { items: [] }, PomocnyPJ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── delete (PJ+ gate) ────────────────────────────────────────────────────

  describe('delete', () => {
    it('PomocnyPJ → 403 (vyžaduje PJ+)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      await expect(
        service.remove('world1', 'set1', PomocnyPJ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('PJ smaže set', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.findById.mockResolvedValue(MOCK_SET);
      mockRepo.delete.mockResolvedValue(true);
      const ok = await service.remove('world1', 'set1', PJ);
      expect(ok).toBe(true);
      expect(mockRepo.delete).toHaveBeenCalledWith('set1');
    });
  });

  // ─── apply ────────────────────────────────────────────────────────────────

  describe('apply', () => {
    it('PomocnyPJ: vytvoří N generátorů + inkrementuje appliedCount', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue(MOCK_SET);
      mockWeatherService.create
        .mockResolvedValueOnce({ id: 'gen1', name: 'Praha' })
        .mockResolvedValueOnce({ id: 'gen2', name: 'Vídeň' });
      mockRepo.incrementAppliedCount.mockResolvedValue(undefined);

      const dto = {
        resolvedItems: [
          {
            name: 'Praha',
            config: { tempMin: 5, tempMax: 25 } as Record<string, unknown>,
          },
          {
            name: 'Vídeň',
            config: { tempMin: 4, tempMax: 26 } as Record<string, unknown>,
          },
        ],
      };
      const result = await service.apply('world1', 'set1', dto, PomocnyPJ);
      expect(result).toHaveLength(2);
      expect(mockWeatherService.create).toHaveBeenCalledTimes(2);
      expect(mockWeatherService.create).toHaveBeenCalledWith(
        'world1',
        expect.objectContaining({ name: 'Praha' }),
        PomocnyPJ,
      );
      expect(mockRepo.incrementAppliedCount).toHaveBeenCalledWith('set1');
    });

    it('empty resolvedItems → 400 (FE musí pre-resolve)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue(MOCK_SET);
      await expect(
        service.apply('world1', 'set1', { resolvedItems: [] }, PomocnyPJ),
      ).rejects.toThrow(BadRequestException);
      expect(mockWeatherService.create).not.toHaveBeenCalled();
      expect(mockRepo.incrementAppliedCount).not.toHaveBeenCalled();
    });

    it('set z jiného světa → 404 (world isolation)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue({ ...MOCK_SET, worldId: 'world2' });
      await expect(
        service.apply(
          'world1',
          'set1',
          {
            resolvedItems: [{ name: 'X', config: {} }],
          },
          PomocnyPJ,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('Hrac → 403 (apply je write-action, PomocnyPJ+)', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      await expect(
        service.apply(
          'world1',
          'set1',
          {
            resolvedItems: [{ name: 'X', config: {} }],
          },
          Hrac,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('weatherService.create selže → propagate exception, appliedCount se NEINKREMENTUJE', async () => {
      mockWorlds.findById.mockResolvedValue({ id: 'world1' });
      mockMembership.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findById.mockResolvedValue(MOCK_SET);
      mockWeatherService.create.mockRejectedValueOnce(
        new BadRequestException('invalid config'),
      );
      await expect(
        service.apply(
          'world1',
          'set1',
          {
            resolvedItems: [{ name: 'X', config: {} }],
          },
          PomocnyPJ,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.incrementAppliedCount).not.toHaveBeenCalled();
    });
  });
});
