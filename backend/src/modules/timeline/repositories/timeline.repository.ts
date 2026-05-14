import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import type {
  ITimelineRepository,
  TimelineFindOptions,
} from '../interfaces/timeline-repository.interface';
import type {
  TimelineEvent,
  CelestialOverride,
} from '../interfaces/timeline-event.interface';
import { TimelineEventSchemaClass } from '../schemas/timeline-event.schema';

@Injectable()
export class MongoTimelineRepository implements ITimelineRepository {
  constructor(
    @InjectModel(TimelineEventSchemaClass.name)
    private readonly model: Model<TimelineEventSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): TimelineEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      year: doc.year as number,
      month: doc.month as number,
      day: doc.day as number,
      hour: (doc.hour as number | null) ?? undefined,
      title: doc.title as string,
      text: doc.text as string,
      imageUrl: (doc.imageUrl as string | null) ?? null,
      link: (doc.link as string | null) ?? null,
      celestialOverrides: (doc.celestialOverrides as CelestialOverride[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async findMany(opts: TimelineFindOptions): Promise<TimelineEvent[]> {
    const filter: Record<string, unknown> = { worldId: opts.worldId };
    if (opts.fromYear !== undefined || opts.toYear !== undefined) {
      const yearFilter: Record<string, number> = {};
      if (opts.fromYear !== undefined) yearFilter.$gte = opts.fromYear;
      if (opts.toYear !== undefined) yearFilter.$lte = opts.toYear;
      filter.year = yearFilter;
    }
    const docs = await this.model
      .find(filter)
      .sort({ year: 1, month: 1, day: 1, hour: 1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<TimelineEvent | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(
    data: Omit<TimelineEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TimelineEvent> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    patch: Partial<
      Omit<TimelineEvent, 'id' | 'worldId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<TimelineEvent | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
