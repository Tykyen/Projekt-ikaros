import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Meilisearch as MeiliSearch, Index } from 'meilisearch';
import type {
  ISearchProvider,
  SearchProviderInfo,
} from './interfaces/search-provider.interface';
import type { SearchResult } from './interfaces/search-result.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';
import { stripAllTags } from '../../common/utils/sanitize-rich-text';

const INDEX_NAME = 'pages';

@Injectable()
export class MeiliSearchService implements ISearchProvider, OnModuleInit {
  private readonly logger = new Logger(MeiliSearchService.name);
  readonly providerKey = 'meili';
  readonly displayName = 'MeiliSearch Full-Text';
  private client: MeiliSearch;
  private index: Index;

  constructor(
    private readonly config: ConfigService,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    this.client = new MeiliSearch({
      host: this.config.get<string>('MEILI_HOST', 'http://localhost:7700'),
      apiKey: this.config.get<string>('MEILI_API_KEY', ''),
    });
    this.index = this.client.index(INDEX_NAME);

    try {
      await this.index.updateSettings({
        searchableAttributes: [
          'titleExact',
          'title',
          'tableTitle',
          'paragraphs',
          'headers',
          'values',
        ],
        filterableAttributes: ['slug', 'worldId'],
        rankingRules: [
          'words',
          'typo',
          'proximity',
          'attribute',
          'sort',
          'exactness',
        ],
        typoTolerance: {
          enabled: true,
          minWordSizeForTypos: { oneTypo: 4, twoTypos: 6 },
        },
      });
      this.logger.log('MeiliSearch index nakonfigurován.');
    } catch (err) {
      this.logger.warn(
        'Nelze nakonfigurovat MeiliSearch index (MeiliSearch běží?)',
        err,
      );
    }

    try {
      await this.rebuildIndex();
    } catch (err) {
      this.logger.warn('Počáteční rebuild MeiliSearch selhal', err);
    }
  }

  async search(query: string, count: number): Promise<SearchResult[]> {
    try {
      const res = await this.index.search(query, {
        limit: count,
        showRankingScore: true,
      });
      return (res.hits as Array<Record<string, unknown>>).map((hit) => ({
        id: hit.id as string,
        title: hit.title as string,
        slug: hit.slug as string,
        score: (hit._rankingScore as number) ?? 1,
        providerKey: this.providerKey,
        providerName: this.displayName,
      }));
    } catch {
      return [];
    }
  }

  async addPageToIndex(page: Page): Promise<void> {
    await this.index.addDocuments([this.toDocument(page)]);
  }

  async updatePageInIndex(page: Page): Promise<void> {
    await this.index.addDocuments([this.toDocument(page)]);
  }

  async deletePageFromIndex(slug: string): Promise<void> {
    await this.index.deleteDocument(slug);
  }

  async rebuildIndex(): Promise<void> {
    await this.index.deleteAllDocuments();
    const pages = await this.pagesRepo.findAll();
    if (pages.length === 0) return;
    const docs = pages.map((p) => this.toDocument(p));
    await this.index.addDocuments(docs);
    this.logger.log(`MeiliSearch: zaindexováno ${docs.length} stránek.`);
  }

  getInfo(): SearchProviderInfo {
    return { key: this.providerKey, displayName: this.displayName };
  }

  private toDocument(page: Page): Record<string, unknown> {
    const table = page.table;
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      titleExact: page.title.toLowerCase(),
      tableTitle: table?.title ?? '',
      paragraphs: page.plainText ?? '',
      // Krok 8.5 — buňky jsou rich-text HTML; pro index strip tagů.
      headers: (table?.headers ?? []).map((h) => stripAllTags(h)).join(' '),
      values: (table?.values ?? []).map((v) => stripAllTags(v)).join(' '),
    };
  }
}
