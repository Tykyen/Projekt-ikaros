import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MapOperationSchemaClass,
  MapOperationDocument,
} from '../schemas/map-operation.schema';
import { MapSceneSchemaClass } from '../schemas/map-scene.schema';
import type { IMapOperationsRepository } from '../interfaces/map-operations-repository.interface';
import type { MapOperationRecord } from '../interfaces/map-operation.interface';

@Injectable()
export class MongoMapOperationsRepository implements IMapOperationsRepository {
  constructor(
    @InjectModel(MapOperationSchemaClass.name)
    private readonly opModel: Model<MapOperationDocument>,
    @InjectModel(MapSceneSchemaClass.name)
    private readonly sceneModel: Model<MapSceneSchemaClass>,
  ) {}

  async allocateSeqNumber(sceneId: string): Promise<number> {
    if (!Types.ObjectId.isValid(sceneId)) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    }
    // Atomic `$inc` — paralelní volání dostane unique values.
    // `lean: true` ne — potřebujeme čerstvou hodnotu po inc; `new: true` postačuje.
    const result = await this.sceneModel
      .findByIdAndUpdate(
        sceneId,
        { $inc: { lastSeqNumber: 1 } },
        { new: true, projection: { lastSeqNumber: 1 } },
      )
      .lean()
      .exec();
    if (!result) {
      throw new NotFoundException({
        code: 'MAP_SCENE_NOT_FOUND',
        message: 'Scéna nenalezena',
      });
    }
    return (result as { lastSeqNumber: number }).lastSeqNumber;
  }

  async appendOperation(
    record: Omit<MapOperationRecord, 'id'>,
  ): Promise<MapOperationRecord> {
    const created = await this.opModel.create(record);
    return this.toEntity(
      created.toObject() as unknown as Record<string, unknown>,
    );
  }

  async findSince(
    sceneId: string,
    since: number,
    limit: number,
  ): Promise<MapOperationRecord[]> {
    const docs = await this.opModel
      .find({ sceneId, seqNumber: { $gt: since } })
      .sort({ seqNumber: 1 })
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findLastUndoableByUser(
    sceneId: string,
    userId: string,
  ): Promise<MapOperationRecord | null> {
    // D-DROBNE-UNDO — filtr přímo v query (ne bounded lookback): poslední op
    // s non-null inverse, která ještě nebyla vrácena / není undo záznamem.
    const doc = await this.opModel
      .findOne({
        sceneId,
        byUserId: userId,
        inverse: { $ne: null },
        undone: { $ne: true },
      })
      .sort({ seqNumber: -1 })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async markUndone(recordId: string): Promise<void> {
    if (!Types.ObjectId.isValid(recordId)) return;
    await this.opModel
      .updateOne({ _id: recordId }, { $set: { undone: true } })
      .exec();
  }

  private toEntity(doc: Record<string, unknown>): MapOperationRecord {
    return {
      id: String(doc._id),
      sceneId: doc.sceneId as string,
      worldId: doc.worldId as string,
      seqNumber: doc.seqNumber as number,
      op: doc.op as Record<string, unknown>,
      inverse: (doc.inverse as Record<string, unknown> | null) ?? null,
      byUserId: doc.byUserId as string,
      byUserRole: doc.byUserRole as number,
      appliedAt: doc.appliedAt as Date,
      undone: (doc.undone as boolean | undefined) ?? false,
    };
  }
}
