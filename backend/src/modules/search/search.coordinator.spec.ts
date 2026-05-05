import { SearchCoordinator } from './search.coordinator';
import type { ISearchProvider } from './interfaces/search-provider.interface';

const makeProvider = (key: string, results: Array<{ slug: string; score: number }>) => ({
  providerKey: key,
  displayName: key,
  search: jest.fn().mockResolvedValue(results.map((r) => ({ ...r, id: r.slug, title: r.slug, providerKey: key, providerName: key }))),
  addPageToIndex: jest.fn().mockResolvedValue(undefined),
  updatePageInIndex: jest.fn().mockResolvedValue(undefined),
  deletePageFromIndex: jest.fn().mockResolvedValue(undefined),
  rebuildIndex: jest.fn().mockResolvedValue(undefined),
  getInfo: () => ({ key, displayName: key }),
} as unknown as ISearchProvider);

describe('SearchCoordinator', () => {
  let coordinator: SearchCoordinator;
  let meili: ISearchProvider;
  let embedding: ISearchProvider;

  beforeEach(() => {
    meili = makeProvider('meili', [{ slug: 'a', score: 0.9 }, { slug: 'b', score: 0.7 }]);
    embedding = makeProvider('embedding', [{ slug: 'c', score: 0.8 }, { slug: 'a', score: 0.6 }]);
    coordinator = new SearchCoordinator([meili, embedding]);
  });

  it('search combined — kombinuje výsledky round-robin', async () => {
    const results = await coordinator.search('test', 3);
    expect(results[0].slug).toBe('a'); // meili[0]
    expect(results[1].slug).toBe('c'); // embedding[0]
    expect(results[2].slug).toBe('b'); // meili[1]
  });

  it('search combined — deduplicuje podle slug', async () => {
    const results = await coordinator.search('test', 5);
    const slugs = results.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('search s konkrétním providerem — deleguje jen na něj', async () => {
    await coordinator.search('test', 3, 'meili');
    expect(meili.search).toHaveBeenCalled();
    expect(embedding.search).not.toHaveBeenCalled();
  });

  it('getProviders — vrátí combined + všechny providery', () => {
    const providers = coordinator.getProviders();
    expect(providers[0].key).toBe('combined');
    expect(providers.map((p) => p.key)).toContain('meili');
    expect(providers.map((p) => p.key)).toContain('embedding');
  });

  it('addPageToIndex — zavolá oba providery', async () => {
    await coordinator.addPageToIndex({ id: 'p1' } as any);
    expect(meili.addPageToIndex).toHaveBeenCalled();
    expect(embedding.addPageToIndex).toHaveBeenCalled();
  });
});
