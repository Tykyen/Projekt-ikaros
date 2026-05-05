import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingSearchService } from './embedding-search.service';

const mockEmbeddingRepo = {
  findByModelKey: jest.fn().mockResolvedValue([]),
  findByPageId: jest.fn().mockResolvedValue([]),
  save: jest.fn().mockResolvedValue({}),
  deleteByPageId: jest.fn().mockResolvedValue(undefined),
  deleteAll: jest.fn().mockResolvedValue(undefined),
};

const mockStatsRepo = {
  get: jest.fn().mockResolvedValue({ status: 'Unknown', processedPages: 0, totalPages: 0, indexedCount: 0, vectorCount: 0, pendingPages: 0 }),
  update: jest.fn().mockResolvedValue(undefined),
  saveFailure: jest.fn().mockResolvedValue(undefined),
};

const mockPagesRepo = {
  findAll: jest.fn().mockResolvedValue([]),
};

describe('EmbeddingSearchService', () => {
  let service: EmbeddingSearchService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmbeddingSearchService,
        { provide: 'IPageEmbeddingRepository', useValue: mockEmbeddingRepo },
        { provide: 'ISearchStatsRepository', useValue: mockStatsRepo },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: unknown) => {
              const map: Record<string, unknown> = {
                EMBEDDING_MODEL_CACHE_DIR: '/tmp/model_cache',
                EMBEDDING_CHUNK_SIZE: 750,
                EMBEDDING_CHUNK_OVERLAP: 250,
                EMBEDDING_GRANITE107_ENABLED: false,
                EMBEDDING_GRANITE278_ENABLED: false,
              };
              return map[key] ?? def;
            },
          },
        },
      ],
    }).compile();
    service = module.get(EmbeddingSearchService);
  });

  it('chunkText — rozdělí text na překrývající se chunky', () => {
    const text = 'a'.repeat(1000);
    const chunks = (service as any).chunkText(text, 750, 250);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBeLessThanOrEqual(750);
  });

  it('computePageHash — vrátí 8-znakový hex string', () => {
    const page = { title: 'Test', plainText: 'Hello', table: null, accessRequirements: [] } as any;
    const hash = (service as any).computePageHash(page);
    expect(hash).toHaveLength(8);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it('providerKey — vrátí "embedding"', () => {
    expect(service.providerKey).toBe('embedding');
  });
});
