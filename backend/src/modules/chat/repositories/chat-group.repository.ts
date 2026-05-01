import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { ChatGroupSchemaClass } from '../schemas/chat-group.schema';
import type { ChatGroup } from '../interfaces/chat-group.interface';
import type { IChatGroupRepository } from '../interfaces/chat-group-repository.interface';

@Injectable()
export class MongoChatGroupRepository
  extends BaseMongoRepository<ChatGroup>
  implements IChatGroupRepository
{
  constructor(@InjectModel(ChatGroupSchemaClass.name) model: Model<ChatGroupSchemaClass>) {
    super(model as never);
  }

  async findByWorldId(worldId: string): Promise<ChatGroup[]> {
    const docs = await this.model.find({ worldId }).sort({ order: 1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async countByWorldId(worldId: string): Promise<number> {
    return this.model.countDocuments({ worldId }).exec();
  }

  protected toEntity(doc: Record<string, unknown>): ChatGroup {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: doc.name as string,
      order: (doc.order as number) ?? 0,
      createdAt: doc.createdAt as Date,
    };
  }
}
