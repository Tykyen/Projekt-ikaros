// backend/src/modules/world-weather/repositories/weather-generator-set.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WeatherGeneratorSetSchemaClass } from '../schemas/weather-generator-set.schema';
import type {
  WeatherGeneratorSet,
  WeatherGeneratorSetItem,
  IWeatherGeneratorSetRepository,
} from '../interfaces/weather-generator-set.interface';

/**
 * 9.4 Weather Generator Set — Mongo repo per svět.
 *
 * Pattern stejný jako `MongoCustomWeatherPresetRepository`:
 *  - `findByWorldId` sort createdAt desc
 *  - `update` má whitelist polí (defense-in-depth)
 *  - `_id` validace přes Types.ObjectId.isValid
 */
@Injectable()
export class MongoWeatherGeneratorSetRepository implements IWeatherGeneratorSetRepository {
  constructor(
    @InjectModel(WeatherGeneratorSetSchemaClass.name)
    private readonly model: Model<WeatherGeneratorSetSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WeatherGeneratorSet[]> {
    const docs = await this.model
      .find({ worldId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<WeatherGeneratorSet | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async save(
    data: Omit<
      WeatherGeneratorSet,
      'id' | 'createdAt' | 'updatedAt' | 'appliedCount'
    >,
  ): Promise<WeatherGeneratorSet> {
    const instance = new this.model({ ...data, appliedCount: 0 });
    const saved = await instance.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    id: string,
    data: Partial<
      Pick<WeatherGeneratorSet, 'name' | 'description' | 'emoji' | 'items'>
    >,
  ): Promise<WeatherGeneratorSet | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    // Whitelist — `createdBy`/`appliedCount`/`worldId` nikdy přes update.
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.emoji !== undefined) patch.emoji = data.emoji;
    if (data.items !== undefined) patch.items = data.items;
    if (Object.keys(patch).length === 0) {
      return this.findById(id);
    }
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async incrementAppliedCount(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model
      .findByIdAndUpdate(id, { $inc: { appliedCount: 1 } })
      .exec();
  }

  private toEntity(doc: Record<string, unknown>): WeatherGeneratorSet {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: doc.name as string,
      description: doc.description as string | undefined,
      emoji: doc.emoji as string | undefined,
      items: ((doc.items as unknown[]) ?? []).map((it) => {
        const raw = it as Record<string, unknown>;
        return {
          presetId: raw.presetId as string,
          generatorName: raw.generatorName as string,
          description: raw.description as string | undefined,
        } satisfies WeatherGeneratorSetItem;
      }),
      createdBy: doc.createdBy as string,
      appliedCount: (doc.appliedCount as number | undefined) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
