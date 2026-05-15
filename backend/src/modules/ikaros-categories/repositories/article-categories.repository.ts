import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IArticleCategoriesRepository } from '../interfaces/article-categories-repository.interface';
import type { ArticleCategory } from '../interfaces/article-category.interface';
import { ArticleCategorySchemaClass } from '../schemas/article-category.schema';

@Injectable()
export class MongoArticleCategoriesRepository implements IArticleCategoriesRepository {
  constructor(
    @InjectModel(ArticleCategorySchemaClass.name)
    private readonly model: Model<ArticleCategorySchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): ArticleCategory {
    return {
      key: doc.key as string,
      label: doc.label as string,
      color: doc.color as string,
      order: doc.order as number,
      createdAtUtc: doc.createdAtUtc as Date,
    };
  }

  async findAll(): Promise<ArticleCategory[]> {
    const docs = await this.model.find().sort({ order: 1 }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByKey(key: string): Promise<ArticleCategory | null> {
    const doc = await this.model.findOne({ key }).lean().exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async create(
    data: Omit<ArticleCategory, 'createdAtUtc'>,
  ): Promise<ArticleCategory> {
    const doc = await this.model.create({ ...data, createdAtUtc: new Date() });
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async update(
    key: string,
    patch: Partial<Omit<ArticleCategory, 'key' | 'createdAtUtc'>>,
  ): Promise<ArticleCategory | null> {
    const doc = await this.model
      .findOneAndUpdate({ key }, patch, { new: true })
      .lean()
      .exec();
    return doc
      ? this.toEntity(doc as unknown as Record<string, unknown>)
      : null;
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.model.findOneAndDelete({ key }).lean().exec();
    return result !== null;
  }
}
