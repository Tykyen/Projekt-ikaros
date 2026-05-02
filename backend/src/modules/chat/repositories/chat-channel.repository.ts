import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatChannelSchemaClass } from '../schemas/chat-channel.schema';
import type { ChatChannel } from '../interfaces/chat-channel.interface';
import type { IChatChannelRepository } from '../interfaces/chat-channel-repository.interface';
import type { WorldRole } from '../../worlds/interfaces/world-membership.interface';

@Injectable()
export class MongoChatChannelRepository
  extends BaseMongoRepository<ChatChannel>
  implements IChatChannelRepository
{
  constructor(@InjectModel(ChatChannelSchemaClass.name) model: Model<ChatChannelSchemaClass>) {
    super(model as never);
  }

  async findGlobal(): Promise<ChatChannel | null> {
    const doc = await this.model.findOne({ isGlobal: true, isDeleted: false }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async findByGroupId(groupId: string): Promise<ChatChannel[]> {
    const docs = await this.model.find({ groupId, isDeleted: false }).sort({ order: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findByWorldId(worldId: string): Promise<ChatChannel[]> {
    const docs = await this.model.find({ worldId, isDeleted: false }).sort({ order: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async softDeleteByWorldId(worldId: string): Promise<void> {
    await this.model.updateMany({ worldId }, { $set: { isDeleted: true } }).exec();
  }

  protected toEntity(doc: Record<string, unknown>): ChatChannel {
    return {
      id: String(doc._id),
      groupId: (doc.groupId as string | null) ?? null,
      worldId: (doc.worldId as string | null) ?? null,
      name: doc.name as string,
      isGlobal: (doc.isGlobal as boolean) ?? false,
      accessMode: (doc.accessMode as ChatChannel['accessMode']) ?? 'all',
      allowedRoles: (doc.allowedRoles as WorldRole[]) ?? [],
      allowedMemberIds: (doc.allowedMemberIds as string[]) ?? [],
      lastMessageAt: doc.lastMessageAt as Date | undefined,
      order: (doc.order as number) ?? 0,
      isDeleted: (doc.isDeleted as boolean) ?? false,
      createdAt: doc.createdAt as Date,
    };
  }
}
