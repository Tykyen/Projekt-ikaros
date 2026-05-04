import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IIkarosNewsRepository } from '../interfaces/ikaros-news-repository.interface';
import type { IkarosNewsItem } from '../interfaces/ikaros-news.interface';
import { IkarosNewsSchemaClass } from '../schemas/ikaros-news.schema';

@Injectable()
export class MongoIkarosNewsRepository implements IIkarosNewsRepository {
  constructor(
    @InjectModel(IkarosNewsSchemaClass.name)
    private readonly model: Model<IkarosNewsSchemaClass>,
  ) {}

  private toEntity(doc: Record<string, unknown>): IkarosNewsItem {
    return {
      id: String(doc._id),
      title: doc.title as string,
      content: doc.content as string,
      authorId: doc.authorId as string,
      authorName: doc.authorName as string,
      createdAtUtc: doc.createdAtUtc as Date,
      isActive: doc.isActive as boolean,
    };
  }

  async findActive(): Promise<IkarosNewsItem[]> {
    const docs = await this.model.find({ isActive: true }).sort({ createdAtUtc: -1 }).lean().exec();
    return docs.map((d) => this.toEntity(d as unknown as Record<string, unknown>));
  }

  async create(data: Omit<IkarosNewsItem, 'id'>): Promise<IkarosNewsItem> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }
}
