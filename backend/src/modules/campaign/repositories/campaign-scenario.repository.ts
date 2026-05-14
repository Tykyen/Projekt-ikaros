import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignScenarioSchemaClass } from '../schemas/campaign-scenario.schema';
import type { CampaignScenario } from '../interfaces/campaign-scenario.interface';
import type { ICampaignScenarioRepository } from '../interfaces/campaign-scenario-repository.interface';

@Injectable()
export class MongoCampaignScenarioRepository
  extends BaseMongoRepository<CampaignScenario>
  implements ICampaignScenarioRepository
{
  constructor(
    @InjectModel(CampaignScenarioSchemaClass.name)
    model: Model<CampaignScenarioSchemaClass>,
  ) {
    super(model as never);
  }

  async findMany(
    filter: Record<string, unknown>,
    sort: Record<string, unknown> = { order: 1 },
  ): Promise<CampaignScenario[]> {
    const docs = await this.model
      .find(filter)
      .sort(sort as never)
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async maxOrder(filter: Record<string, unknown>): Promise<number> {
    const doc = await this.model
      .findOne(filter)
      .sort({ order: -1 })
      .select('order')
      .lean()
      .exec();
    return doc ? (doc.order ?? 0) : 0;
  }

  async create(data: Partial<CampaignScenario>): Promise<CampaignScenario> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<CampaignScenario>,
  ): Promise<CampaignScenario | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data }, { new: true })
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

  protected toEntity(doc: Record<string, unknown>): CampaignScenario {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      title: doc.title as string,
      contentData: doc.contentData as Record<string, unknown> | undefined,
      order: (doc.order as number) ?? 0,
      linkedPageSlug: doc.linkedPageSlug as string | undefined,
      subjectIds: (doc.subjectIds as string[]) ?? [],
      storylineIds: (doc.storylineIds as string[]) ?? [],
      images: (doc.images as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
