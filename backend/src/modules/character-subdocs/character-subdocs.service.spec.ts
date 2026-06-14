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
    updateWithCustomDataPatch: jest.fn(),
    deleteByCharacterId: jest.fn(),
    clearOverridesByWorldId: jest.fn(),
  };
  const mockCalendarRepo = {
    findByCharacterId: jest.fn(),
    findByWorldId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteByCharacterId: jest.fn(),
  };
  const mockFinanceRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteByCharacterId: jest.fn(),
  };
  const mockInventoryRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteByCharacterId: jest.fn(),
  };
  const mockNotesRepo = {
    findByCharacterId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteByCharacterId: jest.fn(),
  };
  const mockDiaryVersionsRepo = {
    findMetaByWorldId: jest.fn(),
    findByWorldIdAndVersion: jest.fn(),
    findLastVersion: jest.fn(),
    findActive: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    archive: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDiaryVersionsRepo.findActive.mockResolvedValue(null);
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
        {
          provide: 'IDiarySchemaVersionsRepository',
          useValue: mockDiaryVersionsRepo,
        },
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
    it('8.1-FIR — NPC dostane všech 5 subdoců (Matrix to nedělil)', async () => {
      mockDiaryRepo.create.mockResolvedValue(mockDiary);
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);
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
      expect(mockFinanceRepo.create).toHaveBeenCalledWith('char1');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('char1');
    });
  });

  describe('onCharacterCreated — lokace', () => {
    it('8.1-FIR — lokace dostane calendar + finance + inventory (bez diary/notes)', async () => {
      mockCalendarRepo.create.mockResolvedValue(mockCalendar);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);

      await service.onCharacterCreated({
        characterId: 'loc1',
        worldId: 'w1',
        userId: undefined,
        isNpc: true,
        kind: 'location',
      });

      expect(mockCalendarRepo.create).toHaveBeenCalledWith('loc1', 'w1');
      expect(mockFinanceRepo.create).toHaveBeenCalledWith('loc1');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('loc1');
      expect(mockDiaryRepo.create).not.toHaveBeenCalled();
      expect(mockNotesRepo.create).not.toHaveBeenCalled();
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

  describe('onCharacterDeleted', () => {
    it('smaže všech 5 subdokumentů podle characterId', async () => {
      await service.onCharacterDeleted({
        characterId: 'char1',
        worldId: 'w1',
        slug: 'medak',
      });

      expect(mockDiaryRepo.deleteByCharacterId).toHaveBeenCalledWith('char1');
      expect(mockCalendarRepo.deleteByCharacterId).toHaveBeenCalledWith(
        'char1',
      );
      expect(mockFinanceRepo.deleteByCharacterId).toHaveBeenCalledWith('char1');
      expect(mockInventoryRepo.deleteByCharacterId).toHaveBeenCalledWith(
        'char1',
      );
      expect(mockNotesRepo.deleteByCharacterId).toHaveBeenCalledWith('char1');
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

  // ── 8.1-FIR — Finance/Inventory lazy-create pro všechny typy ──────
  describe('getFinance — PC lazy-create + NPC/Lokace gate (EC-03)', () => {
    it('vrátí existující finance beze změny (PC)', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(mockFinance);
      const result = await service.getFinance('char1', false, 'persona');
      expect(result).toEqual(mockFinance);
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
    });

    it('lazy-create pro PC bez subdoku (legacy / emit failure)', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      mockFinanceRepo.create.mockResolvedValue(mockFinance);
      const result = await service.getFinance('char1', false, 'persona');
      expect(mockFinanceRepo.create).toHaveBeenCalledWith('char1');
      expect(result).toEqual(mockFinance);
    });

    it('EC-03: NPC finance NEMÁ → FINANCE_NOT_APPLICABLE, žádný lazy-create', async () => {
      mockFinanceRepo.findByCharacterId.mockResolvedValue(null);
      await expect(
        service.getFinance('char1', true, 'persona'),
      ).rejects.toThrow('finance nemá');
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
    });

    it('EC-03: Lokace finance NEMÁ → FINANCE_NOT_APPLICABLE', async () => {
      await expect(
        service.getFinance('char1', false, 'location'),
      ).rejects.toThrow('finance nemá');
      expect(mockFinanceRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getInventory — PC lazy-create + NPC/Lokace gate (EC-03)', () => {
    it('vrátí existující inventory beze změny (PC)', async () => {
      mockInventoryRepo.findByCharacterId.mockResolvedValue(mockInventory);
      const result = await service.getInventory('char1', false, 'persona');
      expect(result).toEqual(mockInventory);
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });

    it('lazy-create pro PC bez subdoku', async () => {
      mockInventoryRepo.findByCharacterId.mockResolvedValue(null);
      mockInventoryRepo.create.mockResolvedValue(mockInventory);
      const result = await service.getInventory('char1', false, 'persona');
      expect(mockInventoryRepo.create).toHaveBeenCalledWith('char1');
      expect(result).toEqual(mockInventory);
    });

    it('EC-03: NPC výbavu NEMÁ → INVENTORY_NOT_APPLICABLE, žádný lazy-create', async () => {
      mockInventoryRepo.findByCharacterId.mockResolvedValue(null);
      await expect(
        service.getInventory('char1', true, 'persona'),
      ).rejects.toThrow('výbavu nemá');
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });

    it('EC-03: Lokace výbavu NEMÁ → INVENTORY_NOT_APPLICABLE', async () => {
      await expect(
        service.getInventory('char1', false, 'location'),
      ).rejects.toThrow('výbavu nemá');
      expect(mockInventoryRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── 8.5 ───────────────────────────────────────────────────────────────

  // D-040-followup (2026-05-24) — read-side coerce ODSTRANĚN; všechen
  // customData je pass-through. Testy ověřují že staré keys (např. z jiného
  // system presetu po switchi) NEzmizí — jinak by FE neviděl historická
  // data a první edit by je natrvalo přepsal.
  describe('D-040-followup — getDiary pass-through (žádné filtrování)', () => {
    it('vrátí i klíče mimo personalDiarySchema (pro write-side merge)', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        personalDiarySchema: [
          { id: 'hp', type: 'stat', label: 'HP', order: 0 },
        ],
        customData: { hp: 12, unknownLegacyKey: 999 },
      });

      const result = await service.getDiary('char1');

      // Pass-through: FE dostane všechna data; sheet renderuje jen své prefix keys.
      expect(result.customData).toEqual({ hp: 12, unknownLegacyKey: 999 });
    });

    it('vrátí i klíče z jiného systemu po switchi', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        customData: { matrix_redpill: true, drd16_strength: 12 },
      });
      mockDiaryVersionsRepo.findActive.mockResolvedValue({
        id: 'v1',
        worldId: 'w1',
        version: 2,
        system: 'matrix',
        schema: [
          { key: 'matrix_redpill', label: 'Red pill', type: 'stat', order: 0 },
        ],
        archivedAt: null,
      });

      const result = await service.getDiary('char1');

      // Switch zpět na matrix: matrix_redpill viditelný v Matrix sheet; drd16_*
      // stále v DB, FE drd16_* ignoruje (jiný prefix), ale write-side je nepřepíše.
      expect(result.customData).toEqual({
        matrix_redpill: true,
        drd16_strength: 12,
      });
    });
  });

  // D-040-followup (2026-05-24) — delta merge přes customDataPatch.
  describe('D-040-followup — updateDiary customDataPatch (delta merge)', () => {
    it('per-key $set zachová ostatní customData keys', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        customData: { matrix_redpill: true, matrix_neo: 'one' },
      });
      mockDiaryRepo.updateWithCustomDataPatch.mockResolvedValue({
        ...mockDiary,
        customData: {
          matrix_redpill: true,
          matrix_neo: 'one',
          drd16_name: 'Frodo',
        },
      });

      await service.updateDiary('char1', {
        customDataPatch: { drd16_name: 'Frodo' },
      });

      expect(mockDiaryRepo.updateWithCustomDataPatch).toHaveBeenCalledWith(
        'char1',
        {},
        { drd16_name: 'Frodo' },
      );
      // Legacy `update` se NEvolá v delta módu.
      expect(mockDiaryRepo.update).not.toHaveBeenCalled();
    });

    it('null v patchi → $unset toho key (smazat jen tento key)', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        customData: { drd16_name: 'Frodo' },
      });
      mockDiaryRepo.updateWithCustomDataPatch.mockResolvedValue({
        ...mockDiary,
        customData: {},
      });

      await service.updateDiary('char1', {
        customDataPatch: { drd16_name: null },
      });

      expect(mockDiaryRepo.updateWithCustomDataPatch).toHaveBeenCalledWith(
        'char1',
        {},
        { drd16_name: null },
      );
    });

    it('legacy customData full-replace stále funguje (BC, log warning)', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        customData: { existing: 1 },
      });
      mockDiaryRepo.update.mockResolvedValue({
        ...mockDiary,
        customData: { only_new: 2 },
      });

      const result = await service.updateDiary('char1', {
        customData: { only_new: 2 },
      });

      expect(mockDiaryRepo.update).toHaveBeenCalled();
      expect(result.customData).toEqual({ only_new: 2 });
    });
  });

  // ── 8.7n self-healing lazy-create ─────────────────────────────────────

  describe('8.7n — getDiary lazy-create', () => {
    it('postava bez diary subdoc + worldId předán → vytvoří se a vrátí', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue(null);
      mockDiaryRepo.create.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        customData: {},
      });
      mockDiaryVersionsRepo.findActive.mockResolvedValue(null);

      const result = await service.getDiary('char1', 'w1');

      expect(mockDiaryRepo.create).toHaveBeenCalledWith('char1', 'w1');
      expect(result.worldId).toBe('w1');
    });

    it('postava bez diary subdoc + worldId chybí → throw 404 (BC)', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue(null);

      await expect(service.getDiary('char1')).rejects.toThrow(
        /Deník nenalezen/,
      );
      expect(mockDiaryRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('8.7n — getCalendar lazy-create', () => {
    it('postava bez calendar + worldId předán → vytvoří se a vrátí', async () => {
      mockCalendarRepo.findByCharacterId.mockResolvedValue(null);
      mockCalendarRepo.create.mockResolvedValue({
        id: 'cal-new',
        characterId: 'char1',
        worldId: 'w1',
        color: '#888',
        displaySettings: {},
        events: [],
      });

      const result = await service.getCalendar('char1', 'w1');

      expect(mockCalendarRepo.create).toHaveBeenCalledWith('char1', 'w1');
      expect(result.worldId).toBe('w1');
    });

    it('postava bez calendar + worldId chybí → throw 404 (BC)', async () => {
      mockCalendarRepo.findByCharacterId.mockResolvedValue(null);

      await expect(service.getCalendar('char1')).rejects.toThrow(
        /Kalendář nenalezen/,
      );
      expect(mockCalendarRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('8.5-BE-4 — updateDiary coerce + personalDiarySchema reset', () => {
    it('zachová jen klíče v rámci nového personalDiarySchema', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        customData: {},
      });
      mockDiaryRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...mockDiary, ...data }),
      );

      const result = await service.updateDiary('char1', {
        personalDiarySchema: [
          { id: 'sila', type: 'stat', label: 'Síla', order: 0 },
        ],
        customData: { sila: 10, ghostKey: 'X' },
      });

      expect(result.customData).toEqual({ sila: 10 });
    });

    it('personalDiarySchema=null + customData → coerce přes aktivní svět-level', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        worldId: 'w1',
        personalDiarySchema: [
          { id: 'hp', type: 'stat', label: 'HP', order: 0 },
        ],
        customData: {},
      });
      mockDiaryVersionsRepo.findActive.mockResolvedValue({
        id: 'v1',
        worldId: 'w1',
        version: 2,
        system: 'dnd5e',
        schema: [{ key: 'mana', label: 'Mana', type: 'number', order: 0 }],
        archivedAt: null,
      });
      mockDiaryRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...mockDiary, ...data }),
      );

      const result = await service.updateDiary('char1', {
        // Reset overrideu — service to akceptuje (DTO má `null` whitelisted).
        personalDiarySchema: null as unknown as undefined,
        customData: { hp: 50, mana: 5 },
      });

      // `hp` (z původního override) zahozeno; `mana` (svět-level) ponecháno.
      expect(result.customData).toEqual({ mana: 5 });
    });
  });

  describe('8.5 D-DIARY-1 — remapCustomDataKeys', () => {
    it('přejmenuje keys podle mapping, hodnoty zachová', async () => {
      mockDiaryRepo.findByCharacterId.mockResolvedValue({
        ...mockDiary,
        customData: { oldKey: 42, keepKey: 'X' },
      });
      mockDiaryRepo.update.mockImplementation((_id, data) =>
        Promise.resolve({ ...mockDiary, ...data }),
      );

      const result = await service.remapCustomDataKeys('char1', {
        oldKey: 'newKey',
      });

      expect(result.customData).toEqual({ newKey: 42, keepKey: 'X' });
    });
  });

  describe('8.5 D-DIARY-2 — resetAllPersonalSchemas', () => {
    it('deleguje na repo.clearOverridesByWorldId a vrací count', async () => {
      mockDiaryRepo.clearOverridesByWorldId.mockResolvedValue(7);

      const result = await service.resetAllPersonalSchemas('w1');

      expect(result).toBe(7);
    });
  });

  describe('8.5 D-DIARY-5 — remapAllKeysByWorld', () => {
    beforeEach(() => {
      (
        mockDiaryRepo as unknown as { remapKeysByWorldId: jest.Mock }
      ).remapKeysByWorldId = jest.fn();
    });

    it('prázdný mapping → 0, repo se nevolá', async () => {
      const result = await service.remapAllKeysByWorld('w1', {});
      expect(result).toBe(0);
      expect(
        (mockDiaryRepo as unknown as { remapKeysByWorldId: jest.Mock })
          .remapKeysByWorldId,
      ).not.toHaveBeenCalled();
    });

    it('deleguje na repo.remapKeysByWorldId a vrací count', async () => {
      (
        mockDiaryRepo as unknown as { remapKeysByWorldId: jest.Mock }
      ).remapKeysByWorldId.mockResolvedValue(5);

      const result = await service.remapAllKeysByWorld('w1', {
        sila: 'strength',
      });

      expect(result).toBe(5);
      expect(
        (mockDiaryRepo as unknown as { remapKeysByWorldId: jest.Mock })
          .remapKeysByWorldId,
      ).toHaveBeenCalledWith('w1', { sila: 'strength' });
    });
  });
});
