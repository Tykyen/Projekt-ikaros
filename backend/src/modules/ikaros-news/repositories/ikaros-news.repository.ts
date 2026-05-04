import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosNewsRepository } from '../interfaces/ikaros-news-repository.interface';
import type { IkarosNewsItem } from '../interfaces/ikaros-news.interface';
import { IkarosNewsSchemaClass, type IkarosNewsDocument } from '../schemas/ikaros-news.schema';

@Injectable()
export class MongoIkarosNewsRepository implements IIkarosNewsRepository {
  constructor(
    @InjectModel(IkarosNewsSchemaClass.name)
    private readonly model: Model<IkarosNewsDocument>,
  ) {}

  private toEntity(doc: IkarosNewsDocument): IkarosNewsItem {
    return {
      id: (doc._id as { toString(): string }).toString(),
      title: doc.title,
      content: doc.content,
      authorId: doc.authorId,
      authorName: doc.authorName,
      createdAtUtc: doc.createdAtUtc,
      isActive: doc.isActive,
    };
  }

  async findActive(): Promise<IkarosNewsItem[]> {
    const docs = await this.model.find({ isActive: true }).sort({ createdAtUtc: -1 }).lean<IkarosNewsDocument[]>();
    return docs.map((d) => this.toEntity(d as unknown as IkarosNewsDocument));
  }

  async create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).lean();
    return result !== null;
  }
}
