import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { SoundSchemaClass } from '../schemas/sound.schema';
import type {
  Sound,
  SoundMediaType,
  SoundPrimaryFunction,
  SoundEnvironment,
  SoundEmotionalTone,
  SoundOnsetProfile,
  SoundOutroProfile,
  SoundFactionStyle,
  SoundTechLevel,
  SoundMagicLevel,
  SoundCombatEnergy,
  SoundStatus,
} from '../interfaces/sound.interface';
import type { ISoundsRepository } from '../interfaces/sounds-repository.interface';

@Injectable()
export class MongoSoundsRepository
  extends BaseMongoRepository<Sound>
  implements ISoundsRepository
{
  constructor(
    @InjectModel(SoundSchemaClass.name) model: Model<SoundSchemaClass>,
  ) {
    super(model as never);
  }

  async findByWorld(worldId: string): Promise<Sound[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findGlobal(): Promise<Sound[]> {
    const docs = await this.model
      .find({ worldId: null, status: 'active' })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findGlobalPending(): Promise<Sound[]> {
    const docs = await this.model
      .find({ worldId: null, status: 'pending' })
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findGlobalByUrlOrName(
    url: string,
    name: string,
  ): Promise<Sound | null> {
    const doc = await this.model
      .findOne({
        worldId: null,
        $or: [
          { youtubeUrl: url },
          {
            name: {
              $regex: new RegExp(
                `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                'i',
              ),
            },
          },
        ],
      })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Partial<Sound>): Promise<Sound> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async updateById(id: string, data: Partial<Sound>): Promise<Sound | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async updateByIdAndWorld(
    id: string,
    worldId: string,
    data: Partial<Sound>,
  ): Promise<Sound | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOneAndUpdate({ _id: id, worldId }, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteById(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async deleteByIdAndWorld(id: string, worldId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model
      .findOneAndDelete({ _id: id, worldId })
      .exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): Sound {
    return {
      id: String(doc._id),
      worldId: (doc.worldId as string | null) ?? null,
      name: (doc.name as string) ?? '',
      youtubeUrl: (doc.youtubeUrl as string) ?? '',
      mediaType: (doc.mediaType as SoundMediaType) ?? 'music',
      primaryFunction: (doc.primaryFunction as SoundPrimaryFunction) ?? 'safe',
      environment: (doc.environment as SoundEnvironment) ?? 'neutral',
      emotionalTone: (doc.emotionalTone as SoundEmotionalTone) ?? 'calm',
      intensity: (doc.intensity as number) ?? 1,
      duration: (doc.duration as number) ?? 0,
      loop: (doc.loop as boolean) ?? true,
      onsetProfile: (doc.onsetProfile as SoundOnsetProfile) ?? 'soft',
      outroProfile: (doc.outroProfile as SoundOutroProfile) ?? 'fade',
      factionStyle: (doc.factionStyle as SoundFactionStyle) ?? 'civilian',
      techLevel: (doc.techLevel as SoundTechLevel) ?? 'modern',
      magicLevel: (doc.magicLevel as SoundMagicLevel) ?? 'none',
      combatEnergy: (doc.combatEnergy as SoundCombatEnergy) ?? 'none',
      tags: (doc.tags as string[]) ?? [],
      notes: (doc.notes as string) ?? '',
      status: (doc.status as SoundStatus) ?? 'active',
      proposedBy: (doc.proposedBy as string | null) ?? null,
      proposedByWorldId: (doc.proposedByWorldId as string | null) ?? null,
      rejectReason: (doc.rejectReason as string | null) ?? null,
      createdBy: (doc.createdBy as string) ?? '',
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
