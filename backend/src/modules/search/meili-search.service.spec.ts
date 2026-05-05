import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MeiliSearchService } from './meili-search.service';

const mockIndex = {
  addDocuments: jest.fn().mockResolvedValue({ taskUid: 1 }),
  deleteDocument: jest.fn().mockResolvedValue({ taskUid: 2 }),
  deleteAllDocuments: jest.fn().mockResolvedValue({ taskUid: 3 }),
  search: jest.fn().mockResolvedValue({ hits: [] }),
  updateSettings: jest.fn().mockResolvedValue({ taskUid: 4 }),
};

jest.mock('meilisearch', () => ({
  Meilisearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(mockIndex),
  })),
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(mockIndex),
  })),
}));

describe('MeiliSearchService', () => {
  let service: MeiliSearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockIndex.addDocuments.mockResolvedValue({ taskUid: 1 });
    mockIndex.deleteDocument.mockResolvedValue({ taskUid: 2 });
    mockIndex.deleteAllDocuments.mockResolvedValue({ taskUid: 3 });
    mockIndex.search.mockResolvedValue({ hits: [] });
    mockIndex.updateSettings.mockResolvedValue({ taskUid: 4 });

    const module = await Test.createTestingModule({
      providers: [
        MeiliSearchService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, d?: unknown) => ({ MEILI_HOST: 'http://localhost:7700', MEILI_API_KEY: 'test' }[k] ?? d) },
        },
        {
          provide: 'IPagesRepository',
          useValue: { findAll: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    service = module.get(MeiliSearchService);
    await service.onModuleInit();
  });

  it('providerKey — vrátí "meili"', () => {
    expect(service.providerKey).toBe('meili');
  });

  it('addPageToIndex — zavolá addDocuments s mapovanými poli', async () => {
    const page = { id: 'p1', slug: 'test-page', title: 'Test Page', plainText: 'Hello world', table: null } as any;
    await service.addPageToIndex(page);
    expect(mockIndex.addDocuments).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ slug: 'test-page', title: 'Test Page' })]),
    );
  });

  it('deletePageFromIndex — zavolá deleteDocument se slugem', async () => {
    await service.deletePageFromIndex('test-page');
    expect(mockIndex.deleteDocument).toHaveBeenCalledWith('test-page');
  });

  it('search — vrátí SearchResult[] z MeiliSearch hits', async () => {
    mockIndex.search.mockResolvedValueOnce({
      hits: [{ id: 'p1', slug: 'test', title: 'Test', _rankingScore: 0.9 }],
    });
    const results = await service.search('test', 5);
    expect(results).toHaveLength(1);
    expect(results[0].providerKey).toBe('meili');
    expect(results[0].slug).toBe('test');
  });
});
