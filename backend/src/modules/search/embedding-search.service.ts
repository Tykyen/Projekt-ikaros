import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import VPTree from 'vptree';
import { ModelRuntime } from './model-runtime';
import { EmbeddingQueue, QueueOperation } from './embedding-queue';
import { resolveModelPath } from './model-path-resolver';
import type { ISearchProvider, SearchProviderInfo } from './interfaces/search-provider.interface';
import type { SearchResult } from './interfaces/search-result.interface';
import type { IPageEmbeddingRepository, PageEmbedding } from './interfaces/page-embedding-repository.interface';
import type { ISearchStatsRepository } from './interfaces/search-stats-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';

interface ModelConfig {
  key: string;
  onnxUrl: string;
  tokenizerUrl: string;
  dimension: number;
  sequenceLength: number;
  enabled: boolean;
}

interface ModelIndex {
  embeddings: PageEmbedding[];
  tree: ReturnType<typeof VPTree.build> | null;
}

@Injectable()
export class EmbeddingSearchService implements ISearchProvider, OnModuleInit {
  private readonly logger = new Logger(EmbeddingSearchService.name);
  readonly providerKey = 'embedding';
  readonly displayName = 'Granite Embedding Search';

  private runtimes: ModelRuntime[] = [];
  private indices = new Map<string, ModelIndex>();
  private queue: EmbeddingQueue;
  private readonly cacheDir: string;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(
    @Inject('IPageEmbeddingRepository') private readonly embeddingRepo: IPageEmbeddingRepository,
    @Inject('ISearchStatsRepository') private readonly statsRepo: ISearchStatsRepository,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
    private readonly config: ConfigService,
  ) {
    this.cacheDir = this.config.get<string>('EMBEDDING_MODEL_CACHE_DIR', 'data/model_cache');
    this.chunkSize = this.config.get<number>('EMBEDDING_CHUNK_SIZE', 750);
    this.chunkOverlap = this.config.get<number>('EMBEDDING_CHUNK_OVERLAP', 250);

    this.queue = new EmbeddingQueue(this.handleOperation.bind(this));
  }

  async onModuleInit(): Promise<void> {
    const modelConfigs = this.getModelConfigs();
    if (modelConfigs.length === 0) {
      this.logger.warn('Žádné embedding modely nejsou povoleny.');
      return;
    }

    await this.statsRepo.update({ status: 'Starting' });

    for (const cfg of modelConfigs) {
      try {
        const onnxPath = await resolveModelPath(cfg.onnxUrl, this.cacheDir);
        const tokenizerPath = await resolveModelPath(cfg.tokenizerUrl, this.cacheDir);
        const runtime = new ModelRuntime({
          key: cfg.key,
          onnxPath,
          tokenizerPath,
          dimension: cfg.dimension,
          sequenceLength: cfg.sequenceLength,
        });
        await runtime.initialize();
        this.runtimes.push(runtime);
        this.indices.set(cfg.key, { embeddings: [], tree: null });
      } catch (err) {
        this.logger.error(`Nelze inicializovat model ${cfg.key}`, err);
      }
    }

    await this.loadExistingEmbeddings();
    this.queue.start();
  }

  async search(query: string, count: number): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const runtime of this.runtimes) {
      const index = this.indices.get(runtime.key);
      if (!index?.tree || index.embeddings.length === 0) continue;

      try {
        const queryVec = await runtime.embed(query);
        const nearest = index.tree.search(queryVec, count) as Array<{ i: number; d: number }>;

        for (const { i, d } of nearest) {
          const emb = index.embeddings[i];
          results.push({
            id: emb.chunkId,
            title: emb.chunkTitle,
            slug: emb.slug,
            score: 1.0 - d,
            providerKey: this.providerKey,
            providerName: this.displayName,
          });
        }
      } catch (err) {
        this.logger.error(`Chyba při vyhledávání modelem ${runtime.key}`, err);
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, count);
  }

  async addPageToIndex(page: Page): Promise<void> {
    this.queue.enqueue({ type: 'Upsert', page });
  }

  async updatePageInIndex(page: Page): Promise<void> {
    this.queue.enqueue({ type: 'Upsert', page });
  }

  async deletePageFromIndex(slug: string): Promise<void> {
    this.queue.enqueue({ type: 'Delete', slug });
  }

  async rebuildIndex(): Promise<void> {
    this.queue.enqueue({ type: 'Rebuild' });
  }

  getInfo(): SearchProviderInfo {
    return { key: this.providerKey, displayName: this.displayName };
  }

  private async handleOperation(op: QueueOperation): Promise<void> {
    if (op.type === 'Upsert') await this.indexPage(op.page);
    else if (op.type === 'Delete') await this.deletePage(op.slug);
    else if (op.type === 'Rebuild') await this.doRebuild();
  }

  private async indexPage(page: Page): Promise<void> {
    for (const runtime of this.runtimes) {
      const newHash = this.computePageHash(page);
      const existing = await this.embeddingRepo.findByPageId(page.id, runtime.key);
      if (existing.length > 0 && existing[0].pageHash === newHash) continue;

      await this.embeddingRepo.deleteByPageId(page.id, runtime.key);
      const chunks = this.buildChunks(page);

      for (let i = 0; i < chunks.length; i++) {
        try {
          const vector = await runtime.embed(chunks[i].text);
          await this.embeddingRepo.save({
            pageId: page.id,
            slug: page.slug,
            modelKey: runtime.key,
            pageHash: newHash,
            chunkId: `${page.id}-${i}`,
            chunkTitle: i === 0 ? page.title : `${page.title} (část ${i + 1})`,
            chunkPreview: chunks[i].text.slice(0, 200) + (chunks[i].text.length > 200 ? '…' : ''),
            chunkOrder: i,
            vector,
          });
        } catch (err) {
          await this.statsRepo.saveFailure({
            pageId: page.id,
            slug: page.slug,
            error: String(err),
            timestamp: new Date(),
          });
        }
      }

      await this.rebuildIndexForModel(runtime.key);
    }
  }

  private async deletePage(slug: string): Promise<void> {
    for (const runtime of this.runtimes) {
      const existing = await this.embeddingRepo.findByModelKey(runtime.key);
      const toDelete = existing.filter((e) => e.slug === slug);
      for (const e of toDelete) {
        await this.embeddingRepo.deleteByPageId(e.pageId, runtime.key);
      }
      await this.rebuildIndexForModel(runtime.key);
    }
  }

  private async doRebuild(): Promise<void> {
    await this.statsRepo.update({ status: 'Rebuilding index' });
    await this.embeddingRepo.deleteAll();

    for (const runtime of this.runtimes) {
      this.indices.set(runtime.key, { embeddings: [], tree: null });
    }

    const pages = await this.pagesRepo.findAll();
    await this.statsRepo.update({ totalPages: pages.length, processedPages: 0 });

    for (let pi = 0; pi < pages.length; pi++) {
      await this.indexPage(pages[pi]);
      await this.statsRepo.update({ processedPages: pi + 1 });
    }

    const total = [...this.indices.values()].reduce((s, idx) => s + idx.embeddings.length, 0);
    await this.statsRepo.update({
      status: 'Everything embedded',
      vectorCount: total,
      indexedCount: pages.length,
    });
  }

  private async loadExistingEmbeddings(): Promise<void> {
    await this.statsRepo.update({ status: 'Scanning pages for outdated embeddings' });

    for (const runtime of this.runtimes) {
      const embeddings = await this.embeddingRepo.findByModelKey(runtime.key);
      const normalized = embeddings.map((e) => e.vector);
      const tree =
        embeddings.length > 0
          ? VPTree.build(normalized as unknown as number[][], cosineDistance)
          : null;
      this.indices.set(runtime.key, { embeddings, tree });
    }

    await this.statsRepo.update({ status: 'Everything embedded' });
    await this.catchUp();
  }

  private async catchUp(): Promise<void> {
    const pages = await this.pagesRepo.findAll();
    for (const page of pages) {
      const newHash = this.computePageHash(page);
      for (const runtime of this.runtimes) {
        const existing = await this.embeddingRepo.findByPageId(page.id, runtime.key);
        if (existing.length === 0 || existing[0].pageHash !== newHash) {
          this.queue.enqueue({ type: 'Upsert', page });
          break;
        }
      }
    }
  }

  private async rebuildIndexForModel(modelKey: string): Promise<void> {
    const embeddings = await this.embeddingRepo.findByModelKey(modelKey);
    const normalized = embeddings.map((e) => e.vector);
    const tree =
      embeddings.length > 0
        ? VPTree.build(normalized as unknown as number[][], cosineDistance)
        : null;
    this.indices.set(modelKey, { embeddings, tree });
    const total = [...this.indices.values()].reduce((s, idx) => s + idx.embeddings.length, 0);
    await this.statsRepo.update({ vectorCount: total });
  }

  chunkText(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    const step = size - overlap;
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      start += step;
    }
    return chunks;
  }

  private buildChunks(page: Page): Array<{ text: string }> {
    const lines: string[] = [`# ${page.title}`];
    if (page.plainText) lines.push(page.plainText);
    if (page.table) {
      const { headers = [], values = [] } = page.table as any;
      headers.forEach((h: string, i: number) => {
        const val = (values[i] ?? '').replace(/<[^>]*>/g, '');
        if (h || val) lines.push(`${h}: ${val}`);
      });
    }
    const fullText = lines.join('\n');
    return this.chunkText(fullText, this.chunkSize, this.chunkOverlap).map((text) => ({ text }));
  }

  computePageHash(page: Page): string {
    const data = JSON.stringify({
      title: page.title,
      plainText: page.plainText,
      table: (page as any).table,
      accessRequirements: page.accessRequirements,
    });
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
  }

  private getModelConfigs(): ModelConfig[] {
    const configs: ModelConfig[] = [];
    if (this.config.get<boolean>('EMBEDDING_GRANITE107_ENABLED', true)) {
      configs.push({
        key: 'granite-107',
        onnxUrl: this.config.get<string>(
          'EMBEDDING_GRANITE107_ONNX_URL',
          'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/model.onnx',
        ),
        tokenizerUrl: this.config.get<string>(
          'EMBEDDING_GRANITE107_TOKENIZER_URL',
          'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/sentencepiece.bpe.model',
        ),
        dimension: this.config.get<number>('EMBEDDING_GRANITE107_DIMENSION', 384),
        sequenceLength: this.config.get<number>('EMBEDDING_GRANITE107_SEQUENCE_LENGTH', 128),
        enabled: true,
      });
    }
    if (this.config.get<boolean>('EMBEDDING_GRANITE278_ENABLED', true)) {
      configs.push({
        key: 'granite-278',
        onnxUrl: this.config.get<string>(
          'EMBEDDING_GRANITE278_ONNX_URL',
          'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/model.onnx',
        ),
        tokenizerUrl: this.config.get<string>(
          'EMBEDDING_GRANITE278_TOKENIZER_URL',
          'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/sentencepiece.bpe.model',
        ),
        dimension: this.config.get<number>('EMBEDDING_GRANITE278_DIMENSION', 768),
        sequenceLength: this.config.get<number>('EMBEDDING_GRANITE278_SEQUENCE_LENGTH', 128),
        enabled: true,
      });
    }
    return configs;
  }
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return 1 - dot;
}
