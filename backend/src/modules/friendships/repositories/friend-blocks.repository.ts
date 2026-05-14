import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FriendBlockSchemaClass } from '../schemas/friend-block.schema';
import type { FriendBlock } from '../interfaces/friendship.interface';
import type { IFriendBlocksRepository } from '../interfaces/friend-blocks-repository.interface';

@Injectable()
export class MongoFriendBlocksRepository implements IFriendBlocksRepository {
  constructor(
    @InjectModel(FriendBlockSchemaClass.name)
    private readonly model: Model<FriendBlockSchemaClass>,
  ) {}

  async create(blockerId: string, blockedId: string): Promise<FriendBlock> {
    const doc = await this.model.create({ blockerId, blockedId });
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findActive(
    blockerId: string,
    blockedId: string,
  ): Promise<FriendBlock | null> {
    const doc = await this.model
      .findOne({ blockerId, blockedId })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async remove(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await this.model.deleteOne({ blockerId, blockedId }).exec();
    return result.deletedCount > 0;
  }

  async listByBlocker(blockerId: string): Promise<FriendBlock[]> {
    const docs = await this.model
      .find({ blockerId })
      .sort({ blockedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async existsBetween(a: string, b: string): Promise<boolean> {
    const doc = await this.model
      .findOne({
        $or: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      })
      .lean()
      .exec();
    return doc !== null;
  }

  private toEntity(doc: Record<string, unknown>): FriendBlock {
    return {
      id: String(doc._id),
      blockerId: doc.blockerId as string,
      blockedId: doc.blockedId as string,
      blockedAt: doc.blockedAt as Date,
    };
  }
}
