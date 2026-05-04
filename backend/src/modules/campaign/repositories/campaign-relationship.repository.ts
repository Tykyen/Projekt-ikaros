import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignRelationshipSchemaClass } from '../schemas/campaign-relationship.schema';
import type { CampaignRelationship } from '../interfaces/campaign-relationship.interface';
import type { ICampaignRelationshipRepository } from '../interfaces/campaign-relationship-repository.interface';

@Injectable()
export class MongoCampaignRelationshipRepository
  extends BaseMongoRepository<CampaignRelationship>
  implements ICampaignRelationshipRepository
{
  constructor(@InjectModel(CampaignRelationshipSchemaClass.name) model: Model<CampaignRelationshipSchemaClass>) {
    super(model as never);
  }

  async findMany(filter: Record<string, unknown>, sort: Record<string, unknown> = { updatedAt: -1 }): Promise<CampaignRelationship[]> {
    const docs = await this.model.find(filter).sort(sort as never).lean().exec();
    return docs.map((doc) => this.toEntity(doc as unknown as Record<string, unknown>));
  }

  async create(data: Partial<CampaignRelationship>): Promise<CampaignRelationship> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(id: string, data: Partial<CampaignRelationship>): Promise<CampaignRelationship | null> {
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

  protected toEntity(doc: Record<string, unknown>): CampaignRelationship {
    const shared = (doc.shared as Record<string, unknown>) ?? {};
    const sideA = (doc.sideA as Record<string, unknown>) ?? {};
    const sideB = (doc.sideB as Record<string, unknown>) ?? {};
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      subjectAId: doc.subjectAId as string,
      subjectBId: doc.subjectBId as string,
      shared: { whatHappened: shared.whatHappened as string | undefined, behindTheScenes: shared.behindTheScenes as string | undefined },
      sideA: { tone: sideA.tone as string | undefined, behavior: sideA.behavior as string | undefined, gmIntent: sideA.gmIntent as string | undefined, strength: (sideA.strength as number) ?? 5 },
      sideB: { tone: sideB.tone as string | undefined, behavior: sideB.behavior as string | undefined, gmIntent: sideB.gmIntent as string | undefined, strength: (sideB.strength as number) ?? 5 },
      status: (doc.status as CampaignRelationship['status']) ?? 'active',
      priority: (doc.priority as number) ?? 3,
      storylineIds: (doc.storylineIds as string[]) ?? [],
      lastChangeNote: doc.lastChangeNote as string | undefined,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
