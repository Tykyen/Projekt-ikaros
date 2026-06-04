import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectConnection } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import type { Connection } from 'mongoose';
import { CharacterAccountRepository } from './repositories/character-account.repository';
import { CharactersService } from '../characters/characters.service';
import { UserRole } from '../users/interfaces/user.interface';
import type {
  CharacterAccount,
  FantasyDateLike,
  FinanceEntry,
  FinanceTransaction,
} from './interfaces/character-account.interface';

/**
 * D-8.6-transfer-notification — Event payload pro WebSocket broadcast
 * příjemci převodu peněz.
 */
export interface AccountTransferReceivedEvent {
  recipientCharacterIds: string[]; // všichni co-owners cílového účtu
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description: string;
}

// Event payloady — sdílené s `character-subdocs.service.ts`.
export interface CharacterDeletedPayload {
  characterId: string;
  worldId: string;
}

export interface CreateAccountInput {
  label: string;
  primaryOwnerCharacterId: string;
  /** Default = jen primary. Pro shared přidat další postavy. */
  ownerCharacterIds?: string[];
  currency: string;
  accountType?: string;
  accessLocationCharacterId?: string | null;
  notes?: string;
}

export interface UpdateAccountInput {
  label?: string;
  notes?: string;
  incomeEntries?: FinanceEntry[];
  expenseEntries?: FinanceEntry[];
  // settings — PJ-only, controller hlídá scope
  accountType?: string;
  accessLocationCharacterId?: string | null;
  currency?: string;
  /** Spec 8.x-prep §4.3 (B3) — flag pro povolení hráčova self-adjust. */
  allowPlayerSelfAdjust?: boolean;
}

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  /** Spec 8.x-prep §4.4 (B4) — herní datum transakce. */
  inGameDate?: FantasyDateLike | null;
}

/** Spec 8.x-prep §4.3 (B3) — vstup pro `adjust` (manuální vklad/výběr). */
export interface AdjustBalanceInput {
  amount: number;
  reason: string;
  /** Spec 8.x-prep §4.4 (B4) — herní datum transakce. */
  inGameDate?: FantasyDateLike | null;
}

const ACCOUNTS_PER_CHARACTER_LIMIT = 20;

/**
 * 8.6 — Service pro per-postava finanční účty. Vlastnictví je N:N (shared
 * accounts), permission rozhoduje role + role-aware contoller.
 *
 * Transfer: Mongo native `withTransaction` vyžaduje replica set, který dev
 * prostředí standardně nemá. Místo toho používáme sekvenční atomický
 * append-and-inc + revert-on-fail. Worst-case race window při crash mezi
 * update A a update B → zapíšeme error log, admin musí ručně opravit.
 * Replica set setup = dluh D-8.6-replica-set.
 */
@Injectable()
export class CharacterAccountsService {
  private readonly logger = new Logger(CharacterAccountsService.name);

  constructor(
    private readonly accountsRepo: CharacterAccountRepository,
    private readonly charactersService: CharactersService,
    private readonly eventEmitter: EventEmitter2,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ── Listing ────────────────────────────────────────────────────────

  async listAccountsForCharacter(
    characterId: string,
  ): Promise<CharacterAccount[]> {
    return this.accountsRepo.findByOwnerCharacterId(characterId);
  }

  async getAccount(accountId: string): Promise<CharacterAccount> {
    const account = await this.accountsRepo.findById(accountId);
    if (!account)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    return account;
  }

  // ── Create ────────────────────────────────────────────────────────

  async createAccount(
    worldId: string,
    input: CreateAccountInput,
  ): Promise<CharacterAccount> {
    const owners = input.ownerCharacterIds?.length
      ? Array.from(
          new Set([input.primaryOwnerCharacterId, ...input.ownerCharacterIds]),
        )
      : [input.primaryOwnerCharacterId];

    // Q8.6 — limit 20 účtů per postava (kontroluje se proti primary owner)
    const count = await this.accountsRepo.countByOwnerCharacterId(
      input.primaryOwnerCharacterId,
    );
    if (count >= ACCOUNTS_PER_CHARACTER_LIMIT)
      throw new BadRequestException({
        code: 'ACCOUNT_LIMIT_REACHED',
        message: `Postava může mít maximálně ${ACCOUNTS_PER_CHARACTER_LIMIT} účtů.`,
      });

    return this.accountsRepo.create({
      worldId,
      label: input.label,
      ownerCharacterIds: owners,
      primaryOwnerId: input.primaryOwnerCharacterId,
      accountType: input.accountType ?? 'Osobní',
      accessLocation: input.accessLocationCharacterId
        ? { type: 'character', characterId: input.accessLocationCharacterId }
        : null,
      currency: input.currency,
      balance: 0,
      incomeEntries: [],
      expenseEntries: [],
      transactions: [],
      notes: input.notes ?? '',
    });
  }

  // ── Update (content + settings — controller scope-uje per role) ──

  async updateAccountContent(
    accountId: string,
    patch: Pick<
      UpdateAccountInput,
      'label' | 'notes' | 'incomeEntries' | 'expenseEntries'
    >,
  ): Promise<CharacterAccount> {
    const updated = await this.accountsRepo.update(accountId, patch);
    if (!updated)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    return updated;
  }

  async updateAccountSettings(
    accountId: string,
    patch: Pick<
      UpdateAccountInput,
      | 'accountType'
      | 'accessLocationCharacterId'
      | 'currency'
      | 'allowPlayerSelfAdjust'
    >,
  ): Promise<CharacterAccount> {
    const dbPatch: Partial<CharacterAccount> = {};
    if (patch.accountType !== undefined)
      dbPatch.accountType = patch.accountType;
    if (patch.currency !== undefined) dbPatch.currency = patch.currency;
    if (patch.accessLocationCharacterId !== undefined) {
      dbPatch.accessLocation = patch.accessLocationCharacterId
        ? {
            type: 'character',
            characterId: patch.accessLocationCharacterId,
          }
        : null;
    }
    if (patch.allowPlayerSelfAdjust !== undefined)
      dbPatch.allowPlayerSelfAdjust = patch.allowPlayerSelfAdjust;
    const updated = await this.accountsRepo.update(accountId, dbPatch);
    if (!updated)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    return updated;
  }

  // ── Delete ────────────────────────────────────────────────────────

  async deleteAccount(accountId: string): Promise<void> {
    const account = await this.accountsRepo.findById(accountId);
    if (!account)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    await this.accountsRepo.deleteById(accountId);
  }

  // ── Měsíční zaúčtování ────────────────────────────────────────────

  async addMonthly(
    accountId: string,
    performedByUserId: string,
    inGameDate?: FantasyDateLike | null,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    const incomeSum = account.incomeEntries.reduce((s, e) => s + e.amount, 0);
    const expenseSum = account.expenseEntries.reduce((s, e) => s + e.amount, 0);
    const delta = incomeSum - expenseSum;

    const tx: FinanceTransaction = {
      id: randomUUID(),
      date: new Date(),
      inGameDate: inGameDate ?? null,
      delta,
      description: 'Měsíční zúčtování',
      performedByUserId,
    };

    const updated = await this.accountsRepo.appendTransaction(accountId, tx);
    if (!updated)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    return updated;
  }

  // ── Manuální vklad / výběr (B3 + B4) ─────────────────────────────

  /**
   * Spec 8.x-prep §4.3 (B3) — přímá úprava balance s povinným důvodem.
   * Permission přes `assertCanAdjust` (PJ+ vždy, hráč jen pokud
   * `account.allowPlayerSelfAdjust === true`).
   */
  async adjust(
    accountId: string,
    input: AdjustBalanceInput,
    performedByUserId: string,
    performerRole?: UserRole,
  ): Promise<CharacterAccount> {
    if (!Number.isFinite(input.amount) || input.amount === 0)
      throw new BadRequestException({
        code: 'AMOUNT_INVALID',
        message: 'Částka musí být nenulové číslo.',
      });
    if (!input.reason?.trim())
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Důvod je povinný.',
      });

    await this.assertCanAdjust(accountId, performedByUserId, performerRole);

    const tx: FinanceTransaction = {
      id: randomUUID(),
      date: new Date(),
      inGameDate: input.inGameDate ?? null,
      delta: input.amount,
      description: input.reason.trim(),
      performedByUserId,
    };
    const updated = await this.accountsRepo.appendTransaction(accountId, tx);
    if (!updated)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    return updated;
  }

  /**
   * Spec 8.x-prep §4.3 (B3) — gate pro `adjust`:
   * - staff (PomocnyPJ+) nebo GlobalAdmin (`isStaff` + R-02 bypass) → vždy
   * - Hráč-vlastník → jen pokud `account.allowPlayerSelfAdjust === true`
   * - Ostatní → 403
   */
  async assertCanAdjust(
    accountId: string,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (await this.isStaff(account.worldId, requesterId, requesterRole))
      return account;

    const character = await this.charactersService.findByUser(
      requesterId,
      account.worldId,
    );
    const isOwner =
      !!character && account.ownerCharacterIds.includes(character.id);
    if (!isOwner)
      throw new ForbiddenException({
        code: 'FORBIDDEN_ADJUST',
        message: 'Adjust smí jen vlastník nebo PJ.',
      });
    if (!account.allowPlayerSelfAdjust)
      throw new ForbiddenException({
        code: 'PLAYER_ADJUST_DISABLED',
        message: 'PJ pro tento účet hráčův vklad/výběr nepovolil.',
      });
    return account;
  }

  async undoLast(accountId: string): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (account.transactions.length === 0) return account;

    const last = account.transactions[account.transactions.length - 1];
    const updated = await this.accountsRepo.update(accountId, {
      balance: account.balance - last.delta,
      transactions: account.transactions.slice(0, -1),
    });
    return updated!;
  }

  // ── Transfer (sekvenční s revert-on-fail; viz R1) ────────────────

  async transfer(
    input: TransferInput,
    performedByUserId: string,
  ): Promise<{ from: CharacterAccount; to: CharacterAccount }> {
    if (input.amount <= 0)
      throw new BadRequestException({
        code: 'AMOUNT_INVALID',
        message: 'Částka musí být kladná',
      });
    if (input.fromAccountId === input.toAccountId)
      throw new BadRequestException({
        code: 'SAME_ACCOUNT',
        message: 'Nelze přesunout na stejný účet',
      });

    const from = await this.accountsRepo.findById(input.fromAccountId);
    const to = await this.accountsRepo.findById(input.toAccountId);
    if (!from || !to)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Účet nenalezen',
      });
    if (from.currency !== to.currency)
      throw new BadRequestException({
        code: 'CURRENCY_MISMATCH',
        message: 'Účty musí mít stejnou měnu',
      });

    const now = new Date();
    const txOutId = randomUUID();
    const txInId = randomUUID();

    const txOut: FinanceTransaction = {
      id: txOutId,
      date: now,
      inGameDate: input.inGameDate ?? null,
      delta: -input.amount,
      description: input.description || 'Převod',
      transferRef: {
        counterpartyAccountId: to.id,
        counterpartyCharacterId: to.primaryOwnerId,
        direction: 'out',
      },
      performedByUserId,
    };
    const txIn: FinanceTransaction = {
      id: txInId,
      date: now,
      inGameDate: input.inGameDate ?? null,
      delta: input.amount,
      description: input.description || 'Převod',
      transferRef: {
        counterpartyAccountId: from.id,
        counterpartyCharacterId: from.primaryOwnerId,
        direction: 'in',
      },
      performedByUserId,
    };

    // 2026-05-24 — pokus o atomic Mongo transaction; pokud Mongo neběží jako
    // replica set (`Transaction numbers are only allowed on a replica set
    // member or mongos`), fallback na sekvenční flow s revert-on-fail.
    const session = await this.connection.startSession();
    try {
      let fromUpdated: CharacterAccount | null = null;
      let toUpdated: CharacterAccount | null = null;
      try {
        await session.withTransaction(async () => {
          fromUpdated = await this.accountsRepo.appendTransaction(
            from.id,
            txOut,
            session,
          );
          if (!fromUpdated) throw new Error('FROM_NOT_FOUND');
          toUpdated = await this.accountsRepo.appendTransaction(
            to.id,
            txIn,
            session,
          );
          if (!toUpdated) throw new Error('TO_NOT_FOUND');
        });
      } catch (txErr) {
        const msg = (txErr as Error).message || '';
        // Replica set not configured → fallback path.
        if (
          msg.includes('replica set') ||
          msg.includes('Transaction numbers') ||
          msg.includes('IllegalOperation')
        ) {
          this.logger.warn(
            'Mongo replica set not available, falling back to sequential transfer (D-8.6-replica-set).',
          );
          return await this.transferSequentialFallback(
            from,
            to,
            txOut,
            txIn,
            input,
          );
        }
        throw txErr;
      }

      if (!fromUpdated || !toUpdated)
        throw new BadRequestException({
          code: 'TRANSFER_FAILED',
          message: 'Převod se nezdařil',
        });

      // D-8.6-transfer-notification — broadcast příjemci pro toast/sound.
      const notifyPayload: AccountTransferReceivedEvent = {
        recipientCharacterIds: to.ownerCharacterIds,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: input.amount,
        currency: to.currency,
        description: input.description || 'Převod',
      };
      this.eventEmitter.emit('account.transfer.received', notifyPayload);

      return { from: fromUpdated, to: toUpdated };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Fallback pro dev prostředí bez replica setu — sekvenční update s
   * revert-on-fail. Identické chování jako pre-replica-set rollout.
   */
  private async transferSequentialFallback(
    from: CharacterAccount,
    to: CharacterAccount,
    txOut: FinanceTransaction,
    txIn: FinanceTransaction,
    input: TransferInput,
  ): Promise<{ from: CharacterAccount; to: CharacterAccount }> {
    const fromUpdated = await this.accountsRepo.appendTransaction(
      from.id,
      txOut,
    );
    if (!fromUpdated)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Zdrojový účet nenalezen',
      });
    try {
      const toUpdated = await this.accountsRepo.appendTransaction(to.id, txIn);
      if (!toUpdated) throw new Error('TO_NOT_FOUND_AFTER_FROM_SUCCESS');

      const notifyPayload: AccountTransferReceivedEvent = {
        recipientCharacterIds: to.ownerCharacterIds,
        fromAccountId: from.id,
        toAccountId: to.id,
        amount: input.amount,
        currency: to.currency,
        description: input.description || 'Převod',
      };
      this.eventEmitter.emit('account.transfer.received', notifyPayload);
      return { from: fromUpdated, to: toUpdated };
    } catch (err) {
      this.logger.error(
        `Transfer revert: krok 2 selhal pro ${input.fromAccountId} → ${input.toAccountId}, amount ${input.amount}.`,
        err as Error,
      );
      try {
        await this.accountsRepo.appendTransaction(from.id, {
          ...txOut,
          id: randomUUID(),
          delta: input.amount,
          description: `Revert: ${txOut.description}`,
        });
      } catch (revertErr) {
        this.logger.error(
          `Revert transfer selhal pro ${input.fromAccountId}. Ruční oprava nutná.`,
          revertErr as Error,
        );
      }
      throw new BadRequestException({
        code: 'TRANSFER_FAILED',
        message: 'Převod se nezdařil, zkus to znovu',
      });
    }
  }

  // ── Co-owners ─────────────────────────────────────────────────────

  async addCoOwner(
    accountId: string,
    characterId: string,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (account.ownerCharacterIds.includes(characterId)) return account;

    const updated = await this.accountsRepo.update(accountId, {
      ownerCharacterIds: [...account.ownerCharacterIds, characterId],
    });
    return updated!;
  }

  async removeCoOwner(
    accountId: string,
    characterId: string,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (characterId === account.primaryOwnerId)
      throw new BadRequestException({
        code: 'CANNOT_REMOVE_PRIMARY',
        message: 'Primárního vlastníka nelze odebrat (převeď roli jinému).',
      });

    const next = account.ownerCharacterIds.filter((id) => id !== characterId);
    const updated = await this.accountsRepo.update(accountId, {
      ownerCharacterIds: next,
    });
    return updated!;
  }

  /**
   * D-8.6-transferPrimary — Převod primary ownership na jiného co-owner.
   * Nový primary musí být už v `ownerCharacterIds`. Pokud ne, automatic
   * je doplníme (atomický addCoOwner + převod).
   */
  async transferPrimaryOwnership(
    accountId: string,
    newPrimaryCharacterId: string,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (newPrimaryCharacterId === account.primaryOwnerId) return account;

    const owners = account.ownerCharacterIds.includes(newPrimaryCharacterId)
      ? account.ownerCharacterIds
      : [...account.ownerCharacterIds, newPrimaryCharacterId];

    const updated = await this.accountsRepo.update(accountId, {
      ownerCharacterIds: owners,
      primaryOwnerId: newPrimaryCharacterId,
    });
    return updated!;
  }

  // ── Permission helpers ───────────────────────────────────────────

  /**
   * Read přístup: vlastník, spoluvlastník nebo PomocnyPJ+.
   * Vrací account při povolení, throw při zákazu.
   */
  async assertReadAccess(
    accountId: string,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (await this.isStaffOrOwner(account, requesterId, requesterRole))
      return account;
    throw new ForbiddenException({
      code: 'ACCOUNT_ACCESS_DENIED',
      message: 'Přístup k účtu odepřen',
    });
  }

  async assertWriteContentAccess(
    accountId: string,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<CharacterAccount> {
    return this.assertReadAccess(accountId, requesterId, requesterRole);
  }

  async assertWriteSettingsAccess(
    accountId: string,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    // Settings: staff (PomocnyPJ+) nebo GlobalAdmin (R-02 — bypass přes
    // `requesterRole`). Pozn.: dřív komentář i hláška říkaly „jen PJ", ale
    // `isStaff` propouští už PomocnyPJ(4) — sjednoceno s realitou.
    if (await this.isStaff(account.worldId, requesterId, requesterRole))
      return account;
    throw new ForbiddenException({
      code: 'ACCOUNT_SETTINGS_PJ_ONLY',
      message: 'Nastavení účtu může měnit jen PJ / pomocný PJ (staff).',
    });
  }

  async assertDeleteAccess(
    accountId: string,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<CharacterAccount> {
    const account = await this.getAccount(accountId);
    if (await this.isStaff(account.worldId, requesterId, requesterRole))
      return account;
    // Primary owner může mazat
    const character = await this.charactersService.findByUser(
      requesterId,
      account.worldId,
    );
    if (character && character.id === account.primaryOwnerId) return account;
    throw new ForbiddenException({
      code: 'ACCOUNT_DELETE_DENIED',
      message: 'Účet může smazat jen primární vlastník nebo PJ.',
    });
  }

  private async isStaffOrOwner(
    account: CharacterAccount,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<boolean> {
    if (await this.isStaff(account.worldId, requesterId, requesterRole))
      return true;
    const character = await this.charactersService.findByUser(
      requesterId,
      account.worldId,
    );
    return !!character && account.ownerCharacterIds.includes(character.id);
  }

  private async isStaff(
    worldId: string,
    requesterId: string,
    requesterRole?: UserRole,
  ): Promise<boolean> {
    return this.charactersService.isWorldStaff(
      worldId,
      requesterId,
      requesterRole,
    );
  }

  // ── Event handlers ────────────────────────────────────────────────

  /**
   * `character.deleted` → handle ownership cleanup (Q8.2):
   *  - Pokud postava byla primary, primary přejde na dalšího co-owner;
   *    pokud zbyl jediný = mazaná, účet se smaže.
   *  - Pokud postava byla co-owner, jen ji odeber z `ownerCharacterIds`.
   */
  @OnEvent('character.deleted')
  async onCharacterDeleted(payload: CharacterDeletedPayload): Promise<void> {
    const { characterId } = payload;
    const accounts =
      await this.accountsRepo.findByOwnerCharacterId(characterId);
    for (const acc of accounts) {
      const remainingOwners = acc.ownerCharacterIds.filter(
        (id) => id !== characterId,
      );
      if (remainingOwners.length === 0) {
        await this.accountsRepo.deleteById(acc.id);
        continue;
      }
      const newPrimary =
        acc.primaryOwnerId === characterId
          ? remainingOwners[0]
          : acc.primaryOwnerId;
      await this.accountsRepo.update(acc.id, {
        ownerCharacterIds: remainingOwners,
        primaryOwnerId: newPrimary,
      });
    }
  }
}
