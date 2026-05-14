export interface PageEmbedding {
  id: string;
  pageId: string;
  slug: string;
  modelKey: string;
  pageHash: string;
  chunkId: string;
  chunkTitle: string;
  chunkPreview: string;
  chunkOrder: number;
  vector: number[];
  createdAt: Date;
}

export interface IPageEmbeddingRepository {
  findByPageId(pageId: string, modelKey: string): Promise<PageEmbedding[]>;
  findByModelKey(modelKey: string): Promise<PageEmbedding[]>;
  save(
    embedding: Omit<PageEmbedding, 'id' | 'createdAt'>,
  ): Promise<PageEmbedding>;
  deleteByPageId(pageId: string, modelKey: string): Promise<void>;
  deleteAll(): Promise<void>;
}
