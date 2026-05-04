import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignSubjectSchemaClass } from '../schemas/campaign-subject.schema';
import type { CampaignSubject } from '../interfaces/campaign-subject.interface';
import type { ICampaignSubjectRepository } from '../interfaces/campaign-subject-repository.interface';

@Injectable()
export class MongoCampaignSubjectRepository
  extends BaseMongoRepository<CampaignSubject>
  implements ICampaignSubjectRepository
{
  constructor(@InjectModel(CampaignSubjectSchemaClass.name) model: Model<CampaignSubjectSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { updatedAt: -1 }): Promise<CampaignSubject[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignSubject>): Promise<CampaignSubject> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignSubject>): Promise<CampaignSubject | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model
      .findByIdAndUpdate(id, { $set: data as Record<string, unknown> }, { new: true })
      .lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  protected toEntity(doc: Record<string, unknown>): CampaignSubject {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      type: (doc.type as CampaignSubject['type']) ?? 'NPC',
      name: doc.name as string,
      avatarUrl: doc.avatarUrl as string | undefined,
      tags: (doc.tags as string[]) ?? [],
      status: (doc.status as CampaignSubject['status']) ?? 'active',
      linkedPageSlug: doc.linkedPageSlug as string | undefined,
      linkedCharacterSlug: doc.linkedCharacterSlug as string | undefined,
      notes: doc.notes as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
