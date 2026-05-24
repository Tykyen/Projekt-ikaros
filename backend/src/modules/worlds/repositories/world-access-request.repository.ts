import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { WorldAccessRequestSchemaClass } from '../schemas/world-access-request.schema';
import { WorldAccessRequest } from '../interfaces/world-access-request.interface';
import type { IWorldAccessRequestRepository } from '../interfaces/world-access-request-repository.interface';

@Injectable()
export class MongoWorldAccessRequestRepository
  extends BaseMongoRepository<WorldAccessRequest>
  implements IWorldAccessRequestRepository
{
  constructor(
    @InjectModel(WorldAccessRequestSchemaClass.name)
    model: Model<WorldAccessRequestSchemaClass>,
  ) {
    super(model as never);
  }

  async findByUserAndWorld(
    userId: string,
    worldId: string,
  ): Promise<WorldAccessRequest | null> {
    const doc = await this.model.findOne({ userId, worldId }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findByUserId(userId: string): Promise<WorldAccessRequest[]> {
    const docs = await this.model.find({ userId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countAcrossWorlds(worldIds: string[] | undefined): Promise<number> {
    if (worldIds && worldIds.length === 0) return 0;
    const query: Record<string, unknown> = {};
    if (worldIds !== undefined) query.worldId = { $in: worldIds };
    return this.model.countDocuments(query).exec();
  }

  async findPaginatedAcrossWorlds(
    worldIds: string[] | undefined,
    page: number,
    limit: number,
  ): Promise<{ items: WorldAccessRequest[]; total: number }> {
    if (worldIds && worldIds.length === 0) return { items: [], total: 0 };
    const query: Record<string, unknown> = {};
    if (worldIds !== undefined) query.worldId = { $in: worldIds };
    const total = await this.model.countDocuments(query).exec();
    const docs = await this.model
      .find(query)
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .exec();
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  async create(data: {
    worldId: string;
    userId: string;
  }): Promise<WorldAccessRequest> {
    try {
      const created = new this.model({ ...data, requestedAt: new Date() });
      const saved = await created.save();
      return this.toEntity(
        saved.toObject() as unknown as Record<string, unknown>,
      );
    } catch (e: unknown) {
      // Compound unique index (worldId, userId) → duplicate = 409.
      if (
        typeof e === 'object' &&
        e !== null &&
        (e as { code?: number }).code === 11000
      ) {
        throw new ConflictException('PENDING_ACCESS_REQUEST');
      }
      throw e;
    }
  }

  /**
   * D-061 — override base delete s podporou Mongo session pro `withTransaction`
   * scope. Bez session = standardní delete.
   */
  async delete(id: string, session?: ClientSession): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const query = this.model.findByIdAndDelete(id);
    if (session) query.session(session);
    const result = await query.exec();
    return result !== null;
  }

  async deleteByUserAndWorld(
    userId: string,
    worldId: string,
  ): Promise<boolean> {
    const result = await this.model.deleteOne({ userId, worldId }).exec();
    return result.deletedCount > 0;
  }

  protected toEntity(doc: Record<string, unknown>): WorldAccessRequest {
    return {
      id: String(doc._id),
      userId: doc.userId as string,
      worldId: doc.worldId as string,
      requestedAt: doc.requestedAt as Date,
    };
  }
}
