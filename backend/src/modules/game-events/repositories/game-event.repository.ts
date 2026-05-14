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
    if (filters.fromDate) query.date = { $gte: filters.fromDate };
    const cursor = this.model.find(query as never).sort({ date: 1 });
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

  async deleteOlderThan(before: Date): Promise<number> {
    const result = await this.model
      .deleteMany({ date: { $lt: before.toISOString() } } as never)
      .exec();
    return result.deletedCount ?? 0;
  }

  protected toEntity(doc: Record<string, unknown>): GameEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      title: doc.title as string,
      date: doc.date as string,
      description: (doc.description as string) ?? '',
      imageUrl: (doc.imageUrl as string | null) ?? null,
      targetGroup: (doc.targetGroup as string | null) ?? null,
      groupOnly: (doc.groupOnly as boolean) ?? false,
      confirmable: (doc.confirmable as boolean) ?? false,
      confirmedBy:
        (doc.confirmedBy as Array<{ userId: string; userName: string }>) ?? [],
      comments: (doc.comments as GameEvent['comments']) ?? [],
      reminderSent: (doc.reminderSent as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
