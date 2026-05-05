import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldMembershipSchemaClass } from '../schemas/world-membership.schema';
import { WorldMembership } from '../interfaces/world-membership.interface';
import type { IWorldMembershipRepository } from '../interfaces/world-membership-repository.interface';

@Injectable()
export class MongoWorldMembershipRepository
  extends BaseMongoRepository<WorldMembership>
  implements IWorldMembershipRepository
{
  constructor(
    @InjectModel(WorldMembershipSchemaClass.name)
    model: Model<WorldMembershipSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorldId(worldId: string, filters?: { role?: number; group?: string }): Promise<WorldMembership[]> {
    const query: Record<string, unknown> = { worldId };
    if (filters?.role !== undefined) query.role = filters.role;
    if (filters?.group !== undefined) query.group = filters.group;
    const docs = await this.model.find(query).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findByUserId(userId: string): Promise<WorldMembership[]> {
    const docs = await this.model.find({ userId }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async findByUserAndWorld(userId: string, worldId: string): Promise<WorldMembership | null> {
    const doc = await this.model.findOne({ userId, worldId }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async countByWorldId(worldId: string): Promise<number> {
    return this.model.countDocuments({ worldId }).exec();
  }

  protected toEntity(doc: Record<string, unknown>): WorldMembership {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      worldId: doc.worldId as string,
      role: doc.role as number,
      joinedAt: doc.joinedAt as Date,
      avatarUrl: doc.avatarUrl as string | undefined,
      characterPath: doc.characterPath as string | undefined,
      group: doc.group as string | undefined,
      isFree: (doc.isFree as boolean) ?? false,
      akj: (doc.akj as number) ?? 0,
    };
  }
}
