import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { GameEventSchemaClass } from '../schemas/game-event.schema';
import type { GameEvent } from '../interfaces/game-event.interface';
import type {
  IGameEventRepository,
  ListFilters,
} from '../interfaces/game-event-repository.interface';

@Injectable()
export class MongoGameEventRepository
  extends BaseMongoRepository<GameEvent>
  implements IGameEventRepository
{
  constructor(
    @InjectModel(GameEventSchemaClass.name)
    model: Model<GameEventSchemaClass>,
  ) {
    super(model as unknown as Model<GameEvent & { _id: Types.ObjectId }>);
  }

  async findList(filters: ListFilters): Promise<GameEvent[]> {
    const query: Record<string, unknown> = { worldId: filters.worldId };
    const dateQuery: Record<string, string> = {};
    if (filters.fromDate) dateQuery.$gte = filters.fromDate;
    if (filters.toDate) dateQuery.$lte = filters.toDate;
    if (Object.keys(dateQuery).length > 0) query.date = dateQuery;

    // 9.1-I — archive query (toDate bez fromDate) sortuje DESC (nejnovější archivní nahoře).
    const isArchiveQuery =
      filters.toDate !== undefined && filters.fromDate === undefined;
    const sortOrder = isArchiveQuery ? -1 : 1;

    const cursor = this.model.find(query as never).sort({ date: sortOrder });
    if (filters.limit && filters.limit > 0) cursor.limit(filters.limit);
    const docs = await cursor.lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async create(
    data: Omit<GameEvent, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<GameEvent> {
    return this.save(data);
  }

  async findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]> {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
    const docs = await this.model
      .find({ date: { $gte: from, $lte: to }, reminderSent: false } as never)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findUpcomingForWorlds(
    worldIds: string[],
    fromDate: string,
    limit: number,
  ): Promise<GameEvent[]> {
    if (worldIds.length === 0) return [];
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const docs = await this.model
      .find({
        worldId: { $in: worldIds },
        date: { $gte: fromDate },
      } as never)
      .sort({ date: 1 })
      .limit(safeLimit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async markReminderSent(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model
      .findByIdAndUpdate(id, { $set: { reminderSent: true } })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): GameEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      title: doc.title as string,
      date: doc.date as string,
      description: (doc.description as string) ?? '',
      imageUrl: (doc.imageUrl as string | null) ?? null,
      imageFocalX: (doc.imageFocalX as number | null) ?? null,
      imageFocalY: (doc.imageFocalY as number | null) ?? null,
      imageZoom: (doc.imageZoom as number | null) ?? null,
      imageFit: (doc.imageFit as 'cover' | 'contain' | null) ?? null,
      targetGroup: (doc.targetGroup as string | null) ?? null,
      groupOnly: (doc.groupOnly as boolean) ?? false,
      confirmable: (doc.confirmable as boolean) ?? false,
      confirmedBy:
        (doc.confirmedBy as Array<{ userId: string; userName: string }>) ?? [],
      // Legacy komentáře z doby před reakcemi nemají pole `reactions` → default
      // `{}`, jinak FE (ReactionsRow) spadne na `reactions['👍']` a shodí stránku.
      comments: ((doc.comments as GameEvent['comments']) ?? []).map((c) => ({
        ...c,
        reactions: c.reactions ?? {},
      })),
      reminderSent: (doc.reminderSent as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
