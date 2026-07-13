import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { CharacterAccountSchemaClass } from '../schemas/character-account.schema';
import type {
  CharacterAccount,
  FantasyDateLike,
  FinanceTransaction,
} from '../interfaces/character-account.interface';
import { MONEY_EPSILON } from '../../../common/money/money.util';

@Injectable()
export class CharacterAccountRepository {
  constructor(
    @InjectModel(CharacterAccountSchemaClass.name)
    private readonly model: Model<CharacterAccountSchemaClass>,
  ) {}

  async findById(
    id: string,
    session?: ClientSession,
  ): Promise<CharacterAccount | null> {
    const q = this.model.findById(id);
    if (session) q.session(session);
    const doc = await q.lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * Vrátí všechny účty, kde je character vlastníkem nebo spoluvlastníkem.
   */
  async findByOwnerCharacterId(
    characterId: string,
  ): Promise<CharacterAccount[]> {
    const docs = await this.model
      .find({ ownerCharacterIds: characterId })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByWorldId(worldId: string): Promise<CharacterAccount[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async create(
    input: Omit<CharacterAccount, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CharacterAccount> {
    const created = new this.model(input);
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    id: string,
    patch: Partial<CharacterAccount>,
    session?: ClientSession,
  ): Promise<CharacterAccount | null> {
    const q = this.model.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (session) q.session(session);
    const doc = await q.lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * Atomický `$push` transakce + `$inc` balance (delta). Použito v transferu
   * v rámci `withTransaction`, kde je consistency napříč 2 účty kritická.
   */
  async appendTransaction(
    accountId: string,
    tx: FinanceTransaction,
    session?: ClientSession,
  ): Promise<CharacterAccount | null> {
    const q = this.model.findByIdAndUpdate(
      accountId,
      {
        $push: { transactions: tx },
        $inc: { balance: tx.delta },
      },
      { new: true },
    );
    if (session) q.session(session);
    const doc = await q.lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * RC-E1 fix — atomický odečet S kontrolou krytí. `$push` tx + `$inc` balance
   * proběhne JEN když `balance >= requiredAbs` (podmínka ve filtru se vyhodnotí
   * atomicky při zápisu). Vrací null při nedostatku NEBO neexistujícím účtu →
   * volající rozliší přes předchozí `findById`. Brání TOCTOU overdraftu: dva
   * souběžné nákupy nemůžou oba projít, protože druhý už nesplní `$gte`.
   *
   * D-PURCHASE-IDEMPOTENCY — `guardNonce`: filtr navíc vyžaduje, že žádná
   * existující transakce účtu nemá tento `clientNonce`. Podmínka je součástí
   * JEDNOHO atomického findOneAndUpdate → dva paralelní transfery se stejným
   * nonce nemůžou projít oba (dokument sám je zdroj pravdy; unique multikey
   * index by duplicitu UVNITŘ jednoho dokumentu nechytil, guard ve filtru ano).
   */
  async appendTransactionIfSufficient(
    accountId: string,
    tx: FinanceTransaction,
    requiredAbs: number,
    session?: ClientSession,
    guardNonce?: string | null,
  ): Promise<CharacterAccount | null> {
    const filter: Record<string, unknown> = {
      _id: accountId,
      // D-SEC-GAP float — epsilon tolerance (1e-9 « peněžní granularita 1e-4):
      // sufficiency zůstává atomicky na DB hodnotě, ale binární šum ULP /
      // drobný historický drift (balance 0.2999999999999999 ≈ 0.30) nesmí
      // shodit výběr přesně na hranici. Reálný overdraft to neumožní.
      balance: { $gte: requiredAbs - MONEY_EPSILON },
    };
    if (guardNonce) {
      filter.transactions = {
        $not: { $elemMatch: { clientNonce: guardNonce } },
      };
    }
    const q = this.model.findOneAndUpdate(
      filter,
      { $push: { transactions: tx }, $inc: { balance: tx.delta } },
      { new: true },
    );
    if (session) q.session(session);
    const doc = await q.lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * D-PURCHASE-IDEMPOTENCY — vyčistí `clientNonce` konkrétní transakce.
   * Používá se v revert-on-fail větvi transferu: převod REÁLNĚ neproběhl
   * (debet byl kompenzován), takže nonce nesmí zůstat „spotřebovaný" — retry
   * klienta se stejným nonce musí dostat čerstvý pokus, ne falešný replay.
   */
  async clearTransactionNonce(
    accountId: string,
    transactionId: string,
  ): Promise<void> {
    await this.model
      .updateOne(
        { _id: accountId },
        { $unset: { 'transactions.$[t].clientNonce': '' } },
        { arrayFilters: [{ 't.id': transactionId }] },
      )
      .exec();
  }

  /**
   * 8.x currency-conversion — atomický přepočet měny účtu: jedním `$set`
   * nahradí `currency` + všechna peněžní pole (balance, transactions,
   * income/expenseEntries). Single-doc update = atomický (žádná tx potřeba).
   */
  async replaceMoneyFields(
    accountId: string,
    fields: Pick<
      CharacterAccount,
      | 'currency'
      | 'balance'
      | 'transactions'
      | 'incomeEntries'
      | 'expenseEntries'
    >,
  ): Promise<CharacterAccount | null> {
    const doc = await this.model
      .findByIdAndUpdate(accountId, { $set: fields }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteById(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id }).exec();
  }

  async countByOwnerCharacterId(characterId: string): Promise<number> {
    return this.model.countDocuments({ ownerCharacterIds: characterId }).exec();
  }

  private toEntity(doc: Record<string, unknown>): CharacterAccount {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      label: (doc.label as string) ?? '',
      ownerCharacterIds: (doc.ownerCharacterIds as string[]) ?? [],
      primaryOwnerId: doc.primaryOwnerId as string,
      accountType: (doc.accountType as string) ?? 'Osobní',
      accessLocation:
        (doc.accessLocation as CharacterAccount['accessLocation']) ?? null,
      currency: (doc.currency as string) ?? '',
      balance: (doc.balance as number) ?? 0,
      incomeEntries: (
        (doc.incomeEntries as Record<string, unknown>[]) ?? []
      ).map((e) => ({
        id: e.id as string,
        label: (e.label as string) ?? '',
        amount: (e.amount as number) ?? 0,
      })),
      expenseEntries: (
        (doc.expenseEntries as Record<string, unknown>[]) ?? []
      ).map((e) => ({
        id: e.id as string,
        label: (e.label as string) ?? '',
        amount: (e.amount as number) ?? 0,
      })),
      transactions: ((doc.transactions as Record<string, unknown>[]) ?? []).map(
        (t) => ({
          id: t.id as string,
          date: t.date as Date,
          // Spec 8.x-prep §4.4 (B4) — herní datum transakce; legacy
          // transakce bez pole → undefined (FE fallbackne na real-world `date`).
          inGameDate:
            (t.inGameDate as FantasyDateLike | null | undefined) ?? null,
          delta: (t.delta as number) ?? 0,
          description: (t.description as string) ?? '',
          transferRef: t.transferRef as
            | FinanceTransaction['transferRef']
            | undefined,
          // PT-43 — marker původu (purchase); legacy tx bez pole → undefined.
          origin: t.origin as FinanceTransaction['origin'],
          // D-PURCHASE-IDEMPOTENCY — nonce odchozí transferové tx.
          clientNonce: (t.clientNonce as string | null | undefined) ?? null,
          performedByUserId: (t.performedByUserId as string) ?? '',
        }),
      ),
      notes: (doc.notes as string) ?? '',
      // Spec 8.x-prep §4.3 (B3) — flag pro hráčův self-adjust.
      allowPlayerSelfAdjust: Boolean(doc.allowPlayerSelfAdjust ?? false),
      createdAt: doc.createdAt as Date | undefined,
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
