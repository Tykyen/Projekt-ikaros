import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PageEmbeddingSchemaClass } from '../schemas/page-embedding.schema';
import type {
  IPageEmbeddingRepository,
  PageEmbedding,
} from '../interfaces/page-embedding-repository.interface';

/**
 * Pokud `findByModelKey` vrátí víc než tento threshold, vyemituje se warning.
 * VPTree v `embedding-search.service.ts` musí načíst všechny vektory do RAM,
 * takže `LIMIT` zde není možný — místo toho monitorujeme scale.
 */
const SCALE_WARNING_THRESHOLD = 10_000;

@Injectable()
export class MongoPageEmbeddingRepository implements IPageEmbeddingRepository {
  private readonly logger = new Logger(MongoPageEmbeddingRepository.name);

  constructor(
    @InjectModel(PageEmbeddingSchemaClass.name)
    private readonly model: Model<PageEmbeddingSchemaClass>,
  ) {}

  async findByPageId(
    pageId: string,
    modelKey: string,
  ): Promise<PageEmbedding[]> {
    const docs = await this.model.find({ pageId, modelKey }).lean().exec();
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async findByModelKey(modelKey: string): Promise<PageEmbedding[]> {
    const docs = await this.model.find({ modelKey }).lean().exec();
    if (docs.length > SCALE_WARNING_THRESHOLD) {
      this.logger.warn(
        `findByModelKey(${modelKey}) vrátil ${docs.length} dokumentů — překročen práh ${SCALE_WARNING_THRESHOLD}. Zvážit pagination/streaming pro VPTree build.`,
      );
    }
    return docs.map((d) =>
      this.toEntity(d as unknown as Record<string, unknown>),
    );
  }

  async save(
    embedding: Omit<PageEmbedding, 'id' | 'createdAt'>,
  ): Promise<PageEmbedding> {
    const created = await this.model.create(embedding);
    return this.toEntity(
      created.toObject() as unknown as Record<string, unknown>,
    );
  }

  async deleteByPageId(pageId: string, modelKey: string): Promise<void> {
    await this.model.deleteMany({ pageId, modelKey }).exec();
  }

  async deleteAll(): Promise<void> {
    await this.model.deleteMany({}).exec();
  }

  private toEntity(doc: Record<string, unknown>): PageEmbedding {
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
