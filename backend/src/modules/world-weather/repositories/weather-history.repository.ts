// 9.4 dluh #2 — historie počasí (snapshot persistence).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WeatherHistorySchemaClass } from '../schemas/weather-history.schema';
import type {
  IWeatherHistoryRepository,
  WeatherHistoryEntry,
  WeatherHistoryTrigger,
} from '../interfaces/weather-history.interface';
import type { WeatherResult } from '../interfaces/weather-generator.interface';

@Injectable()
export class MongoWeatherHistoryRepository implements IWeatherHistoryRepository {
  constructor(
    @InjectModel(WeatherHistorySchemaClass.name)
    private readonly model: Model<WeatherHistorySchemaClass>,
  ) {}

  async appendSnapshot(input: {
    worldId: string;
    generatorId: string;
    weather: WeatherResult;
    trigger: WeatherHistoryTrigger;
    inGameDate?: Date | null;
  }): Promise<WeatherHistoryEntry> {
    const doc = await this.model.create({
      worldId: input.worldId,
      generatorId: input.generatorId,
      weather: input.weather as unknown as Record<string, unknown>,
      trigger: input.trigger,
      inGameDate: input.inGameDate ?? null,
    });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findByGenerator(
    worldId: string,
    generatorId: string,
    limit = 50,
    offset = 0,
  ): Promise<WeatherHistoryEntry[]> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safeOffset = Math.max(0, offset);
    const docs = await this.model
      .find({ worldId, generatorId })
      .sort({ recordedAt: -1, _id: -1 })
      .skip(safeOffset)
      .limit(safeLimit)
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async count(worldId: string, generatorId: string): Promise<number> {
    return this.model.countDocuments({ worldId, generatorId }).exec();
  }

  private toEntity(doc: Record<string, unknown>): WeatherHistoryEntry {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      generatorId: doc.generatorId as string,
      weather: doc.weather as WeatherResult,
      inGameDate: (doc.inGameDate as Date | null) ?? null,
      trigger: doc.trigger as WeatherHistoryTrigger,
      recordedAt: doc.recordedAt as Date,
    };
  }
}
