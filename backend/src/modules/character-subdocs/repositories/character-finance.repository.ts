import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CharacterFinanceSchemaClass } from '../schemas/character-finance.schema';
import { CharacterFinance } from '../interfaces/character-finance.interface';

@Injectable()
export class CharacterFinanceRepository {
  constructor(
    @InjectModel(CharacterFinanceSchemaClass.name)
    private readonly model: Model<CharacterFinanceSchemaClass>,
  ) {}

  async findByCharacterId(
    characterId: string,
  ): Promise<CharacterFinance | null> {
    const doc = await this.model.findOne({ characterId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(characterId: string): Promise<CharacterFinance> {
    const created = new this.model({
      characterId,
      isHidden: false,
      balance: 0,
      entries: [],
      transactions: [],
      notes: '',
    });
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    characterId: string,
    data: Partial<CharacterFinance>,
  ): Promise<CharacterFinance | null> {
    const doc = await this.model
      .findOneAndUpdate({ characterId }, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteByCharacterId(characterId: string): Promise<void> {
    await this.model.deleteMany({ characterId }).exec();
  }

  private toEntity(doc: Record<string, unknown>): CharacterFinance {
    return {
      id: String(doc._id),
      characterId: doc.characterId as string,
      isHidden: (doc.isHidden as boolean) ?? false,
      accountType: (doc.accountType as string) ?? 'Osobní',
      accessLocation: (doc.accessLocation as string) ?? '',
      currency: (doc.currency as string) ?? '',
      lastSyncDate: doc.lastSyncDate as Date | undefined,
      balance: (doc.balance as number) ?? 0,
      entries: ((doc.entries as Record<string, unknown>[]) ?? []).map((e) => ({
        id: e.id as string,
        label: (e.label as string) ?? '',
        amount: (e.amount as number) ?? 0,
      })),
      transactions: ((doc.transactions as Record<string, unknown>[]) ?? []).map(
        (t) => ({
          id: t.id as string,
          date: t.date as Date,
          delta: (t.delta as number) ?? 0,
          description: (t.description as string) ?? '',
        }),
      ),
      // 8.1-FIR — RichText „Rozepsané" Matrix-style.
      notes: (doc.notes as string) ?? '',
      // D-073 — optimistic concurrency token.
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
