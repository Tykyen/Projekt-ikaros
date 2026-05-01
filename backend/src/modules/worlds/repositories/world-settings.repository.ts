import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldSettingsSchemaClass } from '../schemas/world-settings.schema';
import { WorldSettings } from '../interfaces/world-settings.interface';
import type { IWorldSettingsRepository } from '../interfaces/world-settings-repository.interface';

@Injectable()
export class MongoWorldSettingsRepository implements IWorldSettingsRepository {
  constructor(
    @InjectModel(WorldSettingsSchemaClass.name)
    private readonly model: Model<WorldSettingsSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WorldSettings | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async upsert(worldId: string, data: Partial<WorldSettings>): Promise<WorldSettings> {
    const update = { ...data, worldId, updatedAt: new Date() };
    const doc = await this.model
      .findOneAndUpdate({ worldId }, { $set: update }, { new: true, upsert: true })
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): WorldSettings {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      hiddenNavItems: (doc.hiddenNavItems as string[]) ?? [],
      customGroups: (doc.customGroups as string[]) ?? [],
      groupColors: (doc.groupColors as Record<string, string>) ?? {},
      customHeadline: (doc.customHeadline as WorldSettings['customHeadline']) ?? [],
      currencies: (doc.currencies as WorldSettings['currencies']) ?? [],
      hideDefaultWeather: (doc.hideDefaultWeather as boolean) ?? false,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
