import { Injectable } from '@nestjs/common';
import type {
  ISearchProvider,
  SearchProviderInfo,
} from './interfaces/search-provider.interface';
import type { SearchResult } from './interfaces/search-result.interface';
import type { Page } from '../pages/interfaces/page.interface';

@Injectable()
export class SearchCoordinator {
  constructor(private readonly providers: ISearchProvider[]) {}

  async search(
    query: string,
    count: number,
    providerKey?: string,
  ): Promise<SearchResult[]> {
    if (providerKey && providerKey !== 'combined') {
      const provider = this.providers.find(
        (p) => p.providerKey === providerKey,
      );
      return provider ? provider.search(query, count) : [];
    }
    return this.combineResults(query, count);
  }

  private async combineResults(
    query: string,
    count: number,
  ): Promise<SearchResult[]> {
    const allResults = await Promise.all(
      this.providers.map((p) => p.search(query, count)),
    );
    const combined: SearchResult[] = [];
    const seen = new Set<string>();
    let round = 0;

    while (combined.length < count) {
      let added = false;
      for (const results of allResults) {
        if (round < results.length) {
          const r = results[round];
          const key = r.slug || r.id;
          if (!seen.has(key)) {
            seen.add(key);
            combined.push(r);
            added = true;
            if (combined.length >= count) break;
          }
        }
      }
      if (!added) break;
      round++;
    }

    return combined;
  }

  getProviders(): SearchProviderInfo[] {
    return [
      { key: 'combined', displayName: 'Combined Search' },
      ...this.providers.map((p) => p.getInfo()),
    ];
  }

  async addPageToIndex(page: Page): Promise<void> {
    await Promise.all(this.providers.map((p) => p.addPageToIndex(page)));
  }

  async updatePageInIndex(page: Page): Promise<void> {
    await Promise.all(this.providers.map((p) => p.updatePageInIndex(page)));
  }

  async deletePageFromIndex(pageId: string): Promise<void> {
    await Promise.all(this.providers.map((p) => p.deletePageFromIndex(pageId)));
  }

  async rebuildIndex(): Promise<void> {
    await Promise.all(this.providers.map((p) => p.rebuildIndex()));
  }
}
