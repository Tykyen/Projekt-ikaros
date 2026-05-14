import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { NpcTemplateSchemaClass } from '../schemas/npc-template.schema';
import type { NpcTemplate } from '../interfaces/npc-template.interface';
import type { INpcTemplatesRepository } from '../interfaces/npc-templates-repository.interface';
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

@Injectable()
export class MongoNpcTemplatesRepository
  extends BaseMongoRepository<NpcTemplate>
  implements INpcTemplatesRepository
{
  constructor(
    @InjectModel(NpcTemplateSchemaClass.name)
    model: Model<NpcTemplateSchemaClass>,
  ) {
    super(model as never);
  }

  async create(data: Partial<NpcTemplate>): Promise<NpcTemplate> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async findByWorld(worldId: string): Promise<NpcTemplate[]> {
    const docs = await this.model.find({ worldId }).lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async findGlobal(): Promise<NpcTemplate[]> {
    const docs = await this.model.find({ worldId: null }).lean().exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async updateByIdAndWorld(
    id: string,
    worldId: string,
    data: Partial<NpcTemplate>,
  ): Promise<NpcTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findOneAndUpdate({ _id: id, worldId }, { $set: data }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async deleteByIdAndWorld(id: string, worldId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model
      .findOneAndDelete({ _id: id, worldId })
      .exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): NpcTemplate {
    return {
      id: String(doc._id),
      worldId: (doc.worldId as string | null) ?? null,
      originTemplateId: doc.originTemplateId as string | undefined,
      name: (doc.name as string) ?? '',
      imageUrl: doc.imageUrl as string | undefined,
      notes: (doc.notes as string) ?? '',
      maxHp: (doc.maxHp as number) ?? 5,
      armor: (doc.armor as number) ?? 0,
      injury: (doc.injury as number) ?? 0,
      movement: (doc.movement as number) ?? 5,
      initiativeBase: (doc.initiativeBase as number) ?? 0,
      abilities: ((doc.abilities as Record<string, unknown>[]) ?? []).map(
        (a) => ({
          label: a.label as string,
          value: a.value as string,
        }),
      ),
      diarySchema: (doc.diarySchema as SchemaBlock[]) ?? [],
      diaryData: (doc.diaryData as Record<string, unknown>) ?? {},
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
