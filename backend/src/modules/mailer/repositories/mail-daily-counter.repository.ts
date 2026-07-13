import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MailDailyCounterSchemaClass } from '../schemas/mail-daily-counter.schema';
import type { IMailDailyCounterRepository } from '../interfaces/mail-outbox.interface';

@Injectable()
export class MongoMailDailyCounterRepository implements IMailDailyCounterRepository {
  constructor(
    @InjectModel(MailDailyCounterSchemaClass.name)
    private readonly model: Model<MailDailyCounterSchemaClass>,
  ) {}

  async getSent(day: string): Promise<number> {
    const doc = await this.model.findOne({ day }).lean().exec();
    return doc?.sent ?? 0;
  }

  async incrementSent(day: string): Promise<number> {
    try {
      return await this.incOnce(day);
    } catch {
      // E11000 při souběžném upsertu na unique `day` (vzácné — sender běží pod
      // cron lockem; nastane jen při Redis výpadku + 2 replikách) → retry 1×,
      // dokument už existuje a $inc projde.
      return await this.incOnce(day);
    }
  }

  private async incOnce(day: string): Promise<number> {
    const doc = await this.model
      .findOneAndUpdate(
        { day },
        { $inc: { sent: 1 } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return doc?.sent ?? 0;
  }
}
