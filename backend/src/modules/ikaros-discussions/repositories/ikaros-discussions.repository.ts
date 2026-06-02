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
      joinRequestIds: (doc.joinRequestIds as string[]) ?? [],
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

  /**
   * D-NEW-discussion-pagination — paged list (sort dle lastActivity desc).
   * `offset` + `limit`; vrací `{ items, total }`.
   */
  async findAllPaginated(
    offset: number,
    limit: number,
  ): Promise<{ items: IkarosDiscussion[]; total: number }> {
    const [docs, total] = await Promise.all([
      this.model
        .find()
        .sort({ lastActivityUtc: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.model.countDocuments().exec(),
    ]);
    return {
      items: docs.map((d) =>
        this.toEntity(d as unknown as Record<string, unknown>),
      ),
      total,
    };
  }

  async findPending(): Promise<IkarosDiscussion[]> {
    const docs = await this.model.find({ isApproved: false }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPendingPaginated(
    skip: number,
    limit: number,
  ): Promise<IkarosDiscussion[]> {
    const docs = await this.model
      .find({ isApproved: false })
      .sort({ createdAtUtc: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countPending(): Promise<number> {
    return this.model.countDocuments({ isApproved: false }).exec();
  }

  async countAll(): Promise<number> {
    return this.model.countDocuments().exec();
  }

  /** 3.4 — diskuze, kde je uživatel manažer A zároveň mají čekající join-request. */
  async findManagedWithJoinRequests(
    userId: string,
  ): Promise<IkarosDiscussion[]> {
    const docs = await this.model
      .find({ managerIds: userId, 'joinRequestIds.0': { $exists: true } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async adjustLikeCount(
    id: string,
    delta: number,
  ): Promise<IkarosDiscussion | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, { $inc: { likeCount: delta } }, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  /**
   * Atomická změna `postCount` přes `$inc` (žádné race read-then-write).
   * `touchActivity` zároveň posune `lastActivityUtc`. Záporný `postCount`
   * (teoreticky při souběhu) se sklopí zpět na 0.
   */
  async adjustPostCount(
    id: string,
    delta: number,
    touchActivity = false,
  ): Promise<void> {
    const update: Record<string, unknown> = { $inc: { postCount: delta } };
    if (touchActivity) update.$set = { lastActivityUtc: new Date() };
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .lean()
      .exec();
    if (doc && ((doc as { postCount?: number }).postCount ?? 0) < 0) {
      await this.model.findByIdAndUpdate(id, { postCount: 0 }).exec();
    }
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
