import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EntitySchemaVersionSchemaClass } from './entity-schema-version.schema';
import type { IEntitySchemaVersionsRepository } from './entity-schema-versions-repository.interface';
import type {
  EntitySchemaVersion,
  EntitySchemaVersionMeta,
} from './entity-schema-version.interface';
import type { SchemaSection } from '../maps/schemas/system-entity-schema/system-entity-schema.types';

@Injectable()
export class MongoEntitySchemaVersionsRepository implements IEntitySchemaVersionsRepository {
  constructor(
    @InjectModel(EntitySchemaVersionSchemaClass.name)
    private readonly model: Model<EntitySchemaVersionSchemaClass>,
  ) {}

  async findMetaByWorld(
    worldId: string,
    entityType: string,
  ): Promise<EntitySchemaVersionMeta[]> {
    const docs = await this.model
      .find({ worldId, entityType })
      .sort({ version: -1 })
      .select({ entityType: 1, version: 1, system: 1, archivedAt: 1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      entityType: d.entityType,
      version: d.version,
      system: d.system,
      archivedAt: d.archivedAt,
    }));
  }

  async findByWorldEntityVersion(
    worldId: string,
    entityType: string,
    version: number,
  ): Promise<EntitySchemaVersion | null> {
    const doc = await this.model
      .findOne({ worldId, entityType, version })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findLastVersion(worldId: string, entityType: string): Promise<number> {
    const doc = await this.model
      .findOne({ worldId, entityType })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean()
      .exec();
    return (doc?.version as number) ?? 0;
  }

  async findActive(
    worldId: string,
    entityType: string,
  ): Promise<EntitySchemaVersion | null> {
    const doc = await this.model
      .findOne({ worldId, entityType, archivedAt: null })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(
    data: Omit<EntitySchemaVersion, 'id'>,
  ): Promise<EntitySchemaVersion> {
    const doc = await this.model.create(
      data as unknown as EntitySchemaVersionSchemaClass,
    );
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async archive(
    worldId: string,
    entityType: string,
    version: number,
  ): Promise<void> {
    await this.model
      .updateOne(
        { worldId, entityType, version },
        { $set: { archivedAt: new Date() } },
      )
      .exec();
  }

  private toEntity(doc: Record<string, unknown>): EntitySchemaVersion {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      entityType: doc.entityType as string,
      version: doc.version as number,
      system: doc.system as string,
      sections: (doc.sections as SchemaSection[]) ?? [],
      archivedAt: (doc.archivedAt as Date | null) ?? null,
    };
  }
}
