import { Test } from '@nestjs/testing';
import {
  BadRequestException,
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
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

/** Helper — RequestUser pro permission gating (isWorldStaff je mockované). */
const ru = (id: string, role: UserRole = UserRole.Hrac): RequestUser => ({
  id,
  role,
  username: id,
});

describe('CampaignPurchaseService', () => {
  let service: CampaignPurchaseService;

  const mockShopRepo = { findById: jest.fn() };
  const mockShopGroupRepo = { findById: jest.fn() };
  const mockPurchaseRepo = {
    findById: jest.fn(),
    // D-PURCHASE-IDEMPOTENCY — lookup nákupu dle (buyer, nonce) pro replay.
    findByNonce: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    markRefundedIfActive: jest.fn(),
    markActiveIfRefunded: jest.fn(),
  };
  const mockAccounts = {
    assertCanAdjust: jest.fn(),
    adjust: jest.fn(),
    creditInSession: jest.fn(),
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
    // Přijímá (a ignoruje) callback — konkrétní testy transakční cesty ho přes
    // `mockImplementationOnce` spustí; default = reject → sekvenční fallback.
    withTransaction: jest.fn(
      (_cb?: () => Promise<void>): Promise<void> =>
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
    mockPurchaseRepo.findByNonce.mockResolvedValue(null);
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

      const res = await service.purchase('w1', 'item1', ru('pj1'), dto);

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
      await service.purchase('w1', 'item1', ru('pj1'), dto);
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
      await service.purchase('w1', 'item1', ru('pj1'), dto);
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
      await service.purchase('w1', 'item1', ru('pj1'), {
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
      await service.purchase('w1', 'item1', ru('pj1'), { ...dto, quantity: 3 });
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        300,
        expect.stringContaining('Nákup'),
        'pj1',
      );
    });

    it('D-SEC-GAP float: cena 0.1 × 3 ks → debet přesně 0.3 (žádný drift)', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: 0.1 }));
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 199.7,
        transactions: [{ id: 'tx1' }],
      });
      await service.purchase('w1', 'item1', ru('pj1'), { ...dto, quantity: 3 });
      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        0.3,
        expect.stringContaining('Nákup'),
        'pj1',
      );
    });

    it('D-SEC-GAP float: hraniční nákup projde i s binárním šumem v balance (gteMoney)', async () => {
      // Historický drift: balance uložená jako 0.2999999999999999 ≈ 0.30.
      // Dřívější `balance < paidAmount` by nákup za 0.30 shodil na haléřích.
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: 0.3 }));
      mockAccounts.assertCanAdjust.mockResolvedValue({
        ...account,
        balance: 0.2999999999999999,
      });
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 0,
        transactions: [{ id: 'tx1' }],
      });

      const res = await service.purchase('w1', 'item1', ru('pj1'), dto);

      expect(mockAccounts.debitIfSufficient).toHaveBeenCalledWith(
        'acc1',
        0.3,
        expect.stringContaining('Nákup'),
        'pj1',
      );
      expect(res.newBalance).toBe(0);
    });

    it('D-SEC-GAP float: NaN cena položky → 400, žádný zápis (nesmí projít jako „zdarma")', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: NaN }));
      await expect(
        service.purchase('w1', 'item1', ru('pj1'), dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockSubdocs.appendInventoryItem).not.toHaveBeenCalled();
      expect(mockAccounts.debitIfSufficient).not.toHaveBeenCalled();
    });

    it('nedostatek prostředků → 409, žádný zápis', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: 500 }));
      await expect(
        service.purchase('w1', 'item1', ru('pj1'), dto),
      ).rejects.toThrow(ConflictException);
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
      await expect(
        service.purchase('w1', 'item1', ru('u1'), dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hráč bez self-adjust → 403 (deleguje na assertCanAdjust), nic nezapíše', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockCharacters.isWorldStaff.mockResolvedValue(false);
      mockAccounts.assertCanAdjust.mockRejectedValue(new ForbiddenException());
      await expect(
        service.purchase('w1', 'item1', ru('u1'), dto),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSubdocs.appendInventoryItem).not.toHaveBeenCalled();
    });

    it('položka zdarma (cena 0) → bez adjustu, log s paidAmount 0', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem({ price: 0 }));
      const res = await service.purchase('w1', 'item1', ru('pj1'), dto);
      expect(mockAccounts.debitIfSufficient).not.toHaveBeenCalled();
      expect(mockPurchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: 0, accountTransactionId: '' }),
      );
      expect(res.newBalance).toBe(200);
    });

    it('neexistující položka → 404', async () => {
      mockShopRepo.findById.mockResolvedValue(null);
      await expect(
        service.purchase('w1', 'item1', ru('pj1'), dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── D-PURCHASE-IDEMPOTENCY — clientNonce (vzor chat 6.2h) ────────────────
  describe('idempotence (clientNonce)', () => {
    const NONCE = '123e4567-e89b-42d3-a456-426614174000';

    it('replay: nákup se stejným nonce už existuje → vrátí PŮVODNÍ výsledek, žádné zápisy', async () => {
      mockPurchaseRepo.findByNonce.mockResolvedValue({
        id: 'p-orig',
        accountId: 'acc1',
        clientNonce: NONCE,
        status: 'active',
      });
      mockAccounts.getAccount.mockResolvedValue({ ...account, balance: 100 });

      const res = await service.purchase('w1', 'item1', ru('pj1'), {
        ...dto,
        clientNonce: NONCE,
      });

      // Scope per buyer — lookup jde přes (buyerUserId, nonce).
      expect(mockPurchaseRepo.findByNonce).toHaveBeenCalledWith('pj1', NONCE);
      expect(res.purchase.id).toBe('p-orig');
      expect(res.newBalance).toBe(100);
      // Žádný 2. odečet / 2. položka / 2. log.
      expect(mockShopRepo.findById).not.toHaveBeenCalled();
      expect(mockSubdocs.appendInventoryItem).not.toHaveBeenCalled();
      expect(mockAccounts.debitIfSufficient).not.toHaveBeenCalled();
      expect(mockPurchaseRepo.create).not.toHaveBeenCalled();
    });

    it('bez nonce → žádný nonce lookup, nákup proběhne jako dřív (zpětná kompatibilita)', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 100,
        transactions: [{ id: 'tx1', delta: -100 }],
      });

      const res = await service.purchase('w1', 'item1', ru('pj1'), dto);

      expect(mockPurchaseRepo.findByNonce).not.toHaveBeenCalled();
      expect(mockPurchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientNonce: null }),
      );
      expect(res.newBalance).toBe(100);
    });

    it('nonce se ukládá do purchase logu (součást atomické větve)', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 100,
        transactions: [{ id: 'tx1', delta: -100 }],
      });

      await service.purchase('w1', 'item1', ru('pj1'), {
        ...dto,
        clientNonce: NONCE,
      });

      expect(mockPurchaseRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientNonce: NONCE }),
      );
    });

    it('E11000 na nonce (prohraný závod) → kompenzace + replay vítěze, ne chyba', async () => {
      mockShopRepo.findById.mockResolvedValue(makeItem());
      mockAccounts.debitIfSufficient.mockResolvedValue({
        ...account,
        balance: 100,
        transactions: [{ id: 'tx1', delta: -100 }],
      });
      // Unique index (buyerUserId, clientNonce) odmítne 2. insert.
      const dupErr = Object.assign(
        new Error(
          'E11000 duplicate key error collection: test.campaignPurchases index: buyerUserId_1_clientNonce_1 dup key',
        ),
        { code: 11000 },
      );
      mockPurchaseRepo.create.mockRejectedValueOnce(dupErr);
      mockPurchaseRepo.findByNonce
        .mockResolvedValueOnce(null) // pre-check: vítěz ještě nedopsal
        .mockResolvedValueOnce({
          id: 'p-winner',
          accountId: 'acc1',
          clientNonce: NONCE,
        }); // po E11000: vítěz už je zapsaný
      mockAccounts.adjust.mockResolvedValue({ ...account });
      mockAccounts.getAccount.mockResolvedValue({ ...account, balance: 100 });

      const res = await service.purchase('w1', 'item1', ru('pj1'), {
        ...dto,
        clientNonce: NONCE,
      });

      // Vrácen PŮVODNÍ nákup vítěze (žádná výjimka ven).
      expect(res.purchase.id).toBe('p-winner');
      expect(res.newBalance).toBe(100);
      // Fallback (unit = bez replica setu) musel odečet KOMPENZOVAT
      // (revert účtu + odebrání položky) — jinak by zůstal 2. odečet.
      expect(mockAccounts.adjust).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({ amount: 100 }),
        expect.anything(),
      );
      expect(mockSubdocs.updateInventory).toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    const activePurchase = {
      id: 'p1',
      worldId: 'w1',
      characterId: 'char1',
      buyerUserId: 'u1',
      accountId: 'acc1',
      paidAmount: 100,
      inventorySectionId: 'sec1',
      inventoryItemId: 'it1',
      status: 'active' as const,
      itemSnapshot: { name: 'Meč' },
    };

    // Bez replica setu (unit) padá `withTransaction` → sekvenční fallback, kde
    // se kredit dělá přes `creditInSession` bez session (bez-gate cesta).
    it('fallback: vrátí peníze (creditInSession) + odebere položku z vybavení', async () => {
      mockPurchaseRepo.findById.mockResolvedValue(activePurchase);
      mockPurchaseRepo.markRefundedIfActive.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      mockAccounts.creditInSession.mockResolvedValue({
        ...account,
        balance: 300,
      });
      mockSubdocs.getInventory.mockResolvedValue({
        sections: [{ id: 'sec1', items: [{ id: 'it1' }] }],
      });

      const res = await service.refund('w1', 'p1', ru('pj1'));

      expect(mockPurchaseRepo.markRefundedIfActive).toHaveBeenCalledWith('p1');
      expect(mockAccounts.creditInSession).toHaveBeenCalledWith(
        'acc1',
        100,
        expect.stringContaining('Storno'),
        'u1',
      );
      expect(mockSubdocs.updateInventory).toHaveBeenCalled();
      expect(res.newBalance).toBe(300);
    });

    it('už vrácený nákup → 409', async () => {
      mockPurchaseRepo.findById.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      await expect(service.refund('w1', 'p1', ru('pj1'))).rejects.toThrow(
        ConflictException,
      );
    });

    it('tolerantní: smazaná položka ve vybavení nezabrání vrácení peněz', async () => {
      mockPurchaseRepo.findById.mockResolvedValue(activePurchase);
      mockPurchaseRepo.markRefundedIfActive.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      mockAccounts.creditInSession.mockResolvedValue({
        ...account,
        balance: 300,
      });
      mockSubdocs.getInventory.mockRejectedValue(new Error('gone'));
      const res = await service.refund('w1', 'p1', ru('pj1'));
      expect(res.newBalance).toBe(300);
      expect(mockPurchaseRepo.markRefundedIfActive).toHaveBeenCalled();
    });

    it('fallback: selhání kreditu po flipu → kompenzace (markActiveIfRefunded) + throw', async () => {
      mockPurchaseRepo.findById.mockResolvedValue(activePurchase);
      mockPurchaseRepo.markRefundedIfActive.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      mockAccounts.creditInSession.mockRejectedValue(
        new NotFoundException({ code: 'ACCOUNT_NOT_FOUND' }),
      );
      mockPurchaseRepo.markActiveIfRefunded.mockResolvedValue(undefined);

      await expect(service.refund('w1', 'p1', ru('pj1'))).rejects.toThrow(
        NotFoundException,
      );
      // Kompenzace — status vrácen zpět na active, ať storno nezůstane
      // refunded bez peněz (trvalá ztráta + hráč zablokován).
      expect(mockPurchaseRepo.markActiveIfRefunded).toHaveBeenCalledWith('p1');
    });

    it('transakční cesta (replica set): flip + kredit přes session, bez kompenzace', async () => {
      // Přemockuj withTransaction, ať spustí callback se session (jako na
      // replica setu) místo defaultního „throw → fallback".
      mockSession.withTransaction.mockImplementationOnce(
        async (cb: () => Promise<void>) => {
          await cb();
        },
      );
      mockPurchaseRepo.findById.mockResolvedValue(activePurchase);
      mockPurchaseRepo.markRefundedIfActive.mockResolvedValue({
        ...activePurchase,
        status: 'refunded',
      });
      mockAccounts.creditInSession.mockResolvedValue({
        ...account,
        balance: 300,
      });
      mockSubdocs.getInventory.mockResolvedValue({
        sections: [{ id: 'sec1', items: [{ id: 'it1' }] }],
      });

      const res = await service.refund('w1', 'p1', ru('pj1'));

      // V tx verzi se flip i kredit volají SE session (2. resp. 5. argument).
      expect(mockPurchaseRepo.markRefundedIfActive).toHaveBeenCalledWith(
        'p1',
        mockSession,
      );
      expect(mockAccounts.creditInSession).toHaveBeenCalledWith(
        'acc1',
        100,
        expect.stringContaining('Storno'),
        'u1',
        mockSession,
      );
      expect(mockPurchaseRepo.markActiveIfRefunded).not.toHaveBeenCalled();
      expect(res.newBalance).toBe(300);
    });
  });
});
