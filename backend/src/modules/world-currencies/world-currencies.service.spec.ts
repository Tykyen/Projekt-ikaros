import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { WorldCurrenciesService } from './world-currencies.service';
import { WorldRole } from '../worlds/interfaces/world-membership.interface';
import { UserRole } from '../users/interfaces/user.interface';

const mockRepo = {
  findByWorldId: jest.fn(),
  upsert: jest.fn(),
  replaceIfUnchanged: jest.fn(),
};

const mockMembershipRepo = {
  findByUserAndWorld: jest.fn(),
};

const mockWorldsRepo = {
  findById: jest.fn(),
};

const mockWorld = {
  id: 'world1',
  name: 'Matrix',
  slug: 'matrix',
  ownerId: 'owner1',
  genre: 'fantasy',
  isActive: true,
  accessMode: 'private',
  playerCount: 0,
  system: 'matrix',
  tones: [],
  dice: [],
  offeredCharacters: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockItems = [
  { id: 'id1', code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
  { id: 'id2', code: 'ST', name: 'Stříbrňák', symbol: 'St', rate: 0.1 },
  { id: 'id3', code: 'MD', name: 'Měďák', symbol: 'Md', rate: 0.01 },
];

describe('WorldCurrenciesService', () => {
  let service: WorldCurrenciesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WorldCurrenciesService,
        { provide: 'IWorldCurrenciesRepository', useValue: mockRepo },
        { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
        { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
      ],
    }).compile();
    service = module.get(WorldCurrenciesService);
    jest.clearAllMocks();
  });

  describe('getCurrencies', () => {
    it('should return currencies for world member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findByWorldId.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: mockItems,
        updatedAt: new Date(),
      });

      const result = await service.getCurrencies('world1', 'user1');
      expect(result.items).toHaveLength(3);
      expect(result.worldId).toBe('world1');
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);

      await expect(service.getCurrencies('world1', 'user1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return empty items when no document exists', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findByWorldId.mockResolvedValue(null);

      const result = await service.getCurrencies('world1', 'user1');
      expect(result.items).toEqual([]);
    });
  });

  describe('updateCurrencies', () => {
    it('should update currencies for PJ', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.upsert.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: mockItems,
        updatedAt: new Date(),
      });

      const result = await service.updateCurrencies('world1', mockItems, {
        id: 'pj1',
        role: 3,
        username: 'pj',
      });
      expect(result.items).toHaveLength(3);
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'ZL' })]),
      );
    });

    it('should throw ForbiddenException for Hrac', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });

      await expect(
        service.updateCurrencies('world1', mockItems, {
          id: 'user1',
          role: 3,
          username: 'u',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should assign UUID to items without id', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.upsert.mockImplementation((_wId, items) =>
        Promise.resolve({
          id: 'c1',
          worldId: 'world1',
          items,
          updatedAt: new Date(),
        }),
      );

      const itemsWithoutId = [
        { code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
      ];
      const result = await service.updateCurrencies(
        'world1',
        itemsWithoutId as never,
        { id: 'pj1', role: UserRole.Hrac, username: 'pj' },
      );
      expect(result.items[0].id).toBeDefined();
      expect(result.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('DI-03 — should reject duplicate currency codes in the set', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.findByWorldId.mockResolvedValue(null);
      const dupItems = [
        { id: 'a', code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
        { id: 'b', code: 'ZL', name: 'Zlaťák 2', symbol: 'Zl2', rate: 2.0 },
      ];
      await expect(
        service.updateCurrencies('world1', dupItems, {
          id: 'pj1',
          role: 3,
          username: 'pj',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateCurrencies — full-set sémantika + optimistic concurrency (D-NEW-INV-DATA-SYNC)', () => {
    const NOW = new Date('2026-07-12T10:00:00.000Z');
    const existingDoc = {
      id: 'c1',
      worldId: 'world1',
      items: mockItems,
      updatedAt: NOW,
    };
    const pj = { id: 'pj1', role: UserRole.Hrac, username: 'pj' };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PJ,
      });
      mockRepo.findByWorldId.mockResolvedValue(existingDoc);
    });

    it('smazání měny = poslání sady bez ní (full-replace, PJ) — nezmíněná měna se odstraní', async () => {
      const withoutMd = mockItems.filter((i) => i.code !== 'MD');
      mockRepo.upsert.mockResolvedValue({ ...existingDoc, items: withoutMd });

      const result = await service.updateCurrencies('world1', withoutMd, pj);
      expect(result.items.map((i) => i.code)).toEqual(['ZL', 'ST']);
      // Perzistence zůstává full-replace (delta merge by rozbil FE mazání).
      expect(mockRepo.upsert).toHaveBeenCalledWith('world1', withoutMd);
    });

    it('expectedUpdatedAt match → atomický replaceIfUnchanged, žádný plain upsert', async () => {
      const edited = mockItems.map((i) =>
        i.code === 'ST' ? { ...i, rate: 0.2 } : i,
      );
      mockRepo.replaceIfUnchanged.mockResolvedValue({
        ...existingDoc,
        items: edited,
        updatedAt: new Date(),
      });

      const result = await service.updateCurrencies(
        'world1',
        edited,
        pj,
        NOW.toISOString(),
      );
      expect(result.items.find((i) => i.code === 'ST')?.rate).toBe(0.2);
      expect(mockRepo.replaceIfUnchanged).toHaveBeenCalledWith(
        'world1',
        edited,
        NOW,
      );
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('expectedUpdatedAt stale (souběžná změna) → 409 ConflictException, žádný přepis', async () => {
      mockRepo.replaceIfUnchanged.mockResolvedValue(null); // filtr netrefil verzi

      await expect(
        service.updateCurrencies(
          'world1',
          mockItems,
          pj,
          new Date('2026-07-12T09:00:00.000Z').toISOString(),
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('expectedUpdatedAt bez existujícího dokumentu → upsert (první sada, není co ztratit)', async () => {
      mockRepo.findByWorldId.mockResolvedValue(null);
      mockRepo.upsert.mockResolvedValue(existingDoc);

      await service.updateCurrencies(
        'world1',
        mockItems,
        pj,
        NOW.toISOString(),
      );
      expect(mockRepo.upsert).toHaveBeenCalledWith('world1', mockItems);
      expect(mockRepo.replaceIfUnchanged).not.toHaveBeenCalled();
    });

    it('bez expectedUpdatedAt → legacy upsert bez concurrency checku', async () => {
      mockRepo.upsert.mockResolvedValue(existingDoc);

      await service.updateCurrencies('world1', mockItems, pj);
      expect(mockRepo.upsert).toHaveBeenCalled();
      expect(mockRepo.replaceIfUnchanged).not.toHaveBeenCalled();
    });
  });

  describe('updateCurrencies — PomocnyPJ role gate (spec 11.4 §4.8b)', () => {
    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.PomocnyPJ,
      });
      mockRepo.findByWorldId.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: mockItems,
        updatedAt: new Date(),
      });
      mockRepo.upsert.mockImplementation((_w, items) =>
        Promise.resolve({
          id: 'c1',
          worldId: 'world1',
          items,
          updatedAt: new Date(),
        }),
      );
    });

    it('should allow PomocnyPJ to edit existing currency rate (metadata-only)', async () => {
      const edited = mockItems.map((i) =>
        i.code === 'ST' ? { ...i, rate: 0.2 } : i,
      );
      const result = await service.updateCurrencies('world1', edited, {
        id: 'pomocny1',
        role: 5,
        username: 'pomocny',
      });
      expect(result.items).toHaveLength(3);
      const st = result.items.find((i) => i.code === 'ST');
      expect(st?.rate).toBe(0.2);
    });

    it('should allow PomocnyPJ to perform "set as base" (mass rate edit, same code set)', async () => {
      const newItems = mockItems.map((i) => ({
        ...i,
        rate: i.code === 'ST' ? 1.0 : i.code === 'ZL' ? 10 : 0.1,
      }));
      const result = await service.updateCurrencies('world1', newItems, {
        id: 'pomocny1',
        role: 5,
        username: 'pomocny',
      });
      expect(result.items.find((i) => i.code === 'ST')?.rate).toBe(1.0);
    });

    it('should forbid PomocnyPJ to add a new currency (code set changes)', async () => {
      const withNew = [
        ...mockItems,
        { id: 'newid', code: 'DK', name: 'Drahokam', symbol: 'Dk', rate: 100 },
      ];
      await expect(
        service.updateCurrencies('world1', withNew, {
          id: 'pomocny1',
          role: 5,
          username: 'pomocny',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid PomocnyPJ to delete a currency (code set changes)', async () => {
      const withoutOne = mockItems.filter((i) => i.code !== 'MD');
      await expect(
        service.updateCurrencies('world1', withoutOne, {
          id: 'pomocny1',
          role: 5,
          username: 'pomocny',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should forbid Hrac to update currencies even for metadata-only edit', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      const edited = mockItems.map((i) =>
        i.code === 'ST' ? { ...i, rate: 0.2 } : i,
      );
      await expect(
        service.updateCurrencies('world1', edited, {
          id: 'hrac1',
          role: 5,
          username: 'hrac',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('convert', () => {
    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({
        role: WorldRole.Hrac,
      });
      mockRepo.findByWorldId.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: mockItems,
        updatedAt: new Date(),
      });
    });

    it('should convert ZL to ST correctly', async () => {
      const result = await service.convert(
        'world1',
        { amount: 5, from: 'ZL', to: 'ST' },
        'user1',
      );
      expect(result.result).toBe(50);
    });

    it('should convert ST to MD correctly', async () => {
      const result = await service.convert(
        'world1',
        { amount: 1, from: 'ST', to: 'MD' },
        'user1',
      );
      expect(result.result).toBe(10);
    });

    it('should throw NotFoundException when from code not found (FIX-51)', async () => {
      await expect(
        service.convert(
          'world1',
          { amount: 1, from: 'UNKNOWN', to: 'ST' },
          'user1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when from === to', async () => {
      await expect(
        service.convert('world1', { amount: 1, from: 'ZL', to: 'ZL' }, 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should round result to 4 decimal places', async () => {
      const result = await service.convert(
        'world1',
        { amount: 1, from: 'MD', to: 'ST' },
        'user1',
      );
      expect(result.result).toBe(0.1);
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.convert('world1', { amount: 1, from: 'ZL', to: 'ST' }, 'user1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('D-SEC-GAP float: driftový násobek → přesný výsledek (0.1 ST → 0.01 ZL bez šumu)', async () => {
      // 0.1 * 0.1 = 0.010000000000000002 bez zaokrouhlení.
      const result = await service.convert(
        'world1',
        { amount: 0.1, from: 'ST', to: 'ZL' },
        'user1',
      );
      expect(result.result).toBe(0.01);
    });

    it('D-SEC-GAP float: NaN amount → 400 AMOUNT_INVALID (CH-122)', async () => {
      await expect(
        service.convert(
          'world1',
          { amount: NaN, from: 'ZL', to: 'ST' },
          'user1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('D-SEC-GAP float: kurz ≤ 0 → 400 CURRENCY_RATE_MISSING (žádné Infinity)', async () => {
      mockRepo.findByWorldId.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: [
          { id: '1', code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1 },
          { id: '2', code: 'XX', name: 'Rozbitá', symbol: 'X', rate: 0 },
        ],
        updatedAt: new Date(),
      });
      await expect(
        service.convert('world1', { amount: 1, from: 'ZL', to: 'XX' }, 'user1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('seedForWorld', () => {
    it('should seed fantasy currencies', async () => {
      mockRepo.upsert.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: [],
        updatedAt: new Date(),
      });
      await service.seedForWorld('world1', 'fantasy');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([
          expect.objectContaining({ code: 'ZL', rate: 1.0 }),
          expect.objectContaining({ code: 'ST', rate: 0.1 }),
          expect.objectContaining({ code: 'MD', rate: 0.01 }),
        ]),
      );
    });

    it('should seed cyberpunk currencies', async () => {
      mockRepo.upsert.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: [],
        updatedAt: new Date(),
      });
      await service.seedForWorld('world1', 'cyberpunk');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'CR' })]),
      );
    });

    it('should seed default currency for unknown genre', async () => {
      mockRepo.upsert.mockResolvedValue({
        id: 'c1',
        worldId: 'world1',
        items: [],
        updatedAt: new Date(),
      });
      await service.seedForWorld('world1', undefined);
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'MNC' })]),
      );
    });
  });
});
