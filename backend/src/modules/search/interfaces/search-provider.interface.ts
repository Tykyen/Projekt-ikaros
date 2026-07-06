import type { Page } from '../../pages/interfaces/page.interface';
import type {
  SearchResult,
  SearchProviderInfo,
} from './search-result.interface';

export interface ISearchProvider {
  readonly providerKey: string;
  readonly displayName: string;
  search(query: string, count: number): Promise<SearchResult[]>;
  addPageToIndex(page: Page): Promise<void>;
  updatePageInIndex(page: Page): Promise<void>;
  /** FIX-59 — bere `pageId` (Mongo primaryKey), ne `slug` (slug se v indexu nedá spolehlivě mazat). */
  deletePageFromIndex(pageId: string): Promise<void>;
  rebuildIndex(): Promise<void>;
  getInfo(): SearchProviderInfo;
}

export type { SearchProviderInfo };
