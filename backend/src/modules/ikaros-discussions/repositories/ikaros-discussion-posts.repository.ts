import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosDiscussionPostsRepository } from '../interfaces/ikaros-discussion-posts-repository.interface';
import type { IkarosDiscussionPost } from '../interfaces/ikaros-discussion.interface';
import { IkarosDiscussionPostSchemaClass } from '../schemas/ikaros-discussion-post.schema';

@Injectable()
export class MongoIkarosDiscussionPostsRepository implements IIkarosDiscussionPostsRepository {
  constructor(
    @InjectModel(IkarosDiscussionPostSchemaClass.name)
    private readonly model: Model<IkarosDiscussionPostSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosDiscussionPost {
    return {
      id: String((doc._id as { toString(): string }).toString()),
      discussionId: doc.discussionId as string,
      authorId: doc.authorId as string,
      authorName: doc.authorName as string,
      content: doc.content as string,
      createdAtUtc: doc.createdAtUtc as Date,
      moderationHidden: (doc.moderationHidden as boolean) ?? false,
      moderationHiddenReason: doc.moderationHiddenReason as string | undefined,
    };
  }

  /**
   * B4d — `includeModerationHidden=false` (default) přidá filtr, který skryté
   * příspěvky vynechá z veřejného čtení. Reviewer set volá s `true`.
   */
  async findByDiscussion(
    discussionId: string,
    skip: number,
    limit: number,
    includeModerationHidden = false,
  ): Promise<IkarosDiscussionPost[]> {
    const docs = await this.model
      .find({
        discussionId,
        ...(includeModerationHidden ? {} : { moderationHidden: { $ne: true } }),
      })
      .sort({ createdAtUtc: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<IkarosDiscussionPost | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    data: Omit<IkarosDiscussionPost, 'id'>,
  ): Promise<IkarosDiscussionPost> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean().exec();
    return result !== null;
  }

  async deleteByDiscussion(discussionId: string): Promise<void> {
    await this.model.deleteMany({ discussionId });
  }

  /**
   * B4d — moderační skrytí / odkrytí příspěvku (M2/M3 + revert). Vrací false,
   * když příspěvek neexistuje (listener to zaloguje), nikdy nehází.
   */
  async setModerationHidden(
    id: string,
    hidden: boolean,
    reason?: string,
  ): Promise<boolean> {
    const res = await this.model
      .findByIdAndUpdate(id, {
        moderationHidden: hidden,
        moderationHiddenReason: hidden ? reason : undefined,
      })
      .lean()
      .exec();
    return res !== null;
  }
}
