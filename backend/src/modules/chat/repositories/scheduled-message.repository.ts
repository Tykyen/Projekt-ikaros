import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ScheduledMessageSchemaClass } from '../schemas/scheduled-message.schema';
import type { ScheduledMessage } from '../interfaces/scheduled-message.interface';
import type { IScheduledMessageRepository } from '../interfaces/scheduled-message-repository.interface';
import type { UserRole } from '../../users/interfaces/user.interface';

@Injectable()
export class MongoScheduledMessageRepository
  extends BaseMongoRepository<ScheduledMessage>
  implements IScheduledMessageRepository
{
  constructor(
    @InjectModel(ScheduledMessageSchemaClass.name)
    model: Model<ScheduledMessageSchemaClass>,
  ) {
    super(model as never);
  }

  async create(data: Partial<ScheduledMessage>): Promise<ScheduledMessage> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  /** Po tolika ms se `sending` bere jako stale (pád procesu mid-send) a re-claimne se. */
  private static readonly SENDING_STALE_MS = 10 * 60 * 1000;

  async claimDue(now: Date, limit = 50): Promise<ScheduledMessage[]> {
    const staleCutoff = new Date(
      now.getTime() - MongoScheduledMessageRepository.SENDING_STALE_MS,
    );
    const claimed: ScheduledMessage[] = [];
    // Claim po jedné přes findOneAndUpdate — flip pending→sending je atomický,
    // souběžná instance dostane další dokument (filtr už nesedí). `new:true`
    // vrací claimnutý stav; updatedAt bump chrání před okamžitým re-claimem.
    for (let i = 0; i < limit; i++) {
      const doc = await this.model
        .findOneAndUpdate(
          {
            $or: [
              { status: 'pending', sendAt: { $lte: now } },
              { status: 'sending', updatedAt: { $lte: staleCutoff } },
            ],
          },
          { $set: { status: 'sending' } },
          { new: true, sort: { sendAt: 1 } },
        )
        .lean()
        .exec();
      if (!doc) break;
      claimed.push(this.toEntity(doc as unknown as Record<string, unknown>));
    }
    return claimed;
  }

  async findPendingByOwner(
    ownerId: string,
    worldId: string,
  ): Promise<ScheduledMessage[]> {
    const docs = await this.model
      .find({ ownerId, worldId, status: 'pending' })
      .sort({ sendAt: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<ScheduledMessage | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async setStatus(
    id: string,
    status: ScheduledMessage['status'],
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await this.model.findByIdAndUpdate(id, { $set: { status } }).exec();
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): ScheduledMessage {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      channelId: doc.channelId as string,
      ownerId: doc.ownerId as string,
      ownerName: doc.ownerName as string,
      ownerRole: doc.ownerRole as UserRole,
      content: doc.content as string | undefined,
      attachments: (doc.attachments as unknown[]) ?? [],
      sendAt: doc.sendAt as Date,
      status: (doc.status as ScheduledMessage['status']) ?? 'pending',
      createdAt: doc.createdAt as Date | undefined,
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
