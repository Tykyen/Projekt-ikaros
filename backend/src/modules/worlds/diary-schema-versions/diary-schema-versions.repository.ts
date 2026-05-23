import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiarySchemaVersionSchemaClass } from './diary-schema-versions.schema';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions-repository.interface';
import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-version.interface';
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

@Injectable()
export class MongoDiarySchemaVersionsRepository implements IDiarySchemaVersionsRepository {
  constructor(
    @InjectModel(DiarySchemaVersionSchemaClass.name)
    private readonly model: Model<DiarySchemaVersionSchemaClass>,
  ) {}

  async findMetaByWorldId(worldId: string): Promise<DiarySchemaVersionMeta[]> {
    const docs = await this.model
      .find({ worldId })
      .sort({ version: -1 })
      .select({ version: 1, system: 1, archivedAt: 1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      version: d.version,
      system: d.system,
      archivedAt: d.archivedAt,
    }));
  }

  async findByWorldIdAndVersion(
    worldId: string,
    version: number,
  ): Promise<DiarySchemaVersion | null> {
    const doc = await this.model.findOne({ worldId, version }).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findLastVersion(worldId: string): Promise<number> {
    const doc = await this.model
      .findOne({ worldId })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean()
      .exec();
    return (doc?.version as number) ?? 0;
  }

  async findActive(worldId: string): Promise<DiarySchemaVersion | null> {
    const doc = await this.model
      .findOne({ worldId, archivedAt: null })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async create(
    data: Omit<DiarySchemaVersion, 'id'>,
  ): Promise<DiarySchemaVersion> {
    const doc = await this.model.create(
      data as unknown as DiarySchemaVersionSchemaClass,
    );
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async archive(worldId: string, version: number): Promise<void> {
    await this.model
      .updateOne({ worldId, version }, { $set: { archivedAt: new Date() } })
      .exec();
  }

  private toEntity(doc: Record<string, unknown>): DiarySchemaVersion {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      version: doc.version as number,
      system: doc.system as string,
      schema: (doc.schema as SchemaBlock[]) ?? [],
      archivedAt: (doc.archivedAt as Date | null) ?? null,
    };
  }
}
