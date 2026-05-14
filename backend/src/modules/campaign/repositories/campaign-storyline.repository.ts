import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignStorylineSchemaClass } from '../schemas/campaign-storyline.schema';
import type { CampaignStoryline } from '../interfaces/campaign-storyline.interface';
import type { ICampaignStorylineRepository } from '../interfaces/campaign-storyline-repository.interface';

@Injectable()
export class MongoCampaignStorylineRepository
  extends BaseMongoRepository<CampaignStoryline>
  implements ICampaignStorylineRepository
{
  constructor(
    @InjectModel(CampaignStorylineSchemaClass.name)
    model: Model<CampaignStorylineSchemaClass>,
  ) {
    super(model as never);
  }

  async findMany(
    filter: Record<string, unknown>,
    sort: Record<string, unknown> = { updatedAt: -1 },
  ): Promise<CampaignStoryline[]> {
    const docs = await this.model
      .find(filter)
      .sort(sort as never)
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async create(data: Partial<CampaignStoryline>): Promise<CampaignStoryline> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<CampaignStoryline>,
  ): Promise<CampaignStoryline | null> {
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

  protected toEntity(doc: Record<string, unknown>): CampaignStoryline {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      level: (doc.level as CampaignStoryline['level']) ?? 'mid',
      title: doc.title as string,
      status: (doc.status as CampaignStoryline['status']) ?? 'active',
      phase: doc.phase as string | undefined,
      summary: doc.summary as string | undefined,
      whatHappened: doc.whatHappened as string | undefined,
      truth: doc.truth as string | undefined,
      playersBelief: doc.playersBelief as string | undefined,
      gmIntent: doc.gmIntent as string | undefined,
      nextStep: doc.nextStep as string | undefined,
      subjectIds: (doc.subjectIds as string[]) ?? [],
      relationshipIds: (doc.relationshipIds as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
