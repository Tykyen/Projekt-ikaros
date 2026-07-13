import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldCurrenciesSchemaClass } from '../schemas/world-currencies.schema';
import type {
  WorldCurrencies,
  WorldCurrencyItem,
} from '../interfaces/world-currencies.interface';
import type { IWorldCurrenciesRepository } from '../interfaces/world-currencies-repository.interface';

@Injectable()
export class MongoWorldCurrenciesRepository implements IWorldCurrenciesRepository {
  constructor(
    @InjectModel(WorldCurrenciesSchemaClass.name)
    private readonly model: Model<WorldCurrenciesSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WorldCurrencies | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async upsert(
    worldId: string,
    items: WorldCurrencyItem[],
  ): Promise<WorldCurrencies> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId },
        { $set: { items, worldId, updatedAt: new Date() } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  /**
   * D-NEW-INV-DATA-SYNC — atomický optimistic lock (vzor pages RC-P1):
   * `findOneAndUpdate` s podmínkou `updatedAt: expectedUpdatedAt` ve filtru.
   * Ze dvou souběžných PUT stejné verze uspěje právě jeden; druhý už filtr
   * nesplní → null = konflikt. Bez upsertu — vytvoření první sady jde přes
   * `upsert` (není co ztratit).
   */
  async replaceIfUnchanged(
    worldId: string,
    items: WorldCurrencyItem[],
    expectedUpdatedAt: Date,
  ): Promise<WorldCurrencies | null> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId, updatedAt: expectedUpdatedAt },
        { $set: { items, updatedAt: new Date() } },
        { new: true },
      )
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  private toEntity(doc: Record<string, unknown>): WorldCurrencies {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      items: (doc.items as WorldCurrencyItem[]) ?? [],
      updatedAt: doc.updatedAt as Date,
    };
  }
}
