// backend/src/modules/world-weather/repositories/custom-weather-preset.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomWeatherPresetSchemaClass } from '../schemas/custom-weather-preset.schema';
import type {
  CustomWeatherPreset,
  ICustomWeatherPresetRepository,
} from '../interfaces/custom-weather-preset.interface';
import type { WeatherGeneratorConfig } from '../interfaces/weather-generator.interface';

/**
 * 9.4-dluh — Mongo repo pro custom weather presets per svět.
 */
@Injectable()
export class MongoCustomWeatherPresetRepository implements ICustomWeatherPresetRepository {
  constructor(
    @InjectModel(CustomWeatherPresetSchemaClass.name)
    private readonly model: Model<CustomWeatherPresetSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<CustomWeatherPreset[]> {
    // Sort: most recently created first (= „nejnovější nahoře", PJ default
    // očekávání). Pokud chce PJ sort podle usage, FE zařídí client-side.
    const docs = await this.model
      .find({ worldId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<CustomWeatherPreset | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async save(
    data: Omit<CustomWeatherPreset, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CustomWeatherPreset> {
    const instance = new this.model(data);
    const saved = await instance.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    id: string,
    data: Partial<Pick<CustomWeatherPreset, 'name' | 'description' | 'emoji'>>,
  ): Promise<CustomWeatherPreset | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    // POZOR: explicitně whitelist polí — nikdy nepustit `config` přes update
    // (immutability invariant). Service vrstva validuje DTO, ale obrana
    // v depth-first.
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.emoji !== undefined) patch.emoji = data.emoji;
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

  async incrementUsage(id: string): Promise<CustomWeatherPreset | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $inc: { usageCount: 1 } }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  private toEntity(doc: Record<string, unknown>): CustomWeatherPreset {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: doc.name as string,
      description: doc.description as string | undefined,
      emoji: doc.emoji as string | undefined,
      config: doc.config as WeatherGeneratorConfig,
      createdBy: doc.createdBy as string,
      usageCount: (doc.usageCount as number | undefined) ?? 0,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
