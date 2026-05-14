import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BaseMongoRepository } from '../../../database/mongo/base-mongo.repository';
import { CampaignQuickNoteSchemaClass } from '../schemas/campaign-quick-note.schema';
import type { CampaignQuickNote } from '../interfaces/campaign-quick-note.interface';
import type { ICampaignQuickNoteRepository } from '../interfaces/campaign-quick-note-repository.interface';

@Injectable()
export class MongoCampaignQuickNoteRepository
  extends BaseMongoRepository<CampaignQuickNote>
  implements ICampaignQuickNoteRepository
{
  constructor(
    @InjectModel(CampaignQuickNoteSchemaClass.name)
    model: Model<CampaignQuickNoteSchemaClass>,
  ) {
    super(model as never);
  }

  async findMany(
    filter: Record<string, unknown>,
    sort: Record<string, unknown> = { pinned: -1, updatedAt: -1 },
  ): Promise<CampaignQuickNote[]> {
    const docs = await this.model
      .find(filter)
      .sort(sort as never)
      .lean()
      .exec();
    return docs.map((doc) =>
      this.toEntity(doc as unknown as Record<string, unknown>),
    );
  }

  async create(data: Partial<CampaignQuickNote>): Promise<CampaignQuickNote> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<CampaignQuickNote>,
  ): Promise<CampaignQuickNote | null> {
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

  protected toEntity(doc: Record<string, unknown>): CampaignQuickNote {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      ownerId: doc.ownerId as string,
      isShared: (doc.isShared as boolean) ?? false,
      title: doc.title as string,
      body: doc.body as string | undefined,
      status: (doc.status as CampaignQuickNote['status']) ?? 'open',
      pinned: (doc.pinned as boolean) ?? false,
      subjectIds: (doc.subjectIds as string[]) ?? [],
      storylineIds: (doc.storylineIds as string[]) ?? [],
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
