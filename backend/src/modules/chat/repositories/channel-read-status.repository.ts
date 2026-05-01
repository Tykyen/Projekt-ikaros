import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChannelReadStatusSchemaClass } from '../schemas/channel-read-status.schema';
import type { ChannelReadStatus } from '../interfaces/channel-read-status.interface';
import type { IChannelReadStatusRepository } from '../interfaces/channel-read-status-repository.interface';

@Injectable()
export class MongoChannelReadStatusRepository implements IChannelReadStatusRepository {
  constructor(
    @InjectModel(ChannelReadStatusSchemaClass.name)
    private readonly model: Model<ChannelReadStatusSchemaClass>,
  ) {}

  async findByUserAndChannel(userId: string, channelId: string): Promise<ChannelReadStatus | null> {
    const doc = await this.model.findOne({ userId, channelId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByUserAndChannels(userId: string, channelIds: string[]): Promise<ChannelReadStatus[]> {
    const docs = await this.model.find({ userId, channelId: { $in: channelIds } }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async upsert(userId: string, channelId: string, lastReadMessageId: string): Promise<ChannelReadStatus> {
    const doc = await this.model
      .findOneAndUpdate(
        { userId, channelId },
        { $set: { lastReadMessageId, lastReadAt: new Date() } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): ChannelReadStatus {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      channelId: doc.channelId as string,
      lastReadMessageId: doc.lastReadMessageId as string | null,
      lastReadAt: doc.lastReadAt as Date,
    };
  }
}
