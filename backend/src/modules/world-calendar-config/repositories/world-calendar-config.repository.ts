import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldCalendarConfigSchemaClass } from '../schemas/world-calendar-config.schema';
import type { IWorldCalendarConfigRepository } from '../interfaces/world-calendar-config-repository.interface';
import type {
  WorldCalendarConfig,
  CelestialBody,
  CalendarMonth,
  CalendarReferenceDate,
} from '../interfaces/world-calendar-config.interface';

@Injectable()
export class MongoWorldCalendarConfigRepository implements IWorldCalendarConfigRepository {
  constructor(
    @InjectModel(WorldCalendarConfigSchemaClass.name)
    private readonly model: Model<WorldCalendarConfigSchemaClass>,
  ) {}

  async findByWorldId(worldId: string): Promise<WorldCalendarConfig | null> {
    const doc = await this.model.findOne({ worldId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async upsert(
    worldId: string,
    data: Omit<
      WorldCalendarConfig,
      'id' | 'worldId' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<WorldCalendarConfig> {
    const doc = await this.model
      .findOneAndUpdate(
        { worldId },
        { $set: { worldId, ...data } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): WorldCalendarConfig {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      hoursPerDay: (doc.hoursPerDay as number) ?? 24,
      daysOfWeek: (doc.daysOfWeek as string[]) ?? [],
      months: (doc.months as CalendarMonth[]) ?? [],
      celestialBodies: (doc.celestialBodies as CelestialBody[]) ?? [],
      referenceDate:
        (doc.referenceDate as CalendarReferenceDate | null) ?? null,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
