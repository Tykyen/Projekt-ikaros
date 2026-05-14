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
    const docs = await this.model.find().lean().exec();
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
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async replace(
    id: string,
    data: Partial<MapTemplate>,
  ): Promise<MapTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(
        id,
        { ...data, lastModified: new Date() },
        { new: true, overwrite: true },
      )
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

  protected toEntity(doc: Record<string, unknown>): MapTemplate {
    return {
      id: String(doc._id),
      name: (doc.name as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? '',
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
      lastModified: doc.lastModified as Date | undefined,
    };
  }
}
