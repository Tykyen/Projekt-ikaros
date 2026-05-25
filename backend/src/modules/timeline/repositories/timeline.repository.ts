import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import type {
  ITimelineRepository,
  TimelineFindOptions,
  TimelinePage,
} from '../interfaces/timeline-repository.interface';
import type {
  TimelineEvent,
  CelestialOverride,
} from '../interfaces/timeline-event.interface';
import { TimelineEventSchemaClass } from '../schemas/timeline-event.schema';
import { escapeRegex } from '../../../common/utils/escape-regex';
import { buildCursorWhere } from '../lib/timeline-cursor';

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
      imageFocalX: (doc.imageFocalX as number | null) ?? null,
      imageFocalY: (doc.imageFocalY as number | null) ?? null,
      link: (doc.link as string | null) ?? null,
      pageSlug: (doc.pageSlug as string | null) ?? null,
      celestialOverrides: (doc.celestialOverrides as CelestialOverride[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }

  async findMany(opts: TimelineFindOptions): Promise<TimelinePage> {
    const filter: Record<string, unknown> = { worldId: opts.worldId };
    if (opts.fromYear !== undefined || opts.toYear !== undefined) {
      const yearFilter: Record<string, number> = {};
      if (opts.fromYear !== undefined) yearFilter.$gte = opts.fromYear;
      if (opts.toYear !== undefined) yearFilter.$lte = opts.toYear;
      filter.year = yearFilter;
    }
    if (opts.search && opts.search.length > 0) {
      const safe = escapeRegex(opts.search);
      filter.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { text: { $regex: safe, $options: 'i' } },
      ];
    }
    const sort = opts.sort ?? 'desc';
    if (opts.cursor) {
      // Slučujeme s případným search $or — vytvoříme $and.
      const cursorWhere = buildCursorWhere(opts.cursor, sort);
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, cursorWhere];
        delete filter.$or;
      } else {
        Object.assign(filter, cursorWhere);
      }
    }
    // DESC = rok DESC, v rámci roku ASC; ASC = vše ASC.
    const sortSpec: Record<string, 1 | -1> =
      sort === 'desc'
        ? { year: -1, month: 1, day: 1, hour: 1, _id: 1 }
        : { year: 1, month: 1, day: 1, hour: 1, _id: 1 };
    const docs = await this.model
      .find(filter)
      .sort(sortSpec)
      .limit(opts.limit)
      .lean()
      .exec();
    const events = docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
    // nextCursor jen pokud nás čeká plná stránka — jinak konec.
    const nextCursor =
      events.length === opts.limit && events.length > 0
        ? this.toCursor(events[events.length - 1])
        : null;
    return { events, nextCursor };
  }

  private toCursor(e: TimelineEvent) {
    return {
      year: e.year,
      month: e.month,
      day: e.day,
      // null hour → -1 sentinel pro lexikografické porovnání.
      hour: e.hour ?? -1,
      id: e.id,
    };
  }

  async yearCounts(
    worldId: string,
  ): Promise<Array<{ year: number; count: number }>> {
    const rows = await this.model
      .aggregate<{
        year: number;
        count: number;
      }>([
        { $match: { worldId } },
        { $group: { _id: '$year', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $project: { year: '$_id', count: 1, _id: 0 } },
      ])
      .exec();
    return rows;
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
