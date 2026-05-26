// backend/src/modules/world-weather/repositories/weather-generator.repository.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WeatherGeneratorSchemaClass } from '../schemas/weather-generator.schema';
import { IWeatherGeneratorRepository } from '../interfaces/weather-generator-repository.interface';
import {
  WeatherGenerator,
  WeatherResult,
} from '../interfaces/weather-generator.interface';

@Injectable()
export class MongoWeatherGeneratorRepository implements IWeatherGeneratorRepository {
  constructor(
    @InjectModel(WeatherGeneratorSchemaClass.name)
    private readonly model: Model<WeatherGeneratorSchemaClass>,
  ) {}

  async findById(id: string): Promise<WeatherGenerator | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByWorldId(worldId: string): Promise<WeatherGenerator[]> {
    // 9.4-I — řazení dle displayOrder asc, createdAt asc (stabilní pro stejný order)
    const docs = await this.model
      .find({ worldId })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  /**
   * 9.4-I — atomicky přeřadí generátory dle pořadí v `orderedIds`.
   * Index 0 v poli = displayOrder 0, atd.
   * Caller musí zajistit, že orderedIds obsahuje VŠECHNY generátory světa (validace ve service).
   */
  async reorder(worldId: string, orderedIds: string[]): Promise<void> {
    // Bulk write atomic — všechny update v jedné operaci
    const ops = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(id), worldId },
        update: { $set: { displayOrder: index } },
      },
    }));
    if (ops.length === 0) return;
    await this.model.bulkWrite(ops);
  }

  async save(data: Partial<WeatherGenerator>): Promise<WeatherGenerator> {
    const instance = new this.model(data);
    const saved = await instance.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async update(
    id: string,
    data: Partial<WeatherGenerator>,
  ): Promise<WeatherGenerator | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async setCurrentWeather(
    id: string,
    weather: WeatherResult,
  ): Promise<WeatherGenerator | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { $set: { currentWeather: weather } },
        { new: true },
      )
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

  private toEntity(doc: Record<string, unknown>): WeatherGenerator {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: doc.name as string,
      description: doc.description as string | undefined,
      config: doc.config as WeatherGenerator['config'],
      currentWeather: doc.currentWeather as WeatherResult | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
      // 9.4-I — fallback 0 (BC pro existing dokumenty bez displayOrder)
      displayOrder: (doc.displayOrder as number | undefined) ?? 0,
    };
  }
}
