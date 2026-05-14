import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosDiscussionsRepository } from '../interfaces/ikaros-discussions-repository.interface';
import type { IkarosDiscussion } from '../interfaces/ikaros-discussion.interface';
import { IkarosDiscussionSchemaClass } from '../schemas/ikaros-discussion.schema';

@Injectable()
export class MongoIkarosDiscussionsRepository implements IIkarosDiscussionsRepository {
  constructor(
    @InjectModel(IkarosDiscussionSchemaClass.name)
    private readonly model: Model<IkarosDiscussionSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosDiscussion {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      title: doc.title as string,
      description: (doc.description as string) ?? '',
      bulletin: (doc.bulletin as string) ?? '',
      creatorId: doc.creatorId as string,
      creatorName: doc.creatorName as string,
      isApproved: (doc.isApproved as boolean) ?? false,
      isOpen: (doc.isOpen as boolean) ?? true,
      managerIds: (doc.managerIds as string[]) ?? [],
      invitedUserIds: (doc.invitedUserIds as string[]) ?? [],
      postCount: (doc.postCount as number) ?? 0,
      likeCount: (doc.likeCount as number) ?? 0,
      createdAtUtc: doc.createdAtUtc as Date,
      lastActivityUtc: doc.lastActivityUtc as Date,
    };
  }

  async findAll(): Promise<IkarosDiscussion[]> {
    const docs = await this.model.find().lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPending(): Promise<IkarosDiscussion[]> {
    const docs = await this.model.find({ isApproved: false }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByIds(ids: string[]): Promise<IkarosDiscussion[]> {
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<IkarosDiscussion | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Omit<IkarosDiscussion, 'id'>): Promise<IkarosDiscussion> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<IkarosDiscussion>,
  ): Promise<IkarosDiscussion | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean().exec();
    return result !== null;
  }
}
