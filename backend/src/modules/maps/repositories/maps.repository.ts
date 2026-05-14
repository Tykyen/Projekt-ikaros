import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { MapSceneSchemaClass } from '../schemas/map-scene.schema';
import type {
  MapScene,
  HexConfig,
  MapToken,
  MapSceneNpc,
  MapEffect,
  HexCoord,
} from '../interfaces/map-scene.interface';
import type { IMapsRepository } from '../interfaces/maps-repository.interface';

@Injectable()
export class MongoMapsRepository
  extends BaseMongoRepository<MapScene>
  implements IMapsRepository
{
  constructor(
    @InjectModel(MapSceneSchemaClass.name) model: Model<MapSceneSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<MapScene[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findActiveByWorld(worldId: string): Promise<MapScene | null> {
    const doc = await this.model
      .findOne({ worldId, isActive: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async findById(id: string): Promise<MapScene | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Partial<MapScene>): Promise<MapScene> {
    const doc = await this.model.create({ ...data, lastModified: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async setActive(id: string, worldId: string): Promise<void> {
    await this.model
      .updateMany({ worldId, isActive: true }, { $set: { isActive: false } })
      .exec();
    await this.model.findByIdAndUpdate(id, { $set: { isActive: true } }).exec();
  }

  async replace(id: string, data: Partial<MapScene>): Promise<MapScene | null> {
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

  protected toEntity(doc: Record<string, unknown>): MapScene {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      name: (doc.name as string) ?? '',
      imageUrl: (doc.imageUrl as string) ?? '',
      folder: doc.folder as string | undefined,
      config: (doc.config as HexConfig) ?? {
        size: 40,
        originX: 0,
        originY: 0,
        showGrid: true,
      },
      tokens: ((doc.tokens as Record<string, unknown>[]) ?? []).map((t) =>
        this.toToken(t),
      ),
      npcTemplates: ((doc.npcTemplates as Record<string, unknown>[]) ?? []).map(
        (n) => this.toSceneNpc(n),
      ),
      effects: (doc.effects as MapEffect[]) ?? [],
      fogEnabled: (doc.fogEnabled as boolean) ?? false,
      revealedHexes: (doc.revealedHexes as HexCoord[]) ?? [],
      templateId: doc.templateId as string | undefined,
      isActive: (doc.isActive as boolean) ?? false,
      isHidden: (doc.isHidden as boolean) ?? false,
      isLocked: (doc.isLocked as boolean) ?? false,
      activeSoundIds: (doc.activeSoundIds as string[]) ?? [],
      lastModified: doc.lastModified as Date | undefined,
    };
  }

  private toToken(t: Record<string, unknown>): MapToken {
    return {
      id: (t.id as string) ?? '',
      characterId: (t.characterId as string) ?? '',
      characterSlug: (t.characterSlug as string) ?? '',
      q: (t.q as number) ?? 0,
      r: (t.r as number) ?? 0,
      isNpc: (t.isNpc as boolean) ?? false,
      templateId: t.templateId as string | undefined,
      instanceName: t.instanceName as string | undefined,
      currentHp: (t.currentHp as number) ?? 0,
      maxHp: (t.maxHp as number) ?? 0,
      baseHp: (t.baseHp as number) ?? 0,
      armor: (t.armor as number) ?? 0,
      baseArmor: (t.baseArmor as number) ?? 0,
      injury: (t.injury as number) ?? 0,
      initiative: (t.initiative as number) ?? 0,
      initiativeBase: (t.initiativeBase as number) ?? 0,
      inCombat: (t.inCombat as boolean) ?? false,
      movement: (t.movement as number) ?? 5,
      abilities: (t.abilities as { name: string; description: string }[]) ?? [],
      personalDiarySchema: t.personalDiarySchema as
        | Record<string, unknown>[]
        | undefined,
      customData: (t.customData as Record<string, unknown>) ?? {},
    };
  }

  private toSceneNpc(n: Record<string, unknown>): MapSceneNpc {
    return {
      id: (n.id as string) ?? '',
      originTemplateId: n.originTemplateId as string | undefined,
      name: (n.name as string) ?? '',
      imageUrl: n.imageUrl as string | undefined,
      notes: (n.notes as string) ?? '',
      maxHp: (n.maxHp as number) ?? 5,
      armor: (n.armor as number) ?? 0,
      injury: (n.injury as number) ?? 0,
      movement: (n.movement as number) ?? 5,
      initiativeBase: (n.initiativeBase as number) ?? 0,
      abilities: (n.abilities as { label: string; value: string }[]) ?? [],
      personalDiarySchema: n.personalDiarySchema as
        | Record<string, unknown>[]
        | undefined,
      customData: (n.customData as Record<string, unknown>) ?? {},
    };
  }
}
