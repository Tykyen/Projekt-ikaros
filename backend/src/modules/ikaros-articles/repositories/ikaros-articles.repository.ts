import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosArticlesRepository } from '../interfaces/ikaros-articles-repository.interface';
import type {
  IkarosArticle,
  ArticleStatus,
  ArticleRating,
} from '../interfaces/ikaros-article.interface';
import { IkarosArticleSchemaClass } from '../schemas/ikaros-article.schema';

@Injectable()
export class MongoIkarosArticlesRepository implements IIkarosArticlesRepository {
  constructor(
    @InjectModel(IkarosArticleSchemaClass.name)
    private readonly model: Model<IkarosArticleSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosArticle {
    return {
      id: String(doc._id),
      title: doc.title as string,
      content: doc.content as string,
      category: doc.category as IkarosArticle['category'],
      authorId: doc.authorId as string,
      authorName: doc.authorName as string,
      status: doc.status as ArticleStatus,
      rejectReason: doc.rejectReason as string | undefined,
      ratings: (
        (doc.ratings ?? []) as Array<{
          userId: string;
          stars: number;
          userName?: string;
          text?: string;
          createdAtUtc?: Date;
        }>
      ).map((r) => ({
        userId: r.userId,
        stars: r.stars,
        userName: r.userName ?? '',
        text: r.text ?? '',
        createdAtUtc: r.createdAtUtc ?? new Date(0),
      })),
      averageRating: (doc.averageRating as number) ?? 0,
      createdAtUtc: doc.createdAtUtc as Date,
      updatedAtUtc: doc.updatedAtUtc as Date,
      publishedAtUtc: doc.publishedAtUtc as Date | undefined,
    };
  }

  async findPublished(): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find({ status: 'Published' })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPublishedAndPending(): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find({ status: { $in: ['Published', 'Pending'] } })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  // D-NEW-search-be — Mongo $text fulltext search nad title + content.
  async searchPublished(search: string): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find(
        { status: 'Published', $text: { $search: search } },
        { score: { $meta: 'textScore' } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async searchPublishedAndPending(search: string): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find(
        {
          status: { $in: ['Published', 'Pending'] },
          $text: { $search: search },
        },
        { score: { $meta: 'textScore' } },
      )
      .sort({ score: { $meta: 'textScore' } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findPending(): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find({ status: 'Pending' })
      .sort({ createdAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByAuthor(authorId: string): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find({ authorId })
      .sort({ updatedAtUtc: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByIds(ids: string[]): Promise<IkarosArticle[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findById(id: string): Promise<IkarosArticle | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(data: Omit<IkarosArticle, 'id'>): Promise<IkarosArticle> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    id: string,
    data: Partial<IkarosArticle>,
  ): Promise<IkarosArticle | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, data, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async upsertRating(
    id: string,
    rating: ArticleRating,
  ): Promise<IkarosArticle | null> {
    await this.model
      .findByIdAndUpdate(id, { $pull: { ratings: { userId: rating.userId } } })
      .exec();
    const withRating = await this.model
      .findByIdAndUpdate(id, { $push: { ratings: rating } }, { new: true })
      .lean()
      .exec();
    if (!withRating) return null;
    const entity = this.toEntity(
      withRating as unknown as Record<string, unknown>,
    );
    const avg =
      entity.ratings.length > 0
        ? Math.round(
            (entity.ratings.reduce((s, r) => s + r.stars, 0) /
              entity.ratings.length) *
              10,
          ) / 10
        : 0;
    const updated = await this.model
      .findByIdAndUpdate(id, { averageRating: avg }, { new: true })
      .lean()
      .exec();
    return updated
      ? this.toEntity(updated as unknown as Record<string, unknown>)
      : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean().exec();
    return result !== null;
  }

  async countByAuthorAndStatus(
    authorId: string,
  ): Promise<Record<ArticleStatus, number>> {
    const agg = await this.model.aggregate<{
      _id: ArticleStatus;
      count: number;
    }>([
      { $match: { authorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const result: Record<ArticleStatus, number> = {
      Draft: 0,
      Pending: 0,
      Published: 0,
      Rejected: 0,
    };
    for (const item of agg) {
      result[item._id] = item.count;
    }
    return result;
  }

  async findPendingPaginated(
    offset: number,
    limit: number,
  ): Promise<IkarosArticle[]> {
    const docs = await this.model
      .find({ status: 'Pending' })
      .sort({ updatedAtUtc: -1 })
      .skip(offset)
      .limit(limit)
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async countByStatus(status: ArticleStatus): Promise<number> {
    return this.model.countDocuments({ status }).exec();
  }

  async countByCategory(category: string): Promise<number> {
    return this.model.countDocuments({ category }).exec();
  }

  async findPublishedIds(): Promise<string[]> {
    const docs = await this.model
      .find({ status: 'Published' }, { _id: 1 })
      .lean()
      .exec();
    return docs.map((d) => String(d._id));
  }
}
