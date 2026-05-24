import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ArticleVersionSchemaClass } from '../schemas/article-version.schema';
import type { ArticleVersion } from '../interfaces/article-version.interface';

@Injectable()
export class ArticleVersionsRepository {
  constructor(
    @InjectModel(ArticleVersionSchemaClass.name)
    private readonly model: Model<ArticleVersionSchemaClass>,
  ) {}

  async findByArticleId(articleId: string): Promise<ArticleVersion[]> {
    const docs = await this.model
      .find({ articleId })
      .sort({ revision: -1 })
      .lean()
      .exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findOne(
    articleId: string,
    revision: number,
  ): Promise<ArticleVersion | null> {
    const doc = await this.model.findOne({ articleId, revision }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    input: Omit<ArticleVersion, 'id' | 'createdAt'>,
  ): Promise<ArticleVersion> {
    const created = new this.model(input);
    const saved = await created.save();
    return this.toEntity(
      saved.toObject() as unknown as Record<string, unknown>,
    );
  }

  async getNextRevision(articleId: string): Promise<number> {
    const latest = await this.model
      .findOne({ articleId })
      .sort({ revision: -1 })
      .select('revision')
      .lean()
      .exec();
    return latest ? (latest as { revision: number }).revision + 1 : 0;
  }

  async deleteByArticleId(articleId: string): Promise<void> {
    await this.model.deleteMany({ articleId }).exec();
  }

  private toEntity(doc: Record<string, unknown>): ArticleVersion {
    return {
      id: String(doc._id),
      articleId: doc.articleId as string,
      revision: doc.revision as number,
      title: doc.title as string,
      content: doc.content as string,
      category: doc.category as string,
      status: doc.status as string,
      editedBy: doc.editedBy as string,
      editedByName: doc.editedByName as string,
      createdAt: doc.createdAt as Date,
    };
  }
}
