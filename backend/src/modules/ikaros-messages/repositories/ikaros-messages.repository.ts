import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { IkarosMessageSchemaClass } from '../schemas/ikaros-message.schema';
import { IkarosMessage } from '../interfaces/ikaros-message.interface';
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
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findInbox(
    recipientId: string,
    opts: { limit: number; before?: string; systemOnly?: boolean },
  ): Promise<IkarosMessage[]> {
    const filter: Record<string, unknown> = {
      recipientId,
      deletedByRecipient: false,
    };
    // 13.2b — záložka „Události" = jen systémová oznámení.
    if (opts.systemOnly) filter.senderId = 'system';
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter['_id'] = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findSent(
    senderId: string,
    opts: { limit: number; before?: string },
  ): Promise<IkarosMessage[]> {
    const filter: Record<string, unknown> = {
      senderId,
      deletedBySender: false,
    };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter['_id'] = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findConversation(conversationId: string): Promise<IkarosMessage[]> {
    if (!conversationId) return [];
    const docs = await this.model
      .find({ conversationId })
      .sort({ sentAtUtc: 1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countUnreadMessages(
    recipientId: string,
    systemOnly = false,
  ): Promise<number> {
    const filter: Record<string, unknown> = {
      recipientId,
      isRead: false,
      deletedByRecipient: false,
    };
    if (systemOnly) filter.senderId = 'system';
    return this.model.countDocuments(filter).exec();
  }

  async save(msg: Partial<IkarosMessage>): Promise<IkarosMessage> {
    // N-34 — volitelně předané `id` (kořen vlákna) namapuj na `_id`, aby šel
    // conversationId nastavit už při insertu (žádný druhý write, žádné okno).
    const { id, ...rest } = msg;
    const created = new this.model(id ? { ...rest, _id: id } : rest);
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async anonymizeByUser(userId: string): Promise<void> {
    // GDPR (plný audit 2026-07-11) — hard-delete účtu: anonymizuj jméno
    // odesílatele i příjemce v soukromých zprávách (DM dřív bez erasure
    // handleru → sender/recipientName identifikovatelné napořád). Body/subject
    // NEnulujeme (kopie druhé strany; plná content-erasure = právní rozhodnutí).
    await this.model
      .updateMany(
        { senderId: userId },
        { $set: { senderName: 'Smazaný uživatel' } },
      )
      .exec();
    await this.model
      .updateMany(
        { recipientId: userId },
        { $set: { recipientName: 'Smazaný uživatel' } },
      )
      .exec();
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
      conversationId: (doc.conversationId as string) ?? '',
      replyToId: doc.replyToId as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
