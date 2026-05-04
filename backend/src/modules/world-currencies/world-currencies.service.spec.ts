import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorldCurrenciesService } from './world-currencies.service';

const mockRepo = {
  findByWorldId: jest.fn(),
  upsert: jest.fn(),
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
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findByWorldId.mockResolvedValue({ id: 'c1', worldId: 'world1', items: mockItems, updatedAt: new Date() });

      const result = await service.getCurrencies('world1', 'user1');
      expect(result.items).toHaveLength(3);
      expect(result.worldId).toBe('world1');
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);

      await expect(service.getCurrencies('world1', 'user1')).rejects.toThrow(ForbiddenException);
    });

    it('should return empty items when no document exists', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findByWorldId.mockResolvedValue(null);

      const result = await service.getCurrencies('world1', 'user1');
      expect(result.items).toEqual([]);
    });
  });

  describe('updateCurrencies', () => {
    it('should update currencies for PJ', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 4 }); // >= WorldRole.PJ(3)
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: mockItems, updatedAt: new Date() });

      const result = await service.updateCurrencies('world1', mockItems, { id: 'pj1', role: 3, username: 'pj' });
      expect(result.items).toHaveLength(3);
      expect(mockRepo.upsert).toHaveBeenCalledWith('world1', expect.arrayContaining([expect.objectContaining({ code: 'ZL' })]));
    });

    it('should throw ForbiddenException for Hrac', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 }); // < WorldRole.PJ(3)

      await expect(
        service.updateCurrencies('world1', mockItems, { id: 'user1', role: 3, username: 'u' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should assign UUID to items without id', async () => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 4 });
      mockRepo.upsert.mockImplementation((_wId, items) =>
        Promise.resolve({ id: 'c1', worldId: 'world1', items, updatedAt: new Date() }),
      );

      const itemsWithoutId = [{ code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 }];
      const result = await service.updateCurrencies('world1', itemsWithoutId as never, { id: 'pj1', role: 4, username: 'pj' });
      expect(result.items[0].id).toBeDefined();
      expect(result.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('convert', () => {
    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(mockWorld);
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 2 });
      mockRepo.findByWorldId.mockResolvedValue({ id: 'c1', worldId: 'world1', items: mockItems, updatedAt: new Date() });
    });

    it('should convert ZL to ST correctly', async () => {
      const result = await service.convert('world1', { amount: 5, from: 'ZL', to: 'ST' }, 'user1');
      expect(result.result).toBe(50);
    });

    it('should convert ST to MD correctly', async () => {
      const result = await service.convert('world1', { amount: 1, from: 'ST', to: 'MD' }, 'user1');
      expect(result.result).toBe(10);
    });

    it('should throw BadRequestException when from code not found', async () => {
      await expect(service.convert('world1', { amount: 1, from: 'UNKNOWN', to: 'ST' }, 'user1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when from === to', async () => {
      await expect(service.convert('world1', { amount: 1, from: 'ZL', to: 'ZL' }, 'user1')).rejects.toThrow(BadRequestException);
    });

    it('should round result to 4 decimal places', async () => {
      const result = await service.convert('world1', { amount: 1, from: 'MD', to: 'ST' }, 'user1');
      expect(result.result).toBe(0.1);
    });

    it('should throw ForbiddenException for non-member', async () => {
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(service.convert('world1', { amount: 1, from: 'ZL', to: 'ST' }, 'user1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('seedForWorld', () => {
    it('should seed fantasy currencies', async () => {
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: [], updatedAt: new Date() });
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
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: [], updatedAt: new Date() });
      await service.seedForWorld('world1', 'cyberpunk');
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'CR' })]),
      );
    });

    it('should seed default currency for unknown genre', async () => {
      mockRepo.upsert.mockResolvedValue({ id: 'c1', worldId: 'world1', items: [], updatedAt: new Date() });
      await service.seedForWorld('world1', undefined);
      expect(mockRepo.upsert).toHaveBeenCalledWith(
        'world1',
        expect.arrayContaining([expect.objectContaining({ code: 'MNC' })]),
      );
    });
  });
});
