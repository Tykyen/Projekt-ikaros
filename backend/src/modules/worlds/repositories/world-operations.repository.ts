import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WorldOperationSchemaClass,
  WorldOperationDocument,
} from '../schemas/world-operation.schema';
import { WorldSchemaClass } from '../schemas/world.schema';
import type { IWorldOperationsRepository } from '../interfaces/world-operations-repository.interface';
import type { WorldOperationRecord } from '../interfaces/world-operation.interface';

@Injectable()
export class MongoWorldOperationsRepository implements IWorldOperationsRepository {
  constructor(
    @InjectModel(WorldOperationSchemaClass.name)
    private readonly opModel: Model<WorldOperationDocument>,
    @InjectModel(WorldSchemaClass.name)
    private readonly worldModel: Model<WorldSchemaClass>,
  ) {}

  async allocateSeqNumber(worldId: string): Promise<number> {
    if (!Types.ObjectId.isValid(worldId)) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    }
    const result = await this.worldModel
      .findByIdAndUpdate(
        worldId,
        { $inc: { lastSeqNumber: 1 } },
        { new: true, projection: { lastSeqNumber: 1 } },
      )
      .lean()
      .exec();
    if (!result) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'Svět nenalezen',
      });
    }
    return (result as { lastSeqNumber: number }).lastSeqNumber;
  }

  async appendOperation(
    record: Omit<WorldOperationRecord, 'id'>,
  ): Promise<WorldOperationRecord> {
    const created = await this.opModel.create(record);
    return this.toEntity(
      created.toObject() as unknown as Record<string, unknown>,
    );
  }

  async findSince(
    worldId: string,
    since: number,
    limit: number,
  ): Promise<WorldOperationRecord[]> {
    const docs = await this.opModel
      .find({ worldId, seqNumber: { $gt: since } })
      .sort({ seqNumber: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findLastByUser(
    worldId: string,
    userId: string,
    limit: number,
  ): Promise<WorldOperationRecord[]> {
    const docs = await this.opModel
      .find({ worldId, byUserId: userId })
      .sort({ seqNumber: -1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  private toEntity(doc: Record<string, unknown>): WorldOperationRecord {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      seqNumber: doc.seqNumber as number,
      op: doc.op as Record<string, unknown>,
      inverse: (doc.inverse as Record<string, unknown> | null) ?? null,
      byUserId: doc.byUserId as string,
      byUserRole: doc.byUserRole as number,
      appliedAt: doc.appliedAt as Date,
      cascadeMapOpIds: (doc.cascadeMapOpIds as string[]) ?? [],
    };
  }
}
