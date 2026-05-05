export type SearchIndexStatus =
  | 'Unknown'
  | 'Starting'
  | 'Scanning pages for outdated embeddings'
  | 'Embedding in progress'
  | 'Everything embedded'
  | 'Rebuilding index';

export interface SearchIndexStats {
  provider: string;
  status: SearchIndexStatus;
  processedPages: number;
  totalPages: number;
  indexedCount: number;
  vectorCount: number;
  pendingPages: number;
  lastEmbeddedPageSlug?: string;
  lastEmbeddedAtUtc?: Date;
}

export interface IndexingFailure {
  pageId: string;
  slug: string;
  error: string;
  timestamp: Date;
}

export interface ISearchStatsRepository {
  get(): Promise<SearchIndexStats>;
  update(partial: Partial<SearchIndexStats>): Promise<void>;
  saveFailure(failure: IndexingFailure): Promise<void>;
}
