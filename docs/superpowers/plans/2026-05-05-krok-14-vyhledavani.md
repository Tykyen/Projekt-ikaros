# Krok 14 — Vyhledávání: Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat full-text search (MeiliSearch) + sémantické embedding search (ONNX Granite) s fasádou SearchCoordinator a integrací do PagesService.

**Architecture:** MeiliSearchService a EmbeddingSearchService implementují společné rozhraní `ISearchProvider`. SearchCoordinator je fasáda která kombinuje výsledky round-robin. PagesService injectuje SearchCoordinator a volá ho při každé mutaci stránky. EmbeddingQueue zpracovává ONNX inference asynchronně přes EventEmitter + async smyčku.

**Tech Stack:** `meilisearch`, `onnxruntime-node`, `sentencepiece-js`, `vptree`, NestJS, Mongoose

---

## Soubory — přehled

**Nové soubory:**
- `backend/src/modules/search/interfaces/search-provider.interface.ts`
- `backend/src/modules/search/interfaces/search-result.interface.ts`
- `backend/src/modules/search/interfaces/page-embedding-repository.interface.ts`
- `backend/src/modules/search/interfaces/search-stats-repository.interface.ts`
- `backend/src/modules/search/schemas/page-embedding.schema.ts`
- `backend/src/modules/search/schemas/search-index-stats.schema.ts`
- `backend/src/modules/search/repositories/page-embedding.repository.ts`
- `backend/src/modules/search/repositories/search-stats.repository.ts`
- `backend/src/modules/search/model-path-resolver.ts`
- `backend/src/modules/search/model-runtime.ts`
- `backend/src/modules/search/embedding-queue.ts`
- `backend/src/modules/search/embedding-search.service.ts`
- `backend/src/modules/search/meili-search.service.ts`
- `backend/src/modules/search/search.coordinator.ts`
- `backend/src/modules/search/search.controller.ts`
- `backend/src/modules/search/search.module.ts`
- `backend/src/modules/stats/stats.controller.ts`
- `backend/src/modules/stats/stats.module.ts`
- `backend/src/modules/search/**/*.spec.ts`

**Modifikované soubory:**
- `backend/src/modules/pages/pages.service.ts` — inject SearchCoordinator
- `backend/src/app.module.ts` — přidat SearchModule, StatsModule
- `backend/package.json` — přidat závislosti
- `docs/roadmap.md` — aktualizovat Krok 14

---

## Task 1: Instalace závislostí

**Files:**
- Modify: `backend/package.json`

- [ ] **Krok 1: Nainstaluj npm balíčky**

```bash
cd backend
npm install meilisearch onnxruntime-node sentencepiece-js vptree
npm install --save-dev @types/vptree
```

- [ ] **Krok 2: Ověř instalaci**

```bash
node -e "require('meilisearch'); require('onnxruntime-node'); require('sentencepiece-js'); require('vptree'); console.log('OK')"
```

Očekávaný výstup: `OK`

- [ ] **Krok 3: Commitni**

```bash
git add package.json package-lock.json
git commit -m "chore(search): install meilisearch, onnxruntime-node, sentencepiece-js, vptree"
```

---

## Task 2: Interfaces a domain typy

**Files:**
- Create: `backend/src/modules/search/interfaces/search-result.interface.ts`
- Create: `backend/src/modules/search/interfaces/search-provider.interface.ts`
- Create: `backend/src/modules/search/interfaces/page-embedding-repository.interface.ts`
- Create: `backend/src/modules/search/interfaces/search-stats-repository.interface.ts`

- [ ] **Krok 1: Vytvoř SearchResult interface**

`backend/src/modules/search/interfaces/search-result.interface.ts`:
```typescript
export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  score: number;
  providerKey: string;
  providerName: string;
}

export interface SearchProviderInfo {
  key: string;
  displayName: string;
}
```

- [ ] **Krok 2: Vytvoř ISearchProvider interface**

`backend/src/modules/search/interfaces/search-provider.interface.ts`:
```typescript
import type { Page } from '../../pages/interfaces/page.interface';
import type { SearchResult, SearchProviderInfo } from './search-result.interface';

export interface ISearchProvider {
  readonly providerKey: string;
  readonly displayName: string;
  search(query: string, count: number): Promise<SearchResult[]>;
  addPageToIndex(page: Page): Promise<void>;
  updatePageInIndex(page: Page): Promise<void>;
  deletePageFromIndex(slug: string): Promise<void>;
  rebuildIndex(): Promise<void>;
  getInfo(): SearchProviderInfo;
}
```

- [ ] **Krok 3: Vytvoř IPageEmbeddingRepository interface**

`backend/src/modules/search/interfaces/page-embedding-repository.interface.ts`:
```typescript
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
  save(embedding: Omit<PageEmbedding, 'id' | 'createdAt'>): Promise<PageEmbedding>;
  deleteByPageId(pageId: string, modelKey: string): Promise<void>;
  deleteAll(): Promise<void>;
}
```

- [ ] **Krok 4: Vytvoř ISearchStatsRepository interface**

`backend/src/modules/search/interfaces/search-stats-repository.interface.ts`:
```typescript
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
```

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/interfaces/
git commit -m "feat(search): domain interfaces - SearchResult, ISearchProvider, repositories"
```

---

## Task 3: PageEmbedding schema + repository

**Files:**
- Create: `backend/src/modules/search/schemas/page-embedding.schema.ts`
- Create: `backend/src/modules/search/repositories/page-embedding.repository.ts`
- Create: `backend/src/modules/search/repositories/page-embedding.repository.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/repositories/page-embedding.repository.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoPageEmbeddingRepository } from './page-embedding.repository';
import { PageEmbeddingSchemaClass } from '../schemas/page-embedding.schema';

describe('MongoPageEmbeddingRepository', () => {
  let repo: MongoPageEmbeddingRepository;
  const mockModel = {
    find: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoPageEmbeddingRepository,
        { provide: getModelToken(PageEmbeddingSchemaClass.name), useValue: mockModel },
      ],
    }).compile();
    repo = module.get(MongoPageEmbeddingRepository);
  });

  it('findByModelKey — vrátí embeddingy pro daný model', async () => {
    const doc = {
      _id: 'id1', pageId: 'p1', slug: 's1', modelKey: 'granite-107',
      pageHash: 'abc', chunkId: 'p1-0', chunkTitle: 'Title',
      chunkPreview: 'Preview', chunkOrder: 0, vector: [0.1, 0.2], createdAt: new Date(),
    };
    mockModel.find.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve([doc]) }) });
    const result = await repo.findByModelKey('granite-107');
    expect(result).toHaveLength(1);
    expect(result[0].modelKey).toBe('granite-107');
  });

  it('deleteAll — zavolá deleteMany bez filtru', async () => {
    mockModel.deleteMany.mockReturnValue({ exec: () => Promise.resolve() });
    await repo.deleteAll();
    expect(mockModel.deleteMany).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Krok 2: Spusť — ověř že test selže**

```bash
cd backend && npm test -- --testPathPattern=page-embedding.repository.spec --no-coverage
```

Očekáváno: FAIL — `Cannot find module`

- [ ] **Krok 3: Vytvoř schema**

`backend/src/modules/search/schemas/page-embedding.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PageEmbeddingDocument = HydratedDocument<PageEmbeddingSchemaClass>;

@Schema({ collection: 'page_embeddings', timestamps: { createdAt: true, updatedAt: false } })
export class PageEmbeddingSchemaClass {
  @Prop({ required: true, index: true }) pageId: string;
  @Prop({ required: true }) slug: string;
  @Prop({ required: true, index: true }) modelKey: string;
  @Prop({ required: true }) pageHash: string;
  @Prop({ required: true }) chunkId: string;
  @Prop({ required: true }) chunkTitle: string;
  @Prop({ required: true }) chunkPreview: string;
  @Prop({ required: true }) chunkOrder: number;
  @Prop({ type: [Number], required: true }) vector: number[];
  createdAt: Date;
}

export const PageEmbeddingSchema = SchemaFactory.createForClass(PageEmbeddingSchemaClass);
PageEmbeddingSchema.index({ pageId: 1, modelKey: 1 });
```

- [ ] **Krok 4: Vytvoř repository**

`backend/src/modules/search/repositories/page-embedding.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PageEmbeddingSchemaClass } from '../schemas/page-embedding.schema';
import type { IPageEmbeddingRepository, PageEmbedding } from '../interfaces/page-embedding-repository.interface';

@Injectable()
export class MongoPageEmbeddingRepository implements IPageEmbeddingRepository {
  constructor(
    @InjectModel(PageEmbeddingSchemaClass.name)
    private readonly model: Model<PageEmbeddingSchemaClass>,
  ) {}

  async findByPageId(pageId: string, modelKey: string): Promise<PageEmbedding[]> {
    const docs = await this.model.find({ pageId, modelKey }).lean().exec();
    return docs.map(this.toEntity);
  }

  async findByModelKey(modelKey: string): Promise<PageEmbedding[]> {
    const docs = await this.model.find({ modelKey }).lean().exec();
    return docs.map(this.toEntity);
  }

  async save(embedding: Omit<PageEmbedding, 'id' | 'createdAt'>): Promise<PageEmbedding> {
    const created = await this.model.create(embedding);
    return this.toEntity(created.toObject());
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
```

- [ ] **Krok 5: Spusť test — ověř že prochází**

```bash
cd backend && npm test -- --testPathPattern=page-embedding.repository.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 6: Commitni**

```bash
git add backend/src/modules/search/schemas/page-embedding.schema.ts backend/src/modules/search/repositories/
git commit -m "feat(search): PageEmbedding schema + repository"
```

---

## Task 4: SearchIndexStats schema + StatsRepository

**Files:**
- Create: `backend/src/modules/search/schemas/search-index-stats.schema.ts`
- Create: `backend/src/modules/search/repositories/search-stats.repository.ts`
- Create: `backend/src/modules/search/repositories/search-stats.repository.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/repositories/search-stats.repository.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MongoSearchStatsRepository } from './search-stats.repository';
import { SearchIndexStatsSchemaClass } from '../schemas/search-index-stats.schema';
import { IndexingFailureSchemaClass } from '../schemas/search-index-stats.schema';

describe('MongoSearchStatsRepository', () => {
  let repo: MongoSearchStatsRepository;
  const mockStatsModel = {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  };
  const mockFailureModel = { create: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MongoSearchStatsRepository,
        { provide: getModelToken(SearchIndexStatsSchemaClass.name), useValue: mockStatsModel },
        { provide: getModelToken(IndexingFailureSchemaClass.name), useValue: mockFailureModel },
      ],
    }).compile();
    repo = module.get(MongoSearchStatsRepository);
  });

  it('get — vrátí výchozí stats pokud dokument neexistuje', async () => {
    mockStatsModel.findOne.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(null) }) });
    const stats = await repo.get();
    expect(stats.status).toBe('Unknown');
    expect(stats.processedPages).toBe(0);
  });

  it('update — upsertuje dokument', async () => {
    mockStatsModel.findOneAndUpdate.mockReturnValue({ lean: () => ({ exec: () => Promise.resolve({}) }) });
    await repo.update({ status: 'Embedding in progress' });
    expect(mockStatsModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'embedding-search' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'Embedding in progress' }) }),
      expect.anything(),
    );
  });
});
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=search-stats.repository.spec --no-coverage
```

- [ ] **Krok 3: Vytvoř schema**

`backend/src/modules/search/schemas/search-index-stats.schema.ts`:
```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SearchIndexStatsDocument = HydratedDocument<SearchIndexStatsSchemaClass>;

@Schema({ collection: 'search_index_stats' })
export class SearchIndexStatsSchemaClass {
  @Prop({ required: true }) _id: string;
  @Prop({ default: 'embedding' }) provider: string;
  @Prop({ default: 'Unknown' }) status: string;
  @Prop({ default: 0 }) processedPages: number;
  @Prop({ default: 0 }) totalPages: number;
  @Prop({ default: 0 }) indexedCount: number;
  @Prop({ default: 0 }) vectorCount: number;
  @Prop({ default: 0 }) pendingPages: number;
  @Prop() lastEmbeddedPageSlug?: string;
  @Prop() lastEmbeddedAtUtc?: Date;
}

export const SearchIndexStatsSchema = SchemaFactory.createForClass(SearchIndexStatsSchemaClass);

export type IndexingFailureDocument = HydratedDocument<IndexingFailureSchemaClass>;

@Schema({ collection: 'indexing_failures', timestamps: true })
export class IndexingFailureSchemaClass {
  @Prop({ required: true }) pageId: string;
  @Prop({ required: true }) slug: string;
  @Prop({ required: true }) error: string;
  @Prop({ default: Date.now }) timestamp: Date;
}

export const IndexingFailureSchema = SchemaFactory.createForClass(IndexingFailureSchemaClass);
```

- [ ] **Krok 4: Vytvoř repository**

`backend/src/modules/search/repositories/search-stats.repository.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SearchIndexStatsSchemaClass, IndexingFailureSchemaClass } from '../schemas/search-index-stats.schema';
import type { ISearchStatsRepository, SearchIndexStats, IndexingFailure } from '../interfaces/search-stats-repository.interface';

const STATS_ID = 'embedding-search';

const DEFAULT_STATS: SearchIndexStats = {
  provider: 'embedding',
  status: 'Unknown',
  processedPages: 0,
  totalPages: 0,
  indexedCount: 0,
  vectorCount: 0,
  pendingPages: 0,
};

@Injectable()
export class MongoSearchStatsRepository implements ISearchStatsRepository {
  constructor(
    @InjectModel(SearchIndexStatsSchemaClass.name)
    private readonly statsModel: Model<SearchIndexStatsSchemaClass>,
    @InjectModel(IndexingFailureSchemaClass.name)
    private readonly failureModel: Model<IndexingFailureSchemaClass>,
  ) {}

  async get(): Promise<SearchIndexStats> {
    const doc = await this.statsModel.findOne({ _id: STATS_ID }).lean().exec();
    if (!doc) return { ...DEFAULT_STATS };
    return {
      provider: doc.provider,
      status: doc.status as SearchIndexStats['status'],
      processedPages: doc.processedPages,
      totalPages: doc.totalPages,
      indexedCount: doc.indexedCount,
      vectorCount: doc.vectorCount,
      pendingPages: doc.pendingPages,
      lastEmbeddedPageSlug: doc.lastEmbeddedPageSlug,
      lastEmbeddedAtUtc: doc.lastEmbeddedAtUtc,
    };
  }

  async update(partial: Partial<SearchIndexStats>): Promise<void> {
    await this.statsModel.findOneAndUpdate(
      { _id: STATS_ID },
      { $set: partial },
      { upsert: true, new: true },
    ).lean().exec();
  }

  async saveFailure(failure: IndexingFailure): Promise<void> {
    await this.failureModel.create(failure);
  }
}
```

- [ ] **Krok 5: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=search-stats.repository.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 6: Commitni**

```bash
git add backend/src/modules/search/schemas/search-index-stats.schema.ts backend/src/modules/search/repositories/search-stats.repository.ts backend/src/modules/search/repositories/search-stats.repository.spec.ts
git commit -m "feat(search): SearchIndexStats + IndexingFailure schema a repository"
```

---

## Task 5: ModelPathResolver

**Files:**
- Create: `backend/src/modules/search/model-path-resolver.ts`
- Create: `backend/src/modules/search/model-path-resolver.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/model-path-resolver.spec.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolveModelPath } from './model-path-resolver';

jest.mock('fs');
jest.mock('node-fetch');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('resolveModelPath', () => {
  const cacheDir = '/tmp/model_cache';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('vrátí cestu z cache pokud soubor existuje', async () => {
    const url = 'https://example.com/model.onnx';
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    const expectedPath = path.join(cacheDir, `${hash}.onnx`);
    mockFs.existsSync = jest.fn().mockReturnValue(true);

    const result = await resolveModelPath(url, cacheDir);
    expect(result).toBe(expectedPath);
  });
});
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=model-path-resolver.spec --no-coverage
```

- [ ] **Krok 3: Implementuj ModelPathResolver**

`backend/src/modules/search/model-path-resolver.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { Logger } from '@nestjs/common';

const logger = new Logger('ModelPathResolver');

export async function resolveModelPath(url: string, cacheDir: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(url).digest('hex');
  const ext = path.extname(new URL(url).pathname) || '.bin';
  const cached = path.join(cacheDir, `${hash}${ext}`);

  if (fs.existsSync(cached)) {
    logger.log(`Model cache hit: ${cached}`);
    return cached;
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  logger.log(`Downloading model from ${url} ...`);
  await downloadFile(url, cached);
  logger.log(`Model downloaded to ${cached}`);
  return cached;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    let downloaded = 0;
    let total = 0;
    let lastLogPct = -1;

    proto.get(url, (res) => {
      total = parseInt(res.headers['content-length'] ?? '0', 10);
      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.floor((downloaded / total) * 100);
          const step = Math.floor(pct / 10) * 10;
          if (step > lastLogPct) {
            lastLogPct = step;
            logger.log(`Download progress: ${step}%`);
          }
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => undefined);
      reject(err);
    });
  });
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=model-path-resolver.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/model-path-resolver.ts backend/src/modules/search/model-path-resolver.spec.ts
git commit -m "feat(search): ModelPathResolver - download a cache ONNX modelů"
```

---

## Task 6: ModelRuntime

**Files:**
- Create: `backend/src/modules/search/model-runtime.ts`
- Create: `backend/src/modules/search/model-runtime.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/model-runtime.spec.ts`:
```typescript
import { ModelRuntime } from './model-runtime';

jest.mock('onnxruntime-node', () => ({
  InferenceSession: {
    create: jest.fn().mockResolvedValue({
      run: jest.fn().mockResolvedValue({
        sentence_embedding: { data: new Float32Array([0.6, 0.8]) },
      }),
    }),
  },
}));

jest.mock('sentencepiece-js', () => {
  return jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    encode: jest.fn().mockReturnValue([1, 2, 3]),
  }));
});

describe('ModelRuntime', () => {
  let runtime: ModelRuntime;

  beforeEach(async () => {
    runtime = new ModelRuntime({
      key: 'granite-107',
      onnxPath: '/cache/model.onnx',
      tokenizerPath: '/cache/tokenizer.model',
      dimension: 2,
      sequenceLength: 4,
    });
    await runtime.initialize();
  });

  it('embed — vrátí L2-normalizovaný vektor', async () => {
    const result = await runtime.embed('hello world');
    const norm = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(Math.abs(norm - 1.0)).toBeLessThan(0.001);
  });

  it('embed — vrátí vektor správné délky', async () => {
    const result = await runtime.embed('hello world');
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=model-runtime.spec --no-coverage
```

- [ ] **Krok 3: Implementuj ModelRuntime**

`backend/src/modules/search/model-runtime.ts`:
```typescript
import * as ort from 'onnxruntime-node';
import SentencePiece from 'sentencepiece-js';
import { Logger } from '@nestjs/common';

export interface ModelRuntimeConfig {
  key: string;
  onnxPath: string;
  tokenizerPath: string;
  dimension: number;
  sequenceLength: number;
}

export class ModelRuntime {
  private readonly logger = new Logger(`ModelRuntime[${this.config.key}]`);
  private session: ort.InferenceSession | null = null;
  private tokenizer: InstanceType<typeof SentencePiece> | null = null;

  constructor(private readonly config: ModelRuntimeConfig) {}

  async initialize(): Promise<void> {
    this.logger.log('Načítám ONNX model...');
    this.session = await ort.InferenceSession.create(this.config.onnxPath);

    this.logger.log('Načítám tokenizer...');
    this.tokenizer = new SentencePiece();
    await this.tokenizer.load(this.config.tokenizerPath);
    this.logger.log('ModelRuntime inicializován.');
  }

  async embed(text: string): Promise<number[]> {
    if (!this.session || !this.tokenizer) {
      throw new Error(`ModelRuntime[${this.config.key}] není inicializován`);
    }

    const tokenIds: number[] = this.tokenizer.encode(text);
    const seq = this.config.sequenceLength;

    // Ořez nebo padding na sequenceLength
    const inputIds = new Array<number>(seq).fill(1); // 1 = pad token
    const attentionMask = new Array<number>(seq).fill(0);
    const len = Math.min(tokenIds.length, seq);
    for (let i = 0; i < len; i++) {
      inputIds[i] = tokenIds[i];
      attentionMask[i] = 1;
    }

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, seq]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, seq]),
    };

    const results = await this.session.run(feeds);
    const outputKey = results['sentence_embedding'] ? 'sentence_embedding' : Object.keys(results)[0];
    const raw = Array.from(results[outputKey].data as Float32Array);

    return l2Normalize(raw);
  }

  get key(): string { return this.config.key; }
  get dimension(): number { return this.config.dimension; }
}

function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=model-runtime.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/model-runtime.ts backend/src/modules/search/model-runtime.spec.ts
git commit -m "feat(search): ModelRuntime - ONNX inference + SentencePiece tokenizace + L2 normalizace"
```

---

## Task 7: EmbeddingQueue

**Files:**
- Create: `backend/src/modules/search/embedding-queue.ts`
- Create: `backend/src/modules/search/embedding-queue.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/embedding-queue.spec.ts`:
```typescript
import { EmbeddingQueue, QueueOperation } from './embedding-queue';

describe('EmbeddingQueue', () => {
  it('enqueue — spustí handler pro Upsert', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const queue = new EmbeddingQueue(handler);
    queue.start();

    queue.enqueue({ type: 'Upsert', page: { id: 'p1' } as any });
    await new Promise((r) => setTimeout(r, 50));

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'Upsert' }));
    queue.stop();
  });

  it('enqueue — Upsert během Rebuild jde do backlogu', async () => {
    let rebuildResolve!: () => void;
    const rebuildPromise = new Promise<void>((r) => { rebuildResolve = r; });

    const handler = jest.fn().mockImplementation((op: QueueOperation) => {
      if (op.type === 'Rebuild') return rebuildPromise;
      return Promise.resolve();
    });

    const queue = new EmbeddingQueue(handler);
    queue.start();

    queue.enqueue({ type: 'Rebuild' });
    await new Promise((r) => setTimeout(r, 10));
    queue.enqueue({ type: 'Upsert', page: { id: 'p2' } as any });
    await new Promise((r) => setTimeout(r, 10));

    // Během rebuildu handler dostal jen Rebuild
    expect(handler).toHaveBeenCalledTimes(1);

    rebuildResolve();
    await new Promise((r) => setTimeout(r, 50));

    // Po rebuildu se zpracoval backlog Upsert
    expect(handler).toHaveBeenCalledTimes(2);
    queue.stop();
  });
});
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=embedding-queue.spec --no-coverage
```

- [ ] **Krok 3: Implementuj EmbeddingQueue**

`backend/src/modules/search/embedding-queue.ts`:
```typescript
import type { Page } from '../pages/interfaces/page.interface';
import { Logger } from '@nestjs/common';

export type QueueOperation =
  | { type: 'Upsert'; page: Page }
  | { type: 'Delete'; slug: string }
  | { type: 'Rebuild' };

export type QueueHandler = (op: QueueOperation) => Promise<void>;

export class EmbeddingQueue {
  private readonly logger = new Logger(EmbeddingQueue.name);
  private readonly queue: QueueOperation[] = [];
  private readonly backlog: QueueOperation[] = [];
  private isRebuilding = false;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private resolver: (() => void) | null = null;

  constructor(private readonly handler: QueueHandler) {}

  start(): void {
    this.isRunning = true;
    void this.processLoop();
  }

  stop(): void {
    this.isRunning = false;
    this.resolver?.();
  }

  enqueue(op: QueueOperation): void {
    if (op.type === 'Rebuild') {
      // Zruš aktuální rebuild, vyčisti frontu
      this.abortController?.abort();
      this.queue.length = 0;
      this.backlog.length = 0;
    }

    if (this.isRebuilding && (op.type === 'Upsert' || op.type === 'Delete')) {
      this.backlog.push(op);
      return;
    }

    this.queue.push(op);
    this.resolver?.();
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      if (this.queue.length === 0) {
        await new Promise<void>((r) => { this.resolver = r; });
        this.resolver = null;
        continue;
      }

      const op = this.queue.shift()!;

      if (op.type === 'Rebuild') {
        this.isRebuilding = true;
        this.abortController = new AbortController();
        try {
          await this.handler(op);
        } catch (err) {
          this.logger.error('Rebuild selhal', err);
        } finally {
          this.isRebuilding = false;
          this.abortController = null;
          // Vrať backlog do fronty
          this.queue.unshift(...this.backlog.splice(0));
        }
      } else {
        try {
          await this.handler(op);
        } catch (err) {
          this.logger.error(`Operace ${op.type} selhala`, err);
        }
      }
    }
  }
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=embedding-queue.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/embedding-queue.ts backend/src/modules/search/embedding-queue.spec.ts
git commit -m "feat(search): EmbeddingQueue - async fronta s rebuild-backlog logikou"
```

---

## Task 8: EmbeddingSearchService

**Files:**
- Create: `backend/src/modules/search/embedding-search.service.ts`
- Create: `backend/src/modules/search/embedding-search.service.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/embedding-search.service.spec.ts`:
```typescript
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
                EMBEDDING_GRANITE107_ENABLED: false, // modely vypnuty pro unit testy
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

  it('chunkPage — rozdělí text na překrývající se chunky', () => {
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
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=embedding-search.service.spec --no-coverage
```

- [ ] **Krok 3: Implementuj EmbeddingSearchService**

`backend/src/modules/search/embedding-search.service.ts`:
```typescript
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import VPTree from 'vptree';
import { ModelRuntime } from './model-runtime';
import { EmbeddingQueue } from './embedding-queue';
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
        const runtime = new ModelRuntime({ key: cfg.key, onnxPath, tokenizerPath, dimension: cfg.dimension, sequenceLength: cfg.sequenceLength });
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

  private async handleOperation(op: { type: string; page?: Page; slug?: string }): Promise<void> {
    if (op.type === 'Upsert' && op.page) await this.indexPage(op.page);
    else if (op.type === 'Delete' && op.slug) await this.deletePage(op.slug);
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
            pageId: page.id, slug: page.slug, modelKey: runtime.key,
            pageHash: newHash, chunkId: `${page.id}-${i}`,
            chunkTitle: i === 0 ? page.title : `${page.title} (část ${i + 1})`,
            chunkPreview: chunks[i].text.slice(0, 200) + (chunks[i].text.length > 200 ? '…' : ''),
            chunkOrder: i, vector,
          });
        } catch (err) {
          await this.statsRepo.saveFailure({ pageId: page.id, slug: page.slug, error: String(err), timestamp: new Date() });
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
    await this.statsRepo.update({ status: 'Everything embedded', vectorCount: total, indexedCount: pages.length });
  }

  private async loadExistingEmbeddings(): Promise<void> {
    await this.statsRepo.update({ status: 'Scanning pages for outdated embeddings' });

    for (const runtime of this.runtimes) {
      const embeddings = await this.embeddingRepo.findByModelKey(runtime.key);
      const normalized = embeddings.map((e) => e.vector);
      const tree = embeddings.length > 0
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
    const tree = embeddings.length > 0
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
        onnxUrl: this.config.get<string>('EMBEDDING_GRANITE107_ONNX_URL', 'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/model.onnx'),
        tokenizerUrl: this.config.get<string>('EMBEDDING_GRANITE107_TOKENIZER_URL', 'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/sentencepiece.bpe.model'),
        dimension: this.config.get<number>('EMBEDDING_GRANITE107_DIMENSION', 384),
        sequenceLength: this.config.get<number>('EMBEDDING_GRANITE107_SEQUENCE_LENGTH', 128),
        enabled: true,
      });
    }
    if (this.config.get<boolean>('EMBEDDING_GRANITE278_ENABLED', true)) {
      configs.push({
        key: 'granite-278',
        onnxUrl: this.config.get<string>('EMBEDDING_GRANITE278_ONNX_URL', 'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/model.onnx'),
        tokenizerUrl: this.config.get<string>('EMBEDDING_GRANITE278_TOKENIZER_URL', 'https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/sentencepiece.bpe.model'),
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
  return 1 - dot; // vektory jsou L2-normalizované → cosine distance = 1 - dot
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=embedding-search.service.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/embedding-search.service.ts backend/src/modules/search/embedding-search.service.spec.ts
git commit -m "feat(search): EmbeddingSearchService - VP-Tree, chunking, hash-skip, async fronta"
```

---

## Task 9: MeiliSearchService

**Files:**
- Create: `backend/src/modules/search/meili-search.service.ts`
- Create: `backend/src/modules/search/meili-search.service.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/meili-search.service.spec.ts`:
```typescript
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
  MeiliSearch: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(mockIndex),
  })),
}));

describe('MeiliSearchService', () => {
  let service: MeiliSearchService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MeiliSearchService,
        {
          provide: ConfigService,
          useValue: { get: (k: string, d?: unknown) => ({ MEILI_HOST: 'http://localhost:7700', MEILI_API_KEY: 'test' }[k] ?? d) },
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
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=meili-search.service.spec --no-coverage
```

- [ ] **Krok 3: Implementuj MeiliSearchService**

`backend/src/modules/search/meili-search.service.ts`:
```typescript
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeiliSearch, Index } from 'meilisearch';
import type { ISearchProvider, SearchProviderInfo } from './interfaces/search-provider.interface';
import type { SearchResult } from './interfaces/search-result.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';

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
        searchableAttributes: ['titleExact', 'title', 'tableTitle', 'paragraphs', 'headers', 'values'],
        filterableAttributes: ['slug', 'worldId'],
        rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
        typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 6 } },
      });
      this.logger.log('MeiliSearch index nakonfigurován.');
    } catch (err) {
      this.logger.warn('Nelze nakonfigurovat MeiliSearch index (MeiliSearch běží?)', err);
    }

    try {
      await this.rebuildIndex();
    } catch (err) {
      this.logger.warn('Počáteční rebuild MeiliSearch selhal', err);
    }
  }

  async search(query: string, count: number): Promise<SearchResult[]> {
    try {
      const res = await this.index.search(query, { limit: count, showRankingScore: true });
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
    const docs = pages.map(this.toDocument);
    await this.index.addDocuments(docs);
    this.logger.log(`MeiliSearch: zaindexováno ${docs.length} stránek.`);
  }

  getInfo(): SearchProviderInfo {
    return { key: this.providerKey, displayName: this.displayName };
  }

  private toDocument(page: Page): Record<string, unknown> {
    const table = (page as any).table ?? {};
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      titleExact: page.title.toLowerCase(),
      tableTitle: table.title ?? '',
      paragraphs: page.plainText ?? '',
      headers: (table.headers ?? []).join(' '),
      values: (table.values ?? []).join(' '),
    };
  }
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=meili-search.service.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/meili-search.service.ts backend/src/modules/search/meili-search.service.spec.ts
git commit -m "feat(search): MeiliSearchService - full-text index, Czech tokenizace, startup rebuild"
```

---

## Task 10: SearchCoordinator

**Files:**
- Create: `backend/src/modules/search/search.coordinator.ts`
- Create: `backend/src/modules/search/search.coordinator.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/search.coordinator.spec.ts`:
```typescript
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
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=search.coordinator.spec --no-coverage
```

- [ ] **Krok 3: Implementuj SearchCoordinator**

`backend/src/modules/search/search.coordinator.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import type { ISearchProvider, SearchProviderInfo } from './interfaces/search-provider.interface';
import type { SearchResult } from './interfaces/search-result.interface';
import type { Page } from '../pages/interfaces/page.interface';

@Injectable()
export class SearchCoordinator {
  constructor(private readonly providers: ISearchProvider[]) {}

  async search(query: string, count: number, providerKey?: string): Promise<SearchResult[]> {
    if (providerKey && providerKey !== 'combined') {
      const provider = this.providers.find((p) => p.providerKey === providerKey);
      return provider ? provider.search(query, count) : [];
    }
    return this.combineResults(query, count);
  }

  private async combineResults(query: string, count: number): Promise<SearchResult[]> {
    const allResults = await Promise.all(this.providers.map((p) => p.search(query, count)));
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

  async deletePageFromIndex(slug: string): Promise<void> {
    await Promise.all(this.providers.map((p) => p.deletePageFromIndex(slug)));
  }

  async rebuildIndex(): Promise<void> {
    await Promise.all(this.providers.map((p) => p.rebuildIndex()));
  }
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=search.coordinator.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/search.coordinator.ts backend/src/modules/search/search.coordinator.spec.ts
git commit -m "feat(search): SearchCoordinator - round-robin kombinace, fasáda nad providery"
```

---

## Task 11: SearchController

**Files:**
- Create: `backend/src/modules/search/search.controller.ts`
- Create: `backend/src/modules/search/search.controller.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/search/search.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchCoordinator } from './search.coordinator';

const mockCoordinator = {
  search: jest.fn().mockResolvedValue([]),
  getProviders: jest.fn().mockReturnValue([{ key: 'combined', displayName: 'Combined' }]),
  addPageToIndex: jest.fn().mockResolvedValue(undefined),
  updatePageInIndex: jest.fn().mockResolvedValue(undefined),
  deletePageFromIndex: jest.fn().mockResolvedValue(undefined),
  rebuildIndex: jest.fn().mockResolvedValue(undefined),
};

const mockPagesRepo = {
  findBySlugs: jest.fn().mockResolvedValue([]),
  findByWorld: jest.fn().mockResolvedValue([]),
};

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchCoordinator, useValue: mockCoordinator },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
      ],
    }).compile();
    controller = module.get(SearchController);
  });

  it('search — volá coordinator.search se správnými parametry', async () => {
    mockCoordinator.search.mockResolvedValueOnce([{ slug: 'test', id: 't1', title: 'Test', score: 1, providerKey: 'meili', providerName: 'MeiliSearch' }]);
    mockPagesRepo.findByWorld.mockResolvedValueOnce([{ slug: 'test' }]);
    const result = await controller.search('hello', 5, undefined, 'world1');
    expect(mockCoordinator.search).toHaveBeenCalledWith('hello', 5, undefined);
    expect(result).toHaveLength(1);
  });

  it('getProviders — vrátí seznam providerů', () => {
    const result = controller.getProviders();
    expect(result[0].key).toBe('combined');
  });

  it('rebuild — vrátí 202', () => {
    const result = controller.rebuild();
    expect(mockCoordinator.rebuildIndex).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Rebuild zahájen.' });
  });
});
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=search.controller.spec --no-coverage
```

- [ ] **Krok 3: Implementuj SearchController**

`backend/src/modules/search/search.controller.ts`:
```typescript
import { Controller, Get, Post, Query, Body, Inject, HttpCode } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SearchCoordinator } from './search.coordinator';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';
import type { SearchResult } from './interfaces/search-result.interface';

@Controller('api/search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(
    private readonly coordinator: SearchCoordinator,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  @Get()
  async search(
    @Query('q') query: string,
    @Query('count') count = 5,
    @Query('provider') provider?: string,
    @Query('worldId') worldId?: string,
  ): Promise<SearchResult[]> {
    if (!query?.trim()) return [];
    const results = await this.coordinator.search(query, Number(count), provider);
    if (!worldId) return results;

    const worldPages = await this.pagesRepo.findByWorld(worldId);
    const validSlugs = new Set(worldPages.map((p) => p.slug));
    return results.filter((r) => validSlugs.has(r.slug));
  }

  @Get('providers')
  getProviders() {
    return this.coordinator.getProviders();
  }

  @Post('created')
  @HttpCode(200)
  async pageCreated(@Body() page: Page) {
    await this.coordinator.addPageToIndex(page);
    return { message: 'Page added to index.' };
  }

  @Post('updated')
  @HttpCode(200)
  async pageUpdated(@Body() page: Page) {
    await this.coordinator.updatePageInIndex(page);
    return { message: 'Page updated in index.' };
  }

  @Post('deleted')
  @HttpCode(200)
  async pageDeleted(@Body() slug: string) {
    await this.coordinator.deletePageFromIndex(slug);
    return { message: 'Page removed from index.' };
  }

  @Post('reindex')
  @HttpCode(202)
  async reindex(@Body() body: { slug?: string; pageId?: string }) {
    // Najdi stránku a zavolej update
    if (!body?.slug && !body?.pageId) return { message: 'Uveden slug nebo pageId.' };
    let page: Page | null = null;
    if (body.slug) {
      const pages = await this.pagesRepo.findAll({ slug: body.slug } as any);
      page = pages[0] ?? null;
    }
    if (!page && body.pageId) {
      page = await (this.pagesRepo as any).findById(body.pageId);
    }
    if (page) await this.coordinator.updatePageInIndex(page);
    return { message: 'Reindex zahájen.' };
  }

  @Post('rebuild')
  @HttpCode(202)
  rebuild() {
    void this.coordinator.rebuildIndex();
    return { message: 'Rebuild zahájen.' };
  }
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=search.controller.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/search.controller.ts backend/src/modules/search/search.controller.spec.ts
git commit -m "feat(search): SearchController - GET search, POST created/updated/deleted/reindex/rebuild"
```

---

## Task 12: StatsController

**Files:**
- Create: `backend/src/modules/stats/stats.controller.ts`
- Create: `backend/src/modules/stats/stats.controller.spec.ts`

- [ ] **Krok 1: Napiš failing test**

`backend/src/modules/stats/stats.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { StatsController } from './stats.controller';

const mockStatsRepo = {
  get: jest.fn().mockResolvedValue({ status: 'Everything embedded', vectorCount: 42 }),
};

const mockCoordinator = {
  rebuildIndex: jest.fn().mockResolvedValue(undefined),
  updatePageInIndex: jest.fn().mockResolvedValue(undefined),
};

const mockPagesRepo = {
  findAll: jest.fn().mockResolvedValue([]),
};

describe('StatsController', () => {
  let controller: StatsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        { provide: 'ISearchStatsRepository', useValue: mockStatsRepo },
        { provide: 'SearchCoordinator', useValue: mockCoordinator },
        { provide: 'IPagesRepository', useValue: mockPagesRepo },
      ],
    }).compile();
    controller = module.get(StatsController);
  });

  it('getSearchStats — vrátí stats z repository', async () => {
    const result = await controller.getSearchStats();
    expect(result.status).toBe('Everything embedded');
    expect(result.vectorCount).toBe(42);
  });

  it('triggerRebuild — spustí rebuild a vrátí 202', () => {
    controller.triggerRebuild();
    expect(mockCoordinator.rebuildIndex).toHaveBeenCalled();
  });
});
```

- [ ] **Krok 2: Spusť — ověř selhání**

```bash
cd backend && npm test -- --testPathPattern=stats.controller.spec --no-coverage
```

- [ ] **Krok 3: Implementuj StatsController**

`backend/src/modules/stats/stats.controller.ts`:
```typescript
import { Controller, Get, Post, Body, Inject, HttpCode } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SearchCoordinator } from '../search/search.coordinator';
import type { ISearchStatsRepository } from '../search/interfaces/search-stats-repository.interface';
import type { IPagesRepository } from '../pages/interfaces/pages-repository.interface';
import type { Page } from '../pages/interfaces/page.interface';

@Controller('api/stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(
    @Inject('ISearchStatsRepository') private readonly statsRepo: ISearchStatsRepository,
    @Inject('SearchCoordinator') private readonly coordinator: SearchCoordinator,
    @Inject('IPagesRepository') private readonly pagesRepo: IPagesRepository,
  ) {}

  @Get('search')
  async getSearchStats() {
    return this.statsRepo.get();
  }

  @Post('search/rebuild')
  @HttpCode(202)
  triggerRebuild() {
    void this.coordinator.rebuildIndex();
    return { message: 'Rebuild zahájen.' };
  }

  @Post('search/reindex')
  @HttpCode(202)
  async triggerReindex(@Body() body: { slug?: string; pageId?: string }) {
    if (!body?.slug && !body?.pageId) return { message: 'Uveden slug nebo pageId.' };
    let page: Page | null = null;
    if (body.slug) {
      const pages = await this.pagesRepo.findAll({ slug: body.slug } as any);
      page = pages[0] ?? null;
    }
    if (!page && body.pageId) {
      page = await (this.pagesRepo as any).findById(body.pageId);
    }
    if (page) await this.coordinator.updatePageInIndex(page);
    return { message: 'Reindex zahájen.' };
  }
}
```

- [ ] **Krok 4: Spusť test**

```bash
cd backend && npm test -- --testPathPattern=stats.controller.spec --no-coverage
```

Očekáváno: PASS

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/stats/ 
git commit -m "feat(search): StatsController - GET search stats, POST rebuild, POST reindex"
```

---

## Task 13: SearchModule + StatsModule + app.module.ts

**Files:**
- Create: `backend/src/modules/search/search.module.ts`
- Create: `backend/src/modules/stats/stats.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Krok 1: Vytvoř SearchModule**

`backend/src/modules/search/search.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PageEmbeddingSchemaClass, PageEmbeddingSchema } from './schemas/page-embedding.schema';
import { SearchIndexStatsSchemaClass, SearchIndexStatsSchema, IndexingFailureSchemaClass, IndexingFailureSchema } from './schemas/search-index-stats.schema';
import { MongoPageEmbeddingRepository } from './repositories/page-embedding.repository';
import { MongoSearchStatsRepository } from './repositories/search-stats.repository';
import { EmbeddingSearchService } from './embedding-search.service';
import { MeiliSearchService } from './meili-search.service';
import { SearchCoordinator } from './search.coordinator';
import { SearchController } from './search.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PageEmbeddingSchemaClass.name, schema: PageEmbeddingSchema },
      { name: SearchIndexStatsSchemaClass.name, schema: SearchIndexStatsSchema },
      { name: IndexingFailureSchemaClass.name, schema: IndexingFailureSchema },
    ]),
  ],
  controllers: [SearchController],
  providers: [
    { provide: 'IPageEmbeddingRepository', useClass: MongoPageEmbeddingRepository },
    { provide: 'ISearchStatsRepository', useClass: MongoSearchStatsRepository },
    EmbeddingSearchService,
    MeiliSearchService,
    {
      provide: SearchCoordinator,
      useFactory: (meili: MeiliSearchService, embedding: EmbeddingSearchService) =>
        new SearchCoordinator([meili, embedding]),
      inject: [MeiliSearchService, EmbeddingSearchService],
    },
  ],
  exports: [SearchCoordinator, 'ISearchStatsRepository'],
})
export class SearchModule {}
```

- [ ] **Krok 2: Vytvoř StatsModule**

`backend/src/modules/stats/stats.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';

@Module({
  controllers: [StatsController],
})
export class StatsModule {}
```

- [ ] **Krok 3: Přidej SearchModule a StatsModule do app.module.ts**

Otevři `backend/src/app.module.ts` a přidej importy:

```typescript
// Přidej na začátek imports sekce:
import { SearchModule } from './modules/search/search.module';
import { StatsModule } from './modules/stats/stats.module';

// V @Module imports[] přidej:
SearchModule,
StatsModule,
```

- [ ] **Krok 4: Zkompiluj — ověř žádné TS chyby**

```bash
cd backend && npm run build 2>&1 | head -40
```

Očekáváno: build projde bez chyb

- [ ] **Krok 5: Commitni**

```bash
git add backend/src/modules/search/search.module.ts backend/src/modules/stats/stats.module.ts backend/src/app.module.ts
git commit -m "feat(search): SearchModule + StatsModule, registrace v AppModule"
```

---

## Task 14: Integrace do PagesService

**Files:**
- Modify: `backend/src/modules/pages/pages.service.ts`
- Modify: `backend/src/modules/pages/pages.service.spec.ts` (přidat mock pro SearchCoordinator)

- [ ] **Krok 1: Přečti stávající pages.service.ts**

```bash
cat backend/src/modules/pages/pages.service.ts | head -60
```

Zapiš si kde jsou metody `create`, `update`, `delete`.

- [ ] **Krok 2: Přidej SearchCoordinator do konstruktoru PagesService**

V `pages.service.ts`:
```typescript
// Přidej import
import { SearchCoordinator } from '../search/search.coordinator';

// V konstruktoru přidej volitelný inject (optional: aby testy bez SearchModule prošly):
constructor(
  // ... stávající parametry ...
  @Optional() @Inject(SearchCoordinator) private readonly searchCoordinator?: SearchCoordinator,
) {}
```

Importy na začátek:
```typescript
import { Optional, Inject } from '@nestjs/common';
```

- [ ] **Krok 3: Přidej indexaci po create**

V metodě `create` (nebo `createPage`) na konci před return přidej:
```typescript
void this.searchCoordinator?.addPageToIndex(savedPage);
```

- [ ] **Krok 4: Přidej indexaci po update**

V metodě `update` na konci:
```typescript
void this.searchCoordinator?.updatePageInIndex(updatedPage);
```

- [ ] **Krok 5: Přidej mazání z indexu po delete**

V metodě `delete` (nebo `deletePage`) před smazáním získej slug a po smazání:
```typescript
void this.searchCoordinator?.deletePageFromIndex(slug);
```

- [ ] **Krok 6: Spusť testy pages modulu — ověř žádné regrese**

```bash
cd backend && npm test -- --testPathPattern=pages --no-coverage
```

Očekáváno: všechny testy PASS (SearchCoordinator je Optional → existující testy bez něj projdou)

- [ ] **Krok 7: Commitni**

```bash
git add backend/src/modules/pages/pages.service.ts
git commit -m "feat(search): PagesService integrace - backend-driven indexace při create/update/delete"
```

---

## Task 15: Roadmap update + celkové testy

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Krok 1: Spusť všechny testy**

```bash
cd backend && npm test -- --no-coverage 2>&1 | tail -20
```

Očekáváno: všechny testy PASS

- [ ] **Krok 2: Zkompiluj projekt**

```bash
cd backend && npm run build 2>&1 | tail -10
```

Očekáváno: Compilation successful

- [ ] **Krok 3: Aktualizuj roadmap**

V `docs/roadmap.md` v sekci Krok 14 změň checkboxy na ✅ a přidej links na spec a plán:

```markdown
## Krok 14 — Vyhledávání ✅

### Full-text Search (MeiliSearch)
- [x] Zvolená technologie: **MeiliSearch**
- [x] Indexovaná pole: slug, title (titleExact 100, title 15), paragraphs (5), tableTitle (5), headers (3), values (3)
- [x] Czech tokenizace, typo tolerance, prefix matching
- [x] Rebuild při startu; inkrementální add/update/delete

### Embedding Search (ONNX Granite)
- [x] Zvolená technologie: **onnxruntime-node + Granite modely (sentencepiece-js)**
- [x] PageEmbedding schema: pageId, slug, modelKey, pageHash, chunkId, chunkTitle, chunkPreview, chunkOrder, vector, createdAt
- [x] Chunking: 750 znaků s překryvem 250
- [x] Hash-skip: přeskoč re-embedding pokud pageHash nezměněn
- [x] Async fronta (EmbeddingQueue): Upsert/Delete/Rebuild + rebuild-backlog
- [x] Stavový automat: Unknown → Starting → Scanning → Embedding → EverythingEmbedded | Rebuilding

### SearchCoordinator
- [x] Fasáda nad oběma providery
- [x] Kombinace výsledků round-robin s deduplikací
- [x] Mutations jdou do obou providerů
- [x] GET /api/search?q=&count=5&provider=&worldId=
- [x] GET /api/search/providers
- [x] POST /api/search/created, /updated, /deleted
- [x] POST /api/search/reindex, /rebuild

### Stats
- [x] SearchIndexStats + IndexingFailure schema
- [x] GET /api/stats/search, POST /api/stats/search/rebuild, POST /api/stats/search/reindex

### Integrace
- [x] PagesService volá SearchCoordinator při create/update/delete (backend-driven)

**Spec:** [docs/superpowers/specs/2026-05-05-krok-14-vyhledavani-design.md](superpowers/specs/2026-05-05-krok-14-vyhledavani-design.md)
**Plán:** [docs/superpowers/plans/2026-05-05-krok-14-vyhledavani.md](superpowers/plans/2026-05-05-krok-14-vyhledavani.md)
```

V tabulce stavu změň `⬜` → `✅` pro řádek 14.

- [ ] **Krok 4: Finální commit**

```bash
git add docs/roadmap.md
git commit -m "docs(roadmap): Krok 14 Vyhledávání označen jako ✅"
```

---

## Poznámky k nasazení

**MeiliSearch** musí běžet jako separátní proces. Pro lokální vývoj:
```bash
# Docker
docker run -d -p 7700:7700 getmeili/meilisearch:latest

# Nebo přímý download z https://www.meilisearch.com/docs/learn/getting_started/installation
```

**ONNX modely** (408MB + 5MB) se stahují při prvním startu do `data/model_cache/`. Na produkci doporučeno předstáhnout nebo namountovat volume.

**Env proměnné** pro produkci — viz sekce Konfigurace ve spec dokumentu.
