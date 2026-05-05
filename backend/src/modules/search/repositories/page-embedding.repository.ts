import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PageEmbeddingSchemaClass } from '../schemas/page-embedding.schema';
import type { IPageEmbeddingRepository, PageEmbedding } from '../interfaces/page-embedding-repository.interface';

@Injectable()
export class MongoPageEmbeddingRepository implements IPageEmbeddingRepository {
  constructor(
    @InjectModel(PageEmbeddingSchemaClass.name)
    private readonly model: Model<PageEmbeddingSchemaClass>,
  ) {}

  async findByPageId(pageId: string, modelKey: string): Promise<PageEmbedding[]> {
    const docs = await this.model.find({ pageId, modelKey }).lean().exec();
    return docs.map(this.toEntity);
  }

  async findByModelKey(modelKey: string): Promise<PageEmbedding[]> {
    const docs = await this.model.find({ modelKey }).lean().exec();
    return docs.map(this.toEntity);
  }

  async save(embedding: Omit<PageEmbedding, 'id' | 'createdAt'>): Promise<PageEmbedding> {
    const created = await this.model.create(embedding);
    return this.toEntity(created.toObject());
  }

  async deleteByPageId(pageId: string, modelKey: string): Promise<void> {
    await this.model.deleteMany({ pageId, modelKey }).exec();
  }

  async deleteAll(): Promise<void> {
    await this.model.deleteMany({}).exec();
  }

  private toEntity(doc: any): PageEmbedding {
    return {
      id: String(doc._id),
      pageId: doc.pageId as string,
      slug: doc.slug as string,
      modelKey: doc.modelKey as string,
      pageHash: doc.pageHash as string,
      chunkId: doc.chunkId as string,
      chunkTitle: doc.chunkTitle as string,
      chunkPreview: doc.chunkPreview as string,
      chunkOrder: doc.chunkOrder as number,
      vector: doc.vector as number[],
      createdAt: doc.createdAt as Date,
    };
  }
}
