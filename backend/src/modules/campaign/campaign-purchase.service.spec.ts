import { Test } from '@nestjs/testing';
import {
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { CampaignPurchaseService } from './services/campaign-purchase.service';
import { CharacterAccountsService } from '../character-subdocs/character-accounts.service';
import { CharacterSubdocsService } from '../character-subdocs/character-subdocs.service';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
import { CharactersService } from '../characters/characters.service';

describe('CampaignPurchaseService', () => {
  let service: CampaignPurchaseService;

  const mockShopRepo = { findById: jest.fn() };
  const mockShopGroupRepo = { findById: jest.fn() };
  const mockPurchaseRepo = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    markRefundedIfActive: jest.fn(),
  };
  const mockAccounts = {
    assertCanAdjust: jest.fn(),
    adjust: jest.fn(),
    debitIfSufficient: jest.fn(),
    getAccount: jest.fn(),
  };
  const mockSubdocs = {
    getInventory: jest.fn(),
    updateInventory: jest.fn(),
    // RC-E4 — purchase path nově atomicky appenduje přes appendInventoryItem.
    appendInventoryItem: jest.fn(),
  };
  const mockCurrencies = { convert: jest.fn() };
  const mockCharacters = {
    findById: jest.fn(),
    isWorldStaff: jest.fn(),
    findByUser: jest.fn(),
  };
  // RC-E5 — bez reálného replica setu `withTransaction` v unit testu hodí
  // „Transaction numbers..." → service spadne do sekvenční fallback cesty
  // (plná kompenzace). Tím unit spec ověřuje právě fallback (single-instance
  // prod) chování; transakční cestu pokrývá race e2e na MongoMemoryReplSet.
  const mockSession = {
    withTransaction: jest.fn(() =>
      Promise.reject(
        new Error(
          'Transaction numbers are only allowed on a replica set member or mongos',
        ),
      ),
    ),
    endSession: jest.fn(() => Promise.resolve(undefined)),
  };
  const mockConnection = {
    startSession: jest.fn(() => Promise.resolve(mockSession)),
  };

  const character = {
    id: 'char1',
    worldId: 'w1',
    userId: 'u1',
    isNpc: false,
    kind: 'persona' as const,
  };
  const account = {
    id: 'acc1',
    worldId: 'w1',
    currency: 'ZL',
    balance: 200,
    ownerCharacterIds: ['char1'],
    transactions: [],
  };
  function makeItem(over: Record<string, unknown> = {}) {
    return {
      id: 'item1',
      worldId: 'w1',
      name: 'Meč',
      groupId: '',
      price: 100,
      currencyCode: 'ZL',
      discountPercent: 0,
      ...over,
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CampaignPurchaseService,
        { provide: 'ICampaignShopItemRepository', useValue: mockShopRepo },
        {
          provide: 'ICampaignShopGroupRepository',
          useValue: mockShopGroupRepo,
        },
        { provide: 'ICampaignPurchaseRepository', useValue: mockPurchaseRepo },
        { provide: CharacterAccountsService, useValue: mockAccounts },
        { provide: CharacterSubdocsService, useValue: mockSubdocs },
        { provide: WorldCurrenciesService, useValue: mockCurrencies },
        { provide: CharactersService, useValue: mockCharacters },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();
    service = moduleRef.get(CampaignPurchaseService);

    // default happy-path stubs
    mockCharacters.findById.mockResolvedValue(character);
    mockCharacters.isWorldStaff.mockResolvedValue(true);
    mockAccounts.assertCanAdjust.mockResolvedValue(account);
    // RC-E5 — cena 0 cesta čte aktuální balance přes getAccount (žádný odečet).
    mockAccounts.getAccount.mockResolvedValue(account);
    mockSubdocs.getInventory.mockResolvedValue({ sections: [] });
    mockSubdocs.updateInventory.mockResolvedValue({ sections: [] });
    mockSubdocs.appendInventoryItem.mockResolvedValue({
      sectionId: 'sec-auto',
      itemId: 'it-new',
    });
    mockPurchaseRepo.create.mockImplementation((d: Record<string, unknown>) =>
      Promise.resolve({ id: 'p1', ...d }),
    );
  });

  const dto = { characterId: 'char1', accountId: 'acc1' };

  describe('purchase', () => {
    it('happy path — odečte z účtu, přidá do vybavení, zapíše log', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 100,
        transactions: [{ id: 'tx1', delta: -100 }],
      });

      const res = await service.purchase('w1', 'item1', 'pj1', dto);

      expect(mockSubdocs.appendInventoryItem).toHaveBeenCalled();
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        100,
        expect.stringContaining('Nákup'),
        'pj1',
      );
      expect(mockPurchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: 100, status: 'active' }),
      );
      expect(res.newBalance).toBe(100);
    });

    it('aplikuje slevu položky (−20 % → 80)', async () => {
      mockShopRepo.findById.mockResolvedValue(
        makeItem({ discountPercent: 20 }),
      );
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 120,
        transactions: [{ id: 'tx1' }],
      });
      await service.purchase('w1', 'item1', 'pj1', dto);
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        80,
        expect.stringContaining('Nákup'),
        'pj1',
      );
    });

    it('zdědí slevu skupiny, když položka nemá vlastní', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ groupId: 'g1' }));
      mockShopGroupRepo.findById.mockResolvedValue({
        id: 'g1',
        name: 'Zbraně',
        discountPercent: 10,
      });
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 110,
        transactions: [{ id: 'tx1' }],
      });
      await service.purchase('w1', 'item1', 'pj1', dto);
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        90,
        expect.stringContaining('Nákup'),
        'pj1',
      );
    });

    it('převede cenu do měny účtu (různé měny)', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ currencyCode: 'GP' }));
      mockAccounts.assertCanAdjust.mockResolvedValue({
        ...account,
        balance: 1000,
      });
      mockCurrencies.convert.mockResolvedValue({ result: 800 });
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 200,
        transactions: [{ id: 'tx1' }],
      });
      await service.purchase('w1', 'item1', 'pj1', {
        characterId: 'char1',
        accountId: 'acc1',
      });
      expect(mockCurrencies.convert).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ amount: 100, from: 'GP', to: 'ZL' }),
        'pj1',
      );
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        800,
        expect.stringContaining('Nákup'),
        'pj1',
      );
    });

    it('počítá množství > 1', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockAccounts.assertCanAdjust.mockResolvedValue({
        ...account,
        balance: 1000,
      });
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 700,
        transactions: [{ id: 'tx1' }],
      });
      await service.purchase('w1', 'item1', 'pj1', { ...dto, quantity: 3 });
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        300,
        expect.stringContaining('Nákup'),
        'pj1',
      );
    });

    it('nedostatek prostředků → 409, žádný zápis', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: 500 }));
      await expect(service.purchase('w1', 'item1', 'pj1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockSubdocs.appendInventoryItem).not.toHaveBeenCalled();
      expect(mockAccounts.debitIfSufficient).not.toHaveBeenCalled();
    });

    it('hráč nakupující cizí postavě → 403', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockCharacters.isWorldStaff.mockResolvedValue(false);
      mockCharacters.findById.mockResolvedValue({
        ...character,
        userId: 'someone-else',
      });
      await expect(service.purchase('w1', 'item1', 'u1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('hráč bez self-adjust → 403 (deleguje na assertCanAdjust), nic nezapíše', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockCharacters.isWorldStaff.mockResolvedValue(false);
      mockAccounts.assertCanAdjust.mockRejectedValue(new ForbiddenException());
      await expect(service.purchase('w1', 'item1', 'u1', dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSubdocs.appendInventoryItem).not.toHaveBeenCalled();
    });

    it('položka zdarma (cena 0) → bez adjustu, log s paidAmount 0', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: 0 }));
      const res = await service.purchase('w1', 'item1', 'pj1', dto);
      expect(mockAccounts.debitIfSufficient).not.toHaveBeenCalled();
      expect(mockPurchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: 0, accountTransactionId: '' }),
      );
      expect(res.newBalance).toBe(200);
    });

    it('neexistující položka → 404', async () => {
      mockShopRepo.findById.mockResolvedValue(null);
      await expect(service.purchase('w1', 'item1', 'pj1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('refund', () => {
    const activePurchase = {
      id: 'p1',
      worldId: 'w1',
      characterId: 'char1',
      accountId: 'acc1',
      paidAmount: 100,
      inventorySectionId: 'sec1',
      inventoryItemId: 'it1',
      status: 'active' as const,
      itemSnapshot: { name: 'Meč' },
    };

    it('vrátí peníze + odebere položku z vybavení', async () => {
      mockPurchaseRepo.findById.mockResolvedValue(activePurchase);
      mockPurchaseRepo.markRefundedIfActive.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      mockAccounts.adjust.mockResolvedValue({ ...account, balance: 300 });
      mockSubdocs.getInventory.mockResolvedValue({
        sections: [{ id: 'sec1', items: [{ id: 'it1' }] }],
      });

      const res = await service.refund('w1', 'p1', 'pj1');

      expect(mockPurchaseRepo.markRefundedIfActive).toHaveBeenCalledWith('p1');
      expect(mockAccounts.adjust).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({ amount: 100 }),
        'pj1',
        undefined,
      );
      expect(mockSubdocs.updateInventory).toHaveBeenCalled();
      expect(res.newBalance).toBe(300);
    });

    it('už vrácený nákup → 409', async () => {
      mockPurchaseRepo.findById.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      await expect(service.refund('w1', 'p1', 'pj1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('tolerantní: smazaná položka ve vybavení nezabrání vrácení peněz', async () => {
      mockPurchaseRepo.findById.mockResolvedValue(activePurchase);
      mockPurchaseRepo.markRefundedIfActive.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      mockAccounts.adjust.mockResolvedValue({ ...account, balance: 300 });
      mockSubdocs.getInventory.mockRejectedValue(new Error('gone'));
      const res = await service.refund('w1', 'p1', 'pj1');
      expect(res.newBalance).toBe(300);
      expect(mockPurchaseRepo.markRefundedIfActive).toHaveBeenCalled();
    });
  });
});
