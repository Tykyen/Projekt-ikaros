import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getConnectionToken } from '@nestjs/mongoose';
import { CharacterAccountsService } from './character-accounts.service';
import { CharacterAccountRepository } from './repositories/character-account.repository';
import { CharactersService } from '../characters/characters.service';
import { WorldCurrenciesService } from '../world-currencies/world-currencies.service';
import type { CharacterAccount } from './interfaces/character-account.interface';
import { UserRole } from '../users/interfaces/user.interface';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

/** Helper — RequestUser pro permission gating (isWorldStaff je v testech mockované). */
const ru = (id: string, role: UserRole = UserRole.Hrac): RequestUser => ({
  id,
  role,
  username: id,
});

/**
 * 8.6 — Spec pro CharacterAccountsService.
 * Pokrytí: CRUD, addMonthly (income-expense bilance), transfer (atomicita +
 * revert + currency mismatch + amount validation), co-owner ops, permission
 * guardy, character.deleted cleanup.
 */
describe('CharacterAccountsService', () => {
  let service: CharacterAccountsService;

  const mockAccountsRepo = {
    findById: jest.fn(),
    findByOwnerCharacterId: jest.fn(),
    findByWorldId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    appendTransaction: jest.fn(),
    appendTransactionIfSufficient: jest.fn(),
    replaceMoneyFields: jest.fn(),
    deleteById: jest.fn(),
    countByOwnerCharacterId: jest.fn(),
  };

  const mockCharactersService = {
    findByUser: jest.fn(),
    findById: jest.fn(),
    isWorldStaff: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockCurrenciesService = {
    getItems: jest.fn(),
  };

  // 2026-05-24 — Mongo session pro `withTransaction` v transferu.
  // Default: simuluje "replica set chybí" → fallback na sequential flow.
  const mockSession = {
    withTransaction: jest.fn((_cb: () => Promise<unknown>) => {
      // Replica set not available — fallback path se aktivuje, když withTransaction
      // hodí chybu obsahující 'replica set'.
      return Promise.reject(
        new Error('Transaction numbers are only allowed on a replica set'),
      );
    }),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  const mockConnection = {
    startSession: jest.fn().mockResolvedValue(mockSession),
  };

  const mockAccount = (
    overrides: Partial<CharacterAccount> = {},
  ): CharacterAccount => ({
    id: 'acc1',
    worldId: 'w1',
    label: 'Hlavní účet',
    ownerCharacterIds: ['char1'],
    primaryOwnerId: 'char1',
    accountType: 'Osobní',
    accessLocation: null,
    currency: 'ZL',
    balance: 1000,
    incomeEntries: [],
    expenseEntries: [],
    transactions: [],
    notes: '',
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CharacterAccountsService,
        { provide: CharacterAccountRepository, useValue: mockAccountsRepo },
        { provide: CharactersService, useValue: mockCharactersService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: getConnectionToken(), useValue: mockConnection },
        { provide: WorldCurrenciesService, useValue: mockCurrenciesService },
      ],
    }).compile();
    service = module.get(CharacterAccountsService);
  });

  describe('changeCurrency', () => {
    type MoneyFields = {
      currency: string;
      balance: number;
      transactions: { delta: number }[];
      incomeEntries: { amount: number }[];
      expenseEntries: { amount: number }[];
    };
    const RATES = [
      { id: '1', code: 'ZL', name: 'Zlaťák', symbol: 'Zl', rate: 1.0 },
      { id: '2', code: 'ST', name: 'Stříbrňák', symbol: 'St', rate: 0.1 },
    ];

    it('convert:false → jen přeznačí kód měny (bez kurzu)', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ currency: 'ZL' }),
      );
      mockAccountsRepo.update.mockResolvedValue(
        mockAccount({ currency: 'ST' }),
      );

      const res = await service.changeCurrency('acc1', 'ST', false);

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        currency: 'ST',
      });
      expect(mockCurrenciesService.getItems).not.toHaveBeenCalled();
      expect(res.currency).toBe('ST');
    });

    it('convert:true → přepočítá balance + historii + šablony kurzem', async () => {
      const account = mockAccount({
        currency: 'ZL',
        balance: 100,
        transactions: [
          {
            id: 't1',
            date: new Date(),
            delta: 60,
            description: 'a',
            performedByUserId: 'u1',
          },
          {
            id: 't2',
            date: new Date(),
            delta: 40,
            description: 'b',
            performedByUserId: 'u1',
          },
        ],
        incomeEntries: [{ id: 'i1', label: 'plat', amount: 10 }],
        expenseEntries: [{ id: 'e1', label: 'daň', amount: 5 }],
      });
      mockAccountsRepo.findById.mockResolvedValue(account);
      mockCurrenciesService.getItems.mockResolvedValue(RATES);
      mockAccountsRepo.replaceMoneyFields.mockImplementation(
        (_id: string, fields: MoneyFields) =>
          Promise.resolve({ ...account, ...fields }),
      );

      const res = await service.changeCurrency('acc1', 'ST', true);

      // r = 1.0 / 0.1 = 10 → vše ×10; balance = Σ delta
      const arg = mockAccountsRepo.replaceMoneyFields.mock
        .calls[0][1] as MoneyFields;
      expect(arg.currency).toBe('ST');
      expect(arg.transactions.map((t) => t.delta)).toEqual([600, 400]);
      expect(arg.balance).toBe(1000);
      expect(arg.incomeEntries[0].amount).toBe(100);
      expect(arg.expenseEntries[0].amount).toBe(50);
      expect(res.currency).toBe('ST');
    });

    it('convert:true bez kurzu cílové měny → CURRENCY_RATE_MISSING', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ currency: 'ZL' }),
      );
      mockCurrenciesService.getItems.mockResolvedValue([RATES[0]]); // jen ZL

      await expect(
        service.changeCurrency('acc1', 'ST', true),
      ).rejects.toMatchObject({ response: { code: 'CURRENCY_RATE_MISSING' } });
      expect(mockAccountsRepo.replaceMoneyFields).not.toHaveBeenCalled();
    });

    it('convert:true bez transakcí → balance = balance × r', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ currency: 'ZL', balance: 100, transactions: [] }),
      );
      mockCurrenciesService.getItems.mockResolvedValue(RATES);
      mockAccountsRepo.replaceMoneyFields.mockImplementation(
        (_id: string, fields: MoneyFields) =>
          Promise.resolve({ ...mockAccount(), ...fields }),
      );

      await service.changeCurrency('acc1', 'ST', true);

      const arg = mockAccountsRepo.replaceMoneyFields.mock
        .calls[0][1] as MoneyFields;
      expect(arg.balance).toBe(1000);
    });

    it('stejná měna → no-op (žádný zápis)', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ currency: 'ZL' }),
      );

      const res = await service.changeCurrency('acc1', 'ZL', true);

      expect(mockAccountsRepo.update).not.toHaveBeenCalled();
      expect(mockAccountsRepo.replaceMoneyFields).not.toHaveBeenCalled();
      expect(res.currency).toBe('ZL');
    });
  });

  describe('createAccount', () => {
    it('vytvoří účet pro PC s primary ownership', async () => {
      mockAccountsRepo.countByOwnerCharacterId.mockResolvedValue(0);
      mockAccountsRepo.create.mockResolvedValue(mockAccount());

      const result = await service.createAccount('w1', {
        label: 'Hlavní účet',
        primaryOwnerCharacterId: 'char1',
        currency: 'ZL',
      });

      expect(mockAccountsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'w1',
          label: 'Hlavní účet',
          ownerCharacterIds: ['char1'],
          primaryOwnerId: 'char1',
          currency: 'ZL',
          balance: 0,
        }),
      );
      expect(result.id).toBe('acc1');
    });

    it('podporuje shared account (více vlastníků)', async () => {
      mockAccountsRepo.countByOwnerCharacterId.mockResolvedValue(0);
      mockAccountsRepo.create.mockResolvedValue(
        mockAccount({ ownerCharacterIds: ['char1', 'char2'] }),
      );

      await service.createAccount('w1', {
        label: 'Společný měšec',
        primaryOwnerCharacterId: 'char1',
        ownerCharacterIds: ['char2'],
        currency: 'ZL',
      });

      expect(mockAccountsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerCharacterIds: ['char1', 'char2'],
        }),
      );
    });

    it('throw ACCOUNT_LIMIT_REACHED při 20 účtech', async () => {
      mockAccountsRepo.countByOwnerCharacterId.mockResolvedValue(20);

      await expect(
        service.createAccount('w1', {
          label: 'X',
          primaryOwnerCharacterId: 'char1',
          currency: 'ZL',
        }),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_LIMIT_REACHED' },
      });
    });
  });

  describe('addMonthly', () => {
    it('zaúčtuje měsíc jako income − expense', async () => {
      const acc = mockAccount({
        balance: 1000,
        incomeEntries: [
          { id: 'i1', label: 'Plat', amount: 500 },
          { id: 'i2', label: 'Renty', amount: 200 },
        ],
        expenseEntries: [{ id: 'e1', label: 'Bydlení', amount: 300 }],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.appendTransaction.mockResolvedValue({
        ...acc,
        balance: 1400,
      });

      const result = await service.addMonthly('acc1', 'user1');

      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({
          delta: 400, // 500 + 200 − 300
          description: 'Měsíční zúčtování',
          performedByUserId: 'user1',
        }),
      );
      expect(result.balance).toBe(1400);
    });

    it('záporná bilance je povolena (Q8.8 — dluh)', async () => {
      const acc = mockAccount({
        balance: 100,
        incomeEntries: [],
        expenseEntries: [{ id: 'e1', label: 'Nájem', amount: 500 }],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.appendTransaction.mockResolvedValue({
        ...acc,
        balance: -400,
      });

      const result = await service.addMonthly('acc1', 'user1');
      expect(result.balance).toBe(-400);
    });

    // Spec 8.x-prep §4.4 (B4)
    it('propaguje inGameDate do transakce', async () => {
      const acc = mockAccount({ balance: 100 });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.appendTransaction.mockResolvedValue({ ...acc });

      const inGameDate = { year: 2039, monthIndex: 5, day: 14 };
      await service.addMonthly('acc1', 'user1', inGameDate);

      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({ inGameDate }),
      );
    });

    it('inGameDate=null pokud parametr není zadaný', async () => {
      const acc = mockAccount({ balance: 100 });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.appendTransaction.mockResolvedValue({ ...acc });

      await service.addMonthly('acc1', 'user1');
      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({ inGameDate: null }),
      );
    });
  });

  // Spec 8.x-prep §4.3 (B3) + §4.4 (B4)
  describe('adjust (manuální vklad/výběr)', () => {
    it('PJ smí vklad — vytvoří transakci s reasonem a delta', async () => {
      const acc = mockAccount({ balance: 100, allowPlayerSelfAdjust: false });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockCharactersService.isWorldStaff.mockResolvedValue(true);
      mockAccountsRepo.appendTransaction.mockResolvedValue({
        ...acc,
        balance: 1100,
      });

      const result = await service.adjust(
        'acc1',
        { amount: 1000, reason: 'Nález pokladu' },
        ru('pj1'),
      );

      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({
          delta: 1000,
          description: 'Nález pokladu',
          performedByUserId: 'pj1',
        }),
      );
      expect(result.balance).toBe(1100);
    });

    it('PJ smí výběr (záporná částka)', async () => {
      const acc = mockAccount({ balance: 1000, allowPlayerSelfAdjust: false });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockCharactersService.isWorldStaff.mockResolvedValue(true);
      mockAccountsRepo.appendTransaction.mockResolvedValue({
        ...acc,
        balance: 700,
      });

      await service.adjust(
        'acc1',
        { amount: -300, reason: 'Pokuta' },
        ru('pj1'),
      );
      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({ delta: -300, description: 'Pokuta' }),
      );
    });

    it('hráč-vlastník smí adjust pokud allowPlayerSelfAdjust=true', async () => {
      const acc = mockAccount({
        ownerCharacterIds: ['char1'],
        allowPlayerSelfAdjust: true,
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({ id: 'char1' });
      mockAccountsRepo.appendTransaction.mockResolvedValue({ ...acc });

      await expect(
        service.adjust('acc1', { amount: 50, reason: 'Odměna' }, ru('hrac1')),
      ).resolves.toBeDefined();
    });

    it('hráč-vlastník bez flagu → 403 PLAYER_ADJUST_DISABLED', async () => {
      const acc = mockAccount({
        ownerCharacterIds: ['char1'],
        allowPlayerSelfAdjust: false,
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({ id: 'char1' });

      await expect(
        service.adjust('acc1', { amount: 50, reason: 'X' }, ru('hrac1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cizí hráč (ne vlastník) → 403 FORBIDDEN_ADJUST', async () => {
      const acc = mockAccount({
        ownerCharacterIds: ['char1'],
        allowPlayerSelfAdjust: true,
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({ id: 'charOther' });

      await expect(
        service.adjust('acc1', { amount: 50, reason: 'X' }, ru('hrac2')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('amount=0 → 400 AMOUNT_INVALID', async () => {
      await expect(
        service.adjust('acc1', { amount: 0, reason: 'X' }, ru('pj1')),
      ).rejects.toThrow(/Částka/);
    });

    it('prázdný reason → 400 REASON_REQUIRED', async () => {
      await expect(
        service.adjust('acc1', { amount: 100, reason: '   ' }, ru('pj1')),
      ).rejects.toThrow(/Důvod/);
    });

    it('propaguje inGameDate', async () => {
      const acc = mockAccount({ allowPlayerSelfAdjust: false });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockCharactersService.isWorldStaff.mockResolvedValue(true);
      mockAccountsRepo.appendTransaction.mockResolvedValue({ ...acc });

      const inGameDate = { year: 2039, monthIndex: 5, day: 14 };
      await service.adjust(
        'acc1',
        { amount: 100, reason: 'Test', inGameDate },
        ru('pj1'),
      );
      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledWith(
        'acc1',
        expect.objectContaining({ inGameDate }),
      );
    });
  });

  describe('undoLast', () => {
    it('vrátí poslední transakci', async () => {
      const acc = mockAccount({
        balance: 1500,
        transactions: [
          {
            id: 't1',
            date: new Date(),
            delta: 500,
            description: 'Plat',
            performedByUserId: 'user1',
          },
        ],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.update.mockResolvedValue({
        ...acc,
        balance: 1000,
        transactions: [],
      });

      const result = await service.undoLast('acc1');

      // RC-E3 fix: undoLast jede přes withTransaction; unit mock rejectne
      // ('replica set') → fallback `undoLastOnce(accountId)` → update(id, patch,
      // session=undefined) → 3. argument je undefined.
      expect(mockAccountsRepo.update).toHaveBeenCalledWith(
        'acc1',
        { balance: 1000, transactions: [] },
        undefined,
      );
      expect(result.balance).toBe(1000);
    });

    it('no-op když nejsou transakce', async () => {
      const acc = mockAccount({ transactions: [] });
      mockAccountsRepo.findById.mockResolvedValue(acc);

      const result = await service.undoLast('acc1');

      expect(result).toEqual(acc);
      expect(mockAccountsRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('transfer', () => {
    it('atomicky strhne ze zdroje + připíše na cíl', async () => {
      const from = mockAccount({ id: 'acc1', balance: 1000, currency: 'ZL' });
      const to = mockAccount({
        id: 'acc2',
        primaryOwnerId: 'char2',
        ownerCharacterIds: ['char2'],
        balance: 500,
        currency: 'ZL',
      });
      mockAccountsRepo.findById
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
      mockAccountsRepo.appendTransaction
        .mockResolvedValueOnce({ ...from, balance: 700 })
        .mockResolvedValueOnce({ ...to, balance: 800 });

      const result = await service.transfer(
        {
          fromAccountId: 'acc1',
          toAccountId: 'acc2',
          amount: 300,
          description: 'Vrácení dluhu',
        },
        'user1',
      );

      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledTimes(2);
      expect(mockAccountsRepo.appendTransaction).toHaveBeenNthCalledWith(
        1,
        'acc1',
        expect.objectContaining({
          delta: -300,
          description: 'Vrácení dluhu',
          transferRef: expect.objectContaining({
            counterpartyAccountId: 'acc2',
            direction: 'out',
          }),
          performedByUserId: 'user1',
        }),
      );
      expect(mockAccountsRepo.appendTransaction).toHaveBeenNthCalledWith(
        2,
        'acc2',
        expect.objectContaining({
          delta: 300,
          transferRef: expect.objectContaining({
            counterpartyAccountId: 'acc1',
            direction: 'in',
          }),
        }),
      );
      expect(result.from.balance).toBe(700);
      expect(result.to.balance).toBe(800);
    });

    it('throw CURRENCY_MISMATCH když měny nesedí', async () => {
      mockAccountsRepo.findById
        .mockResolvedValueOnce(mockAccount({ currency: 'ZL' }))
        .mockResolvedValueOnce(mockAccount({ id: 'acc2', currency: 'CR' }));

      await expect(
        service.transfer(
          {
            fromAccountId: 'acc1',
            toAccountId: 'acc2',
            amount: 100,
            description: 'X',
          },
          'user1',
        ),
      ).rejects.toMatchObject({ response: { code: 'CURRENCY_MISMATCH' } });
      expect(mockAccountsRepo.appendTransaction).not.toHaveBeenCalled();
    });

    it('throw AMOUNT_INVALID pro 0 nebo zápornou částku', async () => {
      await expect(
        service.transfer(
          {
            fromAccountId: 'acc1',
            toAccountId: 'acc2',
            amount: 0,
            description: 'X',
          },
          'user1',
        ),
      ).rejects.toMatchObject({ response: { code: 'AMOUNT_INVALID' } });

      await expect(
        service.transfer(
          {
            fromAccountId: 'acc1',
            toAccountId: 'acc2',
            amount: -50,
            description: 'X',
          },
          'user1',
        ),
      ).rejects.toMatchObject({ response: { code: 'AMOUNT_INVALID' } });
    });

    it('throw SAME_ACCOUNT pro transfer na stejný účet', async () => {
      await expect(
        service.transfer(
          {
            fromAccountId: 'acc1',
            toAccountId: 'acc1',
            amount: 100,
            description: 'X',
          },
          'user1',
        ),
      ).rejects.toMatchObject({ response: { code: 'SAME_ACCOUNT' } });
    });

    it('revertuje zdroj při selhání krok 2 (revert-on-fail)', async () => {
      const from = mockAccount({ id: 'acc1', balance: 1000, currency: 'ZL' });
      const to = mockAccount({ id: 'acc2', balance: 500, currency: 'ZL' });
      mockAccountsRepo.findById
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
      // Krok 1 OK, krok 2 fail
      mockAccountsRepo.appendTransaction
        .mockResolvedValueOnce({ ...from, balance: 700 })
        .mockResolvedValueOnce(null) // simulate not found
        .mockResolvedValueOnce({ ...from, balance: 1000 }); // revert OK

      await expect(
        service.transfer(
          {
            fromAccountId: 'acc1',
            toAccountId: 'acc2',
            amount: 300,
            description: 'X',
          },
          'user1',
        ),
      ).rejects.toMatchObject({ response: { code: 'TRANSFER_FAILED' } });

      // 3× volání: out + in + revert
      expect(mockAccountsRepo.appendTransaction).toHaveBeenCalledTimes(3);
      // Revert má opačné znamení a "Revert: ..." popis
      expect(mockAccountsRepo.appendTransaction).toHaveBeenLastCalledWith(
        'acc1',
        expect.objectContaining({
          delta: 300,
          description: expect.stringMatching(/^Revert:/),
        }),
      );
    });
  });

  describe('addCoOwner / removeCoOwner', () => {
    it('addCoOwner přidá nového vlastníka', async () => {
      const acc = mockAccount({ ownerCharacterIds: ['char1'] });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.update.mockResolvedValue({
        ...acc,
        ownerCharacterIds: ['char1', 'char2'],
      });

      const result = await service.addCoOwner('acc1', 'char2');

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        ownerCharacterIds: ['char1', 'char2'],
      });
      expect(result.ownerCharacterIds).toEqual(['char1', 'char2']);
    });

    it('addCoOwner no-op pokud už je vlastník', async () => {
      const acc = mockAccount({ ownerCharacterIds: ['char1', 'char2'] });
      mockAccountsRepo.findById.mockResolvedValue(acc);

      const result = await service.addCoOwner('acc1', 'char2');

      expect(result).toEqual(acc);
      expect(mockAccountsRepo.update).not.toHaveBeenCalled();
    });

    it('removeCoOwner odebere ne-primary', async () => {
      const acc = mockAccount({
        primaryOwnerId: 'char1',
        ownerCharacterIds: ['char1', 'char2'],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.update.mockResolvedValue({
        ...acc,
        ownerCharacterIds: ['char1'],
      });

      const result = await service.removeCoOwner('acc1', 'char2');

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        ownerCharacterIds: ['char1'],
      });
      expect(result.ownerCharacterIds).toEqual(['char1']);
    });

    it('removeCoOwner throw CANNOT_REMOVE_PRIMARY pro primary', async () => {
      const acc = mockAccount({
        primaryOwnerId: 'char1',
        ownerCharacterIds: ['char1', 'char2'],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);

      await expect(
        service.removeCoOwner('acc1', 'char1'),
      ).rejects.toMatchObject({ response: { code: 'CANNOT_REMOVE_PRIMARY' } });
    });
  });

  // ── D-8.6-transferPrimary ────────────────────────────────────────
  describe('transferPrimaryOwnership', () => {
    it('převede primary na existujícího co-owner', async () => {
      const acc = mockAccount({
        primaryOwnerId: 'char1',
        ownerCharacterIds: ['char1', 'char2'],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.update.mockResolvedValue({
        ...acc,
        primaryOwnerId: 'char2',
      });

      const result = await service.transferPrimaryOwnership('acc1', 'char2');

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        ownerCharacterIds: ['char1', 'char2'],
        primaryOwnerId: 'char2',
      });
      expect(result.primaryOwnerId).toBe('char2');
    });

    it('automaticky přidá nového primary do owners pokud chybí', async () => {
      const acc = mockAccount({
        primaryOwnerId: 'char1',
        ownerCharacterIds: ['char1'],
      });
      mockAccountsRepo.findById.mockResolvedValue(acc);
      mockAccountsRepo.update.mockResolvedValue({
        ...acc,
        ownerCharacterIds: ['char1', 'char2'],
        primaryOwnerId: 'char2',
      });

      await service.transferPrimaryOwnership('acc1', 'char2');

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        ownerCharacterIds: ['char1', 'char2'],
        primaryOwnerId: 'char2',
      });
    });

    it('no-op pokud target už je primary', async () => {
      const acc = mockAccount({ primaryOwnerId: 'char1' });
      mockAccountsRepo.findById.mockResolvedValue(acc);

      const result = await service.transferPrimaryOwnership('acc1', 'char1');

      expect(result).toEqual(acc);
      expect(mockAccountsRepo.update).not.toHaveBeenCalled();
    });
  });

  // ── D-8.6-transfer-notification ──────────────────────────────────
  describe('transfer emit notification event', () => {
    it('emituje account.transfer.received po úspěšném transferu', async () => {
      const from = mockAccount({ id: 'acc1', balance: 1000, currency: 'ZL' });
      const to = mockAccount({
        id: 'acc2',
        primaryOwnerId: 'char2',
        ownerCharacterIds: ['char2', 'char3'],
        balance: 500,
        currency: 'ZL',
      });
      mockAccountsRepo.findById
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
      mockAccountsRepo.appendTransaction
        .mockResolvedValueOnce({ ...from, balance: 700 })
        .mockResolvedValueOnce({ ...to, balance: 800 });

      await service.transfer(
        {
          fromAccountId: 'acc1',
          toAccountId: 'acc2',
          amount: 300,
          description: 'Splátka',
        },
        'user1',
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'account.transfer.received',
        expect.objectContaining({
          recipientCharacterIds: ['char2', 'char3'],
          fromAccountId: 'acc1',
          toAccountId: 'acc2',
          amount: 300,
          currency: 'ZL',
          description: 'Splátka',
        }),
      );
    });

    it('neemituje event pokud transfer selže (currency mismatch)', async () => {
      mockAccountsRepo.findById
        .mockResolvedValueOnce(mockAccount({ currency: 'ZL' }))
        .mockResolvedValueOnce(mockAccount({ id: 'acc2', currency: 'CR' }));

      await expect(
        service.transfer(
          {
            fromAccountId: 'acc1',
            toAccountId: 'acc2',
            amount: 100,
            description: 'X',
          },
          'user1',
        ),
      ).rejects.toMatchObject({ response: { code: 'CURRENCY_MISMATCH' } });

      expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
        'account.transfer.received',
        expect.anything(),
      );
    });
  });

  describe('permission guards', () => {
    it('assertReadAccess: PJ ano', async () => {
      mockAccountsRepo.findById.mockResolvedValue(mockAccount());
      mockCharactersService.isWorldStaff.mockResolvedValue(true);

      await expect(
        service.assertReadAccess('acc1', ru('user1')),
      ).resolves.toBeTruthy();
    });

    it('assertReadAccess: vlastník postavy ano', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ ownerCharacterIds: ['char1'] }),
      );
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({
        id: 'char1',
        worldId: 'w1',
      });

      await expect(
        service.assertReadAccess('acc1', ru('user1')),
      ).resolves.toBeTruthy();
    });

    it('assertReadAccess: cizí hráč throw FORBIDDEN', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ ownerCharacterIds: ['char1'] }),
      );
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({
        id: 'char-other',
        worldId: 'w1',
      });

      await expect(
        service.assertReadAccess('acc1', ru('user1')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('assertWriteSettingsAccess: jen PJ může nastavení (Q8.4)', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ ownerCharacterIds: ['char1'] }),
      );
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({ id: 'char1' });

      await expect(
        service.assertWriteSettingsAccess('acc1', ru('user1')),
      ).rejects.toMatchObject({
        response: { code: 'ACCOUNT_SETTINGS_PJ_ONLY' },
      });
    });

    it('assertDeleteAccess: primary owner ano', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({ primaryOwnerId: 'char1' }),
      );
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({ id: 'char1' });

      await expect(
        service.assertDeleteAccess('acc1', ru('user1')),
      ).resolves.toBeTruthy();
    });

    it('assertDeleteAccess: co-owner (ne primary) throw', async () => {
      mockAccountsRepo.findById.mockResolvedValue(
        mockAccount({
          primaryOwnerId: 'char1',
          ownerCharacterIds: ['char1', 'char2'],
        }),
      );
      mockCharactersService.isWorldStaff.mockResolvedValue(false);
      mockCharactersService.findByUser.mockResolvedValue({ id: 'char2' });

      await expect(
        service.assertDeleteAccess('acc1', ru('user1')),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_DELETE_DENIED' } });
    });
  });

  describe('onCharacterDeleted cleanup (Q8.2)', () => {
    it('primary → primary přejde na dalšího co-owner', async () => {
      mockAccountsRepo.findByOwnerCharacterId.mockResolvedValue([
        mockAccount({
          id: 'acc1',
          primaryOwnerId: 'char1',
          ownerCharacterIds: ['char1', 'char2'],
        }),
      ]);

      await service.onCharacterDeleted({ characterId: 'char1', worldId: 'w1' });

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        ownerCharacterIds: ['char2'],
        primaryOwnerId: 'char2',
      });
      expect(mockAccountsRepo.deleteById).not.toHaveBeenCalled();
    });

    it('co-owner (ne primary) → odebrat z owners', async () => {
      mockAccountsRepo.findByOwnerCharacterId.mockResolvedValue([
        mockAccount({
          id: 'acc1',
          primaryOwnerId: 'char1',
          ownerCharacterIds: ['char1', 'char2'],
        }),
      ]);

      await service.onCharacterDeleted({ characterId: 'char2', worldId: 'w1' });

      expect(mockAccountsRepo.update).toHaveBeenCalledWith('acc1', {
        ownerCharacterIds: ['char1'],
        primaryOwnerId: 'char1',
      });
    });

    it('jediný vlastník = mazaná → účet se smaže', async () => {
      mockAccountsRepo.findByOwnerCharacterId.mockResolvedValue([
        mockAccount({
          id: 'acc1',
          primaryOwnerId: 'char1',
          ownerCharacterIds: ['char1'],
        }),
      ]);

      await service.onCharacterDeleted({ characterId: 'char1', worldId: 'w1' });

      expect(mockAccountsRepo.deleteById).toHaveBeenCalledWith('acc1');
      expect(mockAccountsRepo.update).not.toHaveBeenCalled();
    });
  });
});
