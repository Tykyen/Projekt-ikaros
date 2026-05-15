import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IArticleReadsRepository } from '../interfaces/article-reads-repository.interface';
import { ArticleReadSchemaClass } from '../schemas/article-read.schema';

@Injectable()
export class MongoArticleReadsRepository implements IArticleReadsRepository {
  constructor(
    @InjectModel(ArticleReadSchemaClass.name)
    private readonly model: Model<ArticleReadSchemaClass>,
  ) {}

  /**
   * Upsert per unique (userId, articleId). Pokud řádek existuje, jen updatne
   * readAt; jinak vytvoří nový. Idempotentní díky unique indexu.
   */
  async upsertRead(userId: string, articleId: string): Promise<void> {
    await this.model
      .updateOne(
        { userId, articleId },
        { $set: { readAt: new Date() }, $setOnInsert: { userId, articleId } },
        { upsert: true },
      )
      .exec();
  }

  async isRead(userId: string, articleId: string): Promise<boolean> {
    const doc = await this.model.findOne({ userId, articleId }).lean().exec();
    return doc !== null;
  }

  async countReadByUserForArticleIds(
    userId: string,
    articleIds: string[],
  ): Promise<number> {
    if (articleIds.length === 0) return 0;
    return this.model
      .countDocuments({ userId, articleId: { $in: articleIds } })
      .exec();
  }
}
