import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { MapTemplateSchemaClass } from '../schemas/map-template.schema';
import type { MapTemplate } from '../interfaces/map-template.interface';
import type { IMapTemplatesRepository } from '../interfaces/map-templates-repository.interface';
import type {
  HexConfig,
  MapToken,
  MapSceneNpc,
  MapEffect,
  HexCoord,
} from '../interfaces/map-scene.interface';

@Injectable()
export class MongoMapTemplatesRepository
  extends BaseMongoRepository<MapTemplate>
  implements IMapTemplatesRepository
{
  constructor(
    @InjectModel(MapTemplateSchemaClass.name)
    model: Model<MapTemplateSchemaClass>,
  ) {
    super(model as never);
  }

  async findAll(): Promise<MapTemplate[]> {
    const docs = await this.model.find().sort({ updatedAt: -1 }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  // 10.2c-edit-2 — per-PJ filter; sort desc dle updatedAt (index utilizován).
  async findByOwner(ownerId: string): Promise<MapTemplate[]> {
    const docs = await this.model
      .find({ ownerId })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<MapTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Partial<MapTemplate>): Promise<MapTemplate> {
    // 10.2c-edit-2 — timestamps: true ve schemě auto-set createdAt/updatedAt;
    // odstraněn manuální lastModified.
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async replace(
    id: string,
    data: Partial<MapTemplate>,
  ): Promise<MapTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true, overwrite: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  // ── 22.5 — publikace/katalog/kurátorský tok ──

  async patch(
    id: string,
    fields: Partial<MapTemplate>,
  ): Promise<MapTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: fields }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findCatalog(opts?: {
    systemId?: string;
    skip?: number;
    limit?: number;
  }): Promise<MapTemplate[]> {
    const query: Record<string, unknown> = {
      published: true,
      reviewStatus: 'approved',
      moderationHidden: { $ne: true },
    };
    if (opts?.systemId) query['config.systemId'] = opts.systemId;
    const docs = await this.model
      .find(query)
      .sort({ publishedAt: -1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 60)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countCatalog(opts?: { systemId?: string }): Promise<number> {
    const query: Record<string, unknown> = {
      published: true,
      reviewStatus: 'approved',
      moderationHidden: { $ne: true },
    };
    if (opts?.systemId) query['config.systemId'] = opts.systemId;
    return this.model.countDocuments(query).exec();
  }

  async findPendingReview(opts?: {
    skip?: number;
    limit?: number;
  }): Promise<MapTemplate[]> {
    const docs = await this.model
      .find({
        published: true,
        reviewStatus: 'pending',
        moderationHidden: { $ne: true },
      })
      .sort({ publishedAt: 1 })
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 20)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countPendingReview(): Promise<number> {
    return this.model
      .countDocuments({
        published: true,
        reviewStatus: 'pending',
        moderationHidden: { $ne: true },
      })
      .exec();
  }

  protected toEntity(doc: Record<string, unknown>): MapTemplate {
    return {
      id: String(doc._id),
      // 10.2c-edit-2 — required field; pokud chybí v DB (pre-migrace dokument),
      // toEntity ho vrátí jako prázdný string. To **NEMÁ** nastat — backfill
      // skript zajišťuje migraci. Defensivní default jen pro corner case.
      ownerId: (doc.ownerId as string) ?? '',
      name: (doc.name as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? '',
      // D-19.2 — velikost blobu; staré dokumenty undefined.
      imageBytes: doc.imageBytes as number | undefined,
      config: (doc.config as HexConfig) ?? {
        size: 40,
        originX: 0,
        originY: 0,
        showGrid: true,
      },
      npcTemplates: (doc.npcTemplates as MapSceneNpc[]) ?? [],
      tokens: (doc.tokens as MapToken[]) ?? [],
      effects: (doc.effects as MapEffect[]) ?? [],
      fogEnabled: (doc.fogEnabled as boolean) ?? false,
      revealedHexes: (doc.revealedHexes as HexCoord[]) ?? [],
      activeSoundIds: (doc.activeSoundIds as string[]) ?? [],
      // 22.5 — publikační pole; staré šablony je nemají (default nepublikováno).
      published: (doc.published as boolean) ?? false,
      publishedAt: (doc.publishedAt as Date | null) ?? null,
      authorId: (doc.authorId as string | null) ?? null,
      publicAuthorName: (doc.publicAuthorName as string | null) ?? null,
      reviewStatus: (doc.reviewStatus as MapTemplate['reviewStatus']) ?? null,
      moderationHidden: (doc.moderationHidden as boolean) ?? false,
      moderationHiddenReason:
        (doc.moderationHiddenReason as string | null) ?? null,
      licenseId: (doc.licenseId as string | null) ?? null,
      clonedFromTemplateId: (doc.clonedFromTemplateId as string | null) ?? null,
      createdAt: doc.createdAt as Date | undefined,
      updatedAt: doc.updatedAt as Date | undefined,
    };
  }
}
