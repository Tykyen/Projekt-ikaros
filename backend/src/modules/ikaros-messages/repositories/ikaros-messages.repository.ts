import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { IkarosMessageSchemaClass } from '../schemas/ikaros-message.schema';
import { IkarosMessage, IkarosMessageActionType } from '../interfaces/ikaros-message.interface';
import { IIkarosMessagesRepository } from '../interfaces/ikaros-messages-repository.interface';

@Injectable()
export class MongoIkarosMessagesRepository
  extends BaseMongoRepository<IkarosMessage>
  implements IIkarosMessagesRepository
{
  constructor(
    @InjectModel(IkarosMessageSchemaClass.name)
    model: Model<IkarosMessageSchemaClass>,
  ) {
    super(model as never);
  }

  async findById(id: string): Promise<IkarosMessage | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findInbox(recipientId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]> {
    const filter: Record<string, unknown> = { recipientId, deletedByRecipient: false };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter['_id'] = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findSent(senderId: string, opts: { limit: number; before?: string }): Promise<IkarosMessage[]> {
    const filter: Record<string, unknown> = { senderId, deletedBySender: false };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter['_id'] = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async countUnreadMessages(recipientId: string): Promise<number> {
    return this.model.countDocuments({
      recipientId,
      isRead: false,
      deletedByRecipient: false,
      actionType: '',
    }).exec();
  }

  async countPendingRequests(recipientId: string): Promise<number> {
    return this.model.countDocuments({
      recipientId,
      actionResolved: false,
      deletedByRecipient: false,
      actionType: 'world_join_request',
    }).exec();
  }

  async resolveIfPending(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), actionResolved: false },
        { $set: { actionResolved: true, isRead: true } },
      )
      .lean()
      .exec();
    return result !== null;
  }

  async save(msg: Partial<IkarosMessage>): Promise<IkarosMessage> {
    const created = new this.model(msg);
    const saved = await created.save();
    return this.toEntity(saved.toObject() as unknown as Record<string, unknown>);
  }

  protected toEntity(doc: Record<string, unknown>): IkarosMessage {
    return {
      id: String(doc._id),
      senderId: doc.senderId as string,
      senderName: doc.senderName as string,
      recipientId: doc.recipientId as string,
      recipientName: doc.recipientName as string,
      subject: doc.subject as string,
      body: doc.body as string,
      sentAtUtc: doc.sentAtUtc as Date,
      isRead: (doc.isRead as boolean) ?? false,
      deletedBySender: (doc.deletedBySender as boolean) ?? false,
      deletedByRecipient: (doc.deletedByRecipient as boolean) ?? false,
      actionType: (doc.actionType as IkarosMessageActionType) ?? '',
      actionWorldId: doc.actionWorldId as string | undefined,
      actionUserId: doc.actionUserId as string | undefined,
      actionResolved: (doc.actionResolved as boolean) ?? false,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
