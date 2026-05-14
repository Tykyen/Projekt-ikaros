import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CharacterSubdocsService } from './character-subdocs.service';

const mockDiary = {
  id: 'd1',
  characterId: 'char1',
  worldId: 'w1',
  sections: [],
  customData: {},
};
const mockCalendar = {
  id: 'cal1',
  characterId: 'char1',
  worldId: 'w1',
  color: '#3B82F6',
  displaySettings: {},
  events: [],
};
const mockFinance = {
  id: 'f1',
  characterId: 'char1',
  isHidden: false,
  accountType: 'Osobní',
  accessLocation: '',
  currency: 'Libra',
  balance: 100,
  entries: [{ id: 'e1', label: 'Plat', amount: 50 }],
  transactions: [],
};
const mockInventory = {
  id: 'inv1',
  characterId: 'char1',
  isHidden: false,
  sections: [],
};
const mockNotes = { id: 'n1', characterId: 'char1', content: '' };

describe('CharacterSubdocsService', () => {
  let service: CharacterSubdocsService;
  const mockDiaryRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const mockCalendarRepo = {
    findByCharacterId: jest.fn(),
    findByWorldId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const mockFinanceRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const mockInventoryRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const mockNotesRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CharacterSubdocsService,
        { provide: 'ICharacterDiaryRepository', useValue: mockDiaryRepo },
        { provide: 'ICharacterCalendarRepository', useValue: mockCalendarRepo },
        { provide: 'ICharacterFinanceRepository', useValue: mockFinanceRepo },
        {
          provide: 'ICharacterInventoryRepository',
          useValue: mockInventoryRepo,
        },
        { provide: 'ICharacterNotesRepository', useValue: mockNotesRepo },
      ],
    }).compile();
    service = module.get(CharacterSubdocsService);
  });

  describe('onCharacterCreated — CP', () => {
    it('vytvoří diary, calendar, finance, inventory, notes pro CP', async () => {
      mockDiaryRepo.create.mockResolvedValue(mockDiary);
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);
      mockNotesRepo.create.mockResolvedValue(mockNotes);

      await service.onCharacterCreated({
        characterId: 'char1',
        worldId: 'w1',
        userId: 'user1',
        isNpc: false,
      });

      expect(mockDiaryRepo.create).toHaveBeenCalledWith('char1', 'w1');
      expect(mockCalendarRepo.create).toHaveBeenCalledWith('char1', 'w1');
      expect(mockFinanceRepo.create).toHaveBeenCalledWith('char1');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('char1');
      expect(mockNotesRepo.create).toHaveBeenCalledWith('char1');
    });
  });

  describe('onCharacterCreated — NPC', () => {
    it('vytvoří diary, calendar, notes pro NPC — bez finance a inventory', async () => {
      mockDiaryRepo.create.mockResolvedValue(mockDiary);
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);
      mockNotesRepo.create.mockResolvedValue(mockNotes);

      await service.onCharacterCreated({
        characterId: 'char1',
        worldId: 'w1',
        userId: undefined,
        isNpc: true,
      });

      expect(mockDiaryRepo.create).toHaveBeenCalled();
      expect(mockCalendarRepo.create).toHaveBeenCalled();
      expect(mockNotesRepo.create).toHaveBeenCalled();
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('onCharacterCreated — lokace', () => {
    it('vytvoří jen calendar pro lokaci — bez diary, notes, finance, inventory', async () => {
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);

      await service.onCharacterCreated({
        characterId: 'loc1',
        worldId: 'w1',
        userId: undefined,
        isNpc: true,
        isLocation: true,
      });

      expect(mockCalendarRepo.create).toHaveBeenCalledWith('loc1', 'w1');
      expect(mockDiaryRepo.create).not.toHaveBeenCalled();
      expect(mockNotesRepo.create).not.toHaveBeenCalled();
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('onCharacterConverted — CP → NPC', () => {
    it('skryje finance a inventory při konverzi na NPC', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      mockInventoryRepo.findByCharacterId.mockResolvedValue(mockInventory);

      await service.onCharacterConverted({
        characterId: 'char1',
        worldId: 'w1',
        toNpc: true,
        userId: undefined,
      });

      expect(mockFinanceRepo.update).toHaveBeenCalledWith('char1', {
        isHidden: true,
      });
      expect(mockInventoryRepo.update).toHaveBeenCalledWith('char1', {
        isHidden: true,
      });
    });
  });

  describe('onCharacterConverted — NPC → CP', () => {
    it('odkryje finance pokud existují', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      mockInventoryRepo.findByCharacterId.mockResolvedValue(mockInventory);

      await service.onCharacterConverted({
        characterId: 'char1',
        worldId: 'w1',
        toNpc: false,
        userId: 'user1',
      });

      expect(mockFinanceRepo.update).toHaveBeenCalledWith('char1', {
        isHidden: false,
      });
      expect(mockInventoryRepo.update).toHaveBeenCalledWith('char1', {
        isHidden: false,
      });
    });

    it('vytvoří finance pokud neexistují při NPC → CP konverzi', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      mockInventoryRepo.findByCharacterId.mockResolvedValue(null);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);

      await service.onCharacterConverted({
        characterId: 'char1',
        worldId: 'w1',
        toNpc: false,
        userId: 'user1',
      });

      expect(mockFinanceRepo.create).toHaveBeenCalledWith('char1');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('char1');
    });
  });

  describe('addMonthly', () => {
    it('přičte součet entries k balance a zapíše transakci', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      mockFinanceRepo.update.mockResolvedValue({
        ...mockFinance,
        balance: 150,
      });

      const result = await service.addMonthly('char1');

      expect(mockFinanceRepo.update).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({
          balance: 150,
          lastSyncDate: expect.any(Date),
          transactions: expect.arrayContaining([
            expect.objectContaining({ delta: 50 }),
          ]),
        }),
      );
      expect(result.balance).toBe(150);
    });

    it('vyhodí NotFoundException pokud finance neexistují', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      await expect(service.addMonthly('char1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('undoLastTransaction', () => {
    it('odebere poslední transakci a odečte delta od balance', async () => {
      const financeWithTx = {
        ...mockFinance,
        balance: 150,
        transactions: [
          {
            id: 'tx1',
            date: new Date(),
            delta: 50,
            description: 'měsíční zúčtování',
          },
        ],
      };
      mockFinanceRepo.findByCharacterId.mockResolvedValue(financeWithTx);
      mockFinanceRepo.update.mockResolvedValue({
        ...financeWithTx,
        balance: 100,
        transactions: [],
      });

      const result = await service.undoLastTransaction('char1');

      expect(mockFinanceRepo.update).toHaveBeenCalledWith(
        'char1',
        expect.objectContaining({
          balance: 100,
          transactions: [],
        }),
      );
      expect(result.balance).toBe(100);
    });

    it('vyhodí NotFoundException pokud finance neexistují', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      await expect(service.undoLastTransaction('char1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getCalendarsByWorldId', () => {
    it('vrátí pole kalendářů pro daný worldId', async () => {
      mockCalendarRepo.findByWorldId.mockResolvedValue([mockCalendar]);

      const result = await service.getCalendarsByWorldId('w1');

      expect(mockCalendarRepo.findByWorldId).toHaveBeenCalledWith('w1');
      expect(result).toEqual([mockCalendar]);
    });
  });
});
