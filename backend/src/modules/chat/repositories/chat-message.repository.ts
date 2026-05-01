import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatMessageSchemaClass } from '../schemas/chat-message.schema';
import type { ChatMessage } from '../interfaces/chat-message.interface';
import type { IChatMessageRepository } from '../interfaces/chat-message-repository.interface';

@Injectable()
export class MongoChatMessageRepository
  extends BaseMongoRepository<ChatMessage>
  implements IChatMessageRepository
{
  constructor(@InjectModel(ChatMessageSchemaClass.name) model: Model<ChatMessageSchemaClass>) {
    super(model as never);
  }

  async findByChannelId(
    channelId: string,
    opts: { before?: string; limit: number },
  ): Promise<ChatMessage[]> {
    const filter: Record<string, unknown> = { channelId };
    if (opts.before && Types.ObjectId.isValid(opts.before)) {
      filter._id = { $lt: new Types.ObjectId(opts.before) };
    }
    const docs = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit)
      .lean()
      .exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>)).reverse();
  }

  async countAfter(channelId: string, messageId: string): Promise<number> {
    if (!Types.ObjectId.isValid(messageId)) return 0;
    return this.model
      .countDocuments({ channelId, _id: { $gt: new Types.ObjectId(messageId) } })
      .exec();
  }

  async softDeleteByChannelId(channelId: string): Promise<void> {
    await this.model
      .updateMany({ channelId }, { $set: { isDeleted: true, content: null } })
      .exec();
  }

  async softDeleteByWorldId(worldId: string): Promise<void> {
    await this.model
      .updateMany({ worldId }, { $set: { isDeleted: true, content: null } })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): ChatMessage {
    return {
      id: String(doc._id),
      channelId: doc.channelId as string,
      worldId: doc.worldId as string,
      senderId: doc.senderId as string,
      senderName: doc.senderName as string,
      senderAvatarUrl: doc.senderAvatarUrl as string | undefined,
      overrideName: doc.overrideName as string | undefined,
      overrideAvatarUrl: doc.overrideAvatarUrl as string | undefined,
      content: doc.content as string | null,
      isEdited: (doc.isEdited as boolean) ?? false,
      isDeleted: (doc.isDeleted as boolean) ?? false,
      rpDate: doc.rpDate as string | undefined,
      replyToId: doc.replyToId as string | undefined,
      replyToPreview: doc.replyToPreview as string | undefined,
      replyToSenderName: doc.replyToSenderName as string | undefined,
      visibleTo: doc.visibleTo as string[] | undefined,
      reactions: (doc.reactions as Record<string, string[]>) ?? {},
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
