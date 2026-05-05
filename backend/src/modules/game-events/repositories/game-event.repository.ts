import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameEventSchemaClass } from '../schemas/game-event.schema';
import type { GameEvent } from '../interfaces/game-event.interface';
import type { IGameEventRepository } from '../interfaces/game-event-repository.interface';

@Injectable()
export class MongoGameEventRepository implements IGameEventRepository {
  constructor(
    @InjectModel(GameEventSchemaClass.name)
    private readonly model: Model<GameEventSchemaClass>,
  ) {}

  async findUpcoming(fromDate: Date, toDate: Date): Promise<GameEvent[]> {
    const from = fromDate.toISOString();
    const to = toDate.toISOString();
    const docs = await this.model
      .find({ date: { $gte: from, $lte: to }, reminderSent: false })
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async markReminderSent(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { $set: { reminderSent: true } }).exec();
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const result = await this.model
      .deleteMany({ date: { $lt: before.toISOString() } })
      .exec();
    return result.deletedCount ?? 0;
  }

  private toEntity(doc: Record<string, unknown>): GameEvent {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      title: doc.title as string,
      date: doc.date as string,
      description: doc.description as string | undefined,
      reminderSent: (doc.reminderSent as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
