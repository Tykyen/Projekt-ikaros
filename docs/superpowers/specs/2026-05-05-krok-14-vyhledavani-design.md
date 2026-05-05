# Krok 14 — Vyhledávání: Design Spec

**Datum:** 2026-05-05  
**Stav:** Schváleno

---

## Přehled

Implementace full-text search (náhrada Lucene) pomocí MeiliSearch a sémantického embedding search pomocí lokálních ONNX Granite modelů. Oba providery jsou zapouzdřeny za `SearchCoordinator` fasádou, která kombinuje výsledky round-robin. Integrace s `PagesService` je backend-driven — `PagesService` volá `SearchCoordinator` přímo při create/update/delete.

---

## Architektura

### Struktura modulu

```
src/modules/search/
├── search.module.ts
├── search.controller.ts
├── search.coordinator.ts
├── meili-search.service.ts
├── embedding-search.service.ts
├── model-runtime.ts
├── embedding-queue.ts
├── search-stats.service.ts
└── schemas/
    ├── page-embedding.schema.ts
    └── search-index-stats.schema.ts

src/modules/stats/
├── stats.module.ts
└── stats.controller.ts
```

### Závislosti (npm)

- `meilisearch` — MeiliSearch TypeScript klient
- `onnxruntime-node` — lokální ONNX inference
- `@huggingface/tokenizers` — SentencePiece BPE tokenizace
- `vptree` — VP-Tree implementace pro nearest-neighbor vyhledávání

### Integrace s PagesService

`PagesService` dostane injektovaný `SearchCoordinator`. Při každé mutaci stránky:

```
POST /api/worlds/:worldId/pages → PagesService.create() → coordinator.addPageToIndex(page)
PUT  /api/worlds/:worldId/pages → PagesService.update() → coordinator.updatePageInIndex(page)
DELETE /api/worlds/:worldId/pages → PagesService.delete() → coordinator.deletePageFromIndex(slug)
```

Webhookové endpoints na `SearchController` (`/api/search/created`, `/updated`, `/deleted`) zůstanou jako manuální fallback pro external/frontend volání.

---

## Full-text Search (MeiliSearch)

### Indexovaná pole a váhy

| Pole | Obsah | Relevance boost |
|------|-------|----------------|
| `title` | `page.title` | 15 |
| `titleExact` | `page.title.toLowerCase()` | 100 (přesná shoda) |
| `tableTitle` | `page.table.title` | 5 |
| `paragraphs` | `page.plainText` | 5 |
| `headers` | `page.table.headers` (join) | 3 |
| `values` | `page.table.values` (join) | 3 |
| `id` | `page._id` | store only |
| `slug` | `page.slug` | store only |

### Chování

- Czech tokenizace — MeiliSearch nativní podpora
- Typo tolerance — náhrada Lucene fuzzy (fuzziness 1–2 dle délky dotazu)
- Prefix matching — náhrada EdgeNGram
- Per-world filtrování: výsledky se filtrují na slugy patřící do `worldId`; výchozí = Matrix world
- Index je jeden globální (ne per world); worldId filtr se aplikuje na výsledcích

### Startup

Při inicializaci `MeiliSearchService` → `rebuildIndex()`:
1. Načte všechny stránky přes `PagesRepository.findAll()`
2. Zaindexuje dávkově do MeiliSearch

### Inkrementální update

- `addPageToIndex(page)` — upsert dokumentu
- `updatePageInIndex(page)` — upsert dokumentu (přepíše)
- `deletePageFromIndex(slug)` — smaže dokument dle slug

---

## Embedding Search (ONNX Granite)

### ModelRuntime

Zapouzdřuje ONNX inferenci a tokenizaci pro jeden model:

- `onnxruntime-node` — `InferenceSession` pro `.onnx` soubor
- `@huggingface/tokenizers` — načtení SentencePiece BPE tokenizeru (`.model` soubor)
- Sekvence se ořízne na `sequenceLength` (výchozí 128)
- Výstup: float32 vektor → L2 normalizace (pro cosine similarity)

### Konfigurace modelů

Dva Granite modely z `appsettings` původního systému:

| Klíč | URL | Dimenze | SequenceLength |
|------|-----|---------|----------------|
| `granite-107` | `https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/model.onnx` | 384 | 128 |
| `granite-278` | `https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/model.onnx` | 768 | 128 |

Tokenizery:
- `granite-107`: `.../onnx_granite_107/sentencepiece.bpe.model`
- `granite-278`: `.../onnx_granite_278/sentencepiece.bpe.model`

### ModelPathResolver — cache

Při startu pro každý model:
1. Vypočítej SHA-256 hash URL
2. Pokud `data/model_cache/{hash}.onnx` existuje → přeskoč stahování
3. Jinak stáhni → ulož do cache; loguj progress po 10 %

### Chunking stránek

Sestavení textu per stránku:
1. `# {title}\n`
2. `plainText`
3. Pro každý řádek tabulky: `{header}: {value}` (HTML tagy odstraněny)

Parametry chunkování:
- `chunkSize`: 750 znaků
- `chunkOverlap`: 250 znaků
- `step = chunkSize - chunkOverlap = 500`
- Hranice chunků respektují Unicode (nekrájí uprostřed znaku)
- ChunkId: `{pageId}-{chunkIndex}`
- ChunkTitle: první chunk = název stránky; další = `{název} (část {n+1})`
- ChunkPreview: prvních 200 znaků + `…`

### Hash-skip

Před embedováním:
- `pageHash = SHA-256(JSON({ title, plainText, table, accessRequirements }))[0..8]`  
- Pokud hash == uložený hash v MongoDB → přeskoč (`IndexingOutcome.NoChange`)

### VP-Tree in-memory

Pro každý model `ModelIndex`:
- `documents: PageEmbedding[]` — načteno z MongoDB
- `normalizedVectors: Float32Array[]` — L2-normalizované vektory
- `tree: VpTree` — VP-Tree s cosine vzdáleností

Vyhledávání: `query → embed → L2-normalize → VpTree.search(queryVector, count) → seřadit dle score = 1.0 - distance`

Po každé změně (Upsert/Delete) → `rebuildIndexForModel()` (přestaví VP-Tree).

### Async fronta (EmbeddingQueue)

Operace:
- `Upsert(page)` — přidej/aktualizuj embeddingy stránky
- `Delete(slug)` — smaž embeddingy stránky
- `Rebuild` — full rebuild všech stránek

Implementace: Node.js `EventEmitter` + async smyčka (single reader, unbounded).

Rebuild-backlog: při aktivním `Rebuild` se příchozí `Upsert`/`Delete` odkládají do backlogu; po dokončení rebuildu se vrátí zpět do fronty.

Rebuild lze přerušit novým `Rebuild` požadavkem (zruší aktuální přes `AbortController`).

### Startup sekvence

1. `initializeModelsAsync()` — načte/stáhne ONNX modely a tokenizery
2. `loadExistingEmbeddingsAsync()`:
   - Pro každý model: načte vektory z MongoDB → postaví VP-Tree
   - `catchUpEmbeddings()`: projde všechny stránky, porovná hashe; stránky se změnou zařadí do fronty `Upsert`

---

## SearchCoordinator

Fasáda nad `MeiliSearchService` a `EmbeddingSearchService`.

### Vyhledávání

- Bez `providerKey` nebo `providerKey = "combined"` → `combineResults()`
- S konkrétním klíčem → deleguje přímo na provider

### Round-robin kombinace výsledků

```
kolo 0: meili[0], embedding[0]
kolo 1: meili[1], embedding[1]
...
```

Deduplikace klíčem `slug` nebo `id`. Smyčka běží dokud není dosažen `count` nebo nejsou vyčerpány výsledky.

### Mutace indexu

`add/update/delete/rebuild` volá na **všech** providerech najednou (paralelně).

### SearchResult

```typescript
interface SearchResult {
  id: string;        // pageId nebo chunkId
  title: string;
  slug: string;
  score: number;
  providerKey: string;
  providerName: string;
}
```

### SearchProviderInfo

```typescript
interface SearchProviderInfo {
  key: string;
  displayName: string;
}
// GET /api/search/providers vrátí: ["combined", "meili", "embedding"]
```

---

## SearchIndexStats (MongoDB)

Kolekce `search_index_stats`, 1 dokument s `id = "embedding-search"`.

```typescript
interface SearchIndexStats {
  id: string;
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

enum SearchIndexStatus {
  Unknown = 'Unknown',
  Starting = 'Starting',
  Scanning = 'Scanning pages for outdated embeddings',
  Embedding = 'Embedding in progress',
  EverythingEmbedded = 'Everything embedded',
  Rebuilding = 'Rebuilding index',
}
```

Kolekce `indexing_failures`:

```typescript
interface IndexingFailure {
  pageId: string;
  slug: string;
  error: string;
  timestamp: Date;
}
```

---

## PageEmbedding schema (MongoDB)

Kolekce `page_embeddings` — identická se starým systémem (přímá migrace bez konverze).

```typescript
interface PageEmbedding {
  _id: ObjectId;
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
```

Index: `(pageId, modelKey)` pro rychlé mazání per-stránka.

---

## REST API

### SearchController (`/api/search`)

| Metoda | Endpoint | Auth | Popis |
|--------|----------|------|-------|
| GET | `/api/search` | JWT | `?q=&count=5&provider=&worldId=` |
| GET | `/api/search/providers` | JWT | Seznam providerů |
| POST | `/api/search/created` | JWT | Přidej stránku do indexu |
| POST | `/api/search/updated` | JWT | Aktualizuj stránku v indexu |
| POST | `/api/search/deleted` | JWT | Odstraň stránku z indexu |
| POST | `/api/search/reindex` | JWT (PJ+) | `{ slug?, pageId? }` → reindex jedné stránky, 202 |
| POST | `/api/search/rebuild` | JWT (Admin+) | Full rebuild, 202 Accepted |

### StatsController (`/api/stats`)

| Metoda | Endpoint | Auth | Popis |
|--------|----------|------|-------|
| GET | `/api/stats/search` | JWT | Aktuální stav indexace |
| POST | `/api/stats/search/rebuild` | JWT (Admin+) | Spustí full rebuild, 202 |
| POST | `/api/stats/search/reindex` | JWT (PJ+) | `{ slug?, pageId? }` → reindex jedné stránky, 202 |

---

## Konfigurace (env)

```
MEILI_HOST=http://localhost:7700
MEILI_API_KEY=masterKey

EMBEDDING_GRANITE107_ONNX_URL=https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/model.onnx
EMBEDDING_GRANITE107_TOKENIZER_URL=https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/sentencepiece.bpe.model
EMBEDDING_GRANITE107_DIMENSION=384
EMBEDDING_GRANITE107_SEQUENCE_LENGTH=128
EMBEDDING_GRANITE107_ENABLED=true

EMBEDDING_GRANITE278_ONNX_URL=https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/model.onnx
EMBEDDING_GRANITE278_TOKENIZER_URL=https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/sentencepiece.bpe.model
EMBEDDING_GRANITE278_DIMENSION=768
EMBEDDING_GRANITE278_SEQUENCE_LENGTH=128
EMBEDDING_GRANITE278_ENABLED=true

EMBEDDING_MODEL_CACHE_DIR=data/model_cache
EMBEDDING_CHUNK_SIZE=750
EMBEDDING_CHUNK_OVERLAP=250
```

---

## Rozhodnutí a odůvodnění

| Rozhodnutí | Volba | Důvod |
|-----------|-------|-------|
| Full-text engine | MeiliSearch | Lucene není dostupné v Node.js; MeiliSearch má Czech support, typo-tolerance, prefix matching |
| Embedding | onnxruntime-node + Granite | Původní modely jsou dostupné; existující `page_embeddings` v MongoDB jsou kompatibilní — žádný rebuild při migraci |
| Tokenizace | @huggingface/tokenizers | SentencePiece BPE — stejný formát jako originál |
| VP-Tree | In-memory JS | Identický pattern jako originál; jednoduché pro daný objem dat |
| Fronta | EventEmitter + async loop | Žádný Redis/Bull není v projektu; dostatečné pro sériové zpracování embeddingů |
| Integrace s Pages | Backend-driven (PJ2 injekce) | Robustnější než frontend webhooky; manuální endpoints zůstanou jako fallback |
