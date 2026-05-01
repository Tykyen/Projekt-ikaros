# AI Embedding vyhledávání

## Přehled

`EmbeddingSearchService` je partial class rozdělená do 7 souborů. Implementuje sémantické vyhledávání pomocí ONNX modelů. Vektory jsou ukládány v MongoDB, v paměti je VP-Tree pro rychlé nearest-neighbor dotazy.

Provider klíč: `"embedding"`, DisplayName: dle konfigurace modelu.

---

## ONNX model (ModelRuntime)

Vnitřní třída `ModelRuntime` zapouzdřuje:
- `InferenceSession` (Microsoft.ML.OnnxRuntime)
- `XLMRobertaTokenizer` (Lokad.Tokenizers) — kompatibilní s XLM-RoBERTa / Granite modely

Tokeny se oříznou na `SequenceLength` (výchozí 128), nevyužité pozice mají `attention_mask = 0`. Model vrací tensor `sentence_embedding`; pokud takový výstup neexistuje, použije první výstup.

### L2 normalizace

Výstupní float vektor se normalizuje na L2 normu (pro cosine similarity):

```csharp
normalized[i] = vector[i] / sqrt(sum(v^2))
```

---

## EmbeddingModelConfiguration

| Pole | Výchozí | Popis |
|---|---|---|
| `Key` | — | Klíč modelu (unikátní identifikátor) |
| `DisplayName` | — | Zobrazované jméno |
| `OnnxModelPath` | — | Cesta nebo HTTP URL k `.onnx` souboru |
| `TokenizerModelPath` | — | Cesta nebo HTTP URL k tokenizeru |
| `SequenceLength` | 128 | Max délka tokenu |
| `EmbeddingDimension` | 384 | Dimenze výstupního vektoru |
| `ChunkSizeCharacters` | 1500 | Max délka chunku v znacích |
| `ChunkOverlapCharacters` | 250 | Překryv sousedních chunků |
| `Enabled` | true | Aktivace modelu |
| `BatchSize` | 1 | Dávka (zatím zpracování po 1) |

Konfigurace v `appsettings.json`:

```json
{
  "Search": {
    "Embedding": {
      "DefaultResultCount": 10,
      "MaxParallelism": 2,
      "Models": [
        {
          "Key": "granite",
          "DisplayName": "Granite Embedding",
          "OnnxModelPath": "cesta/nebo/url.onnx",
          "TokenizerModelPath": "cesta/nebo/url.tokenizer",
          "SequenceLength": 128,
          "EmbeddingDimension": 384,
          "ChunkSizeCharacters": 1500,
          "ChunkOverlapCharacters": 250,
          "Enabled": true,
          "BatchSize": 1
        }
      ]
    }
  }
}
```

---

## ModelPathResolver — načítání modelu

Pokud `OnnxModelPath` nebo `TokenizerModelPath` jsou HTTP/HTTPS URL, `ModelPathResolver.ResolveAsync()` soubor stáhne do `data/model_cache/`. Název souboru v cache = SHA-256 hash URL + původní přípona. Pokud soubor v cache existuje, přeskočí stahování. Stahování loguje progress po 10 % krocích.

---

## Chunking stránek

`ChunkPage(page, config)` sestaví textový obsah:
1. `# {title}\n`
2. `plainText`
3. Tabulka: `{header}: {value}` pro každý řádek (HTML tagy odstraněny přes `WebUtility.HtmlDecode` + regex)

Výsledek se rozdělí na překrývající se chunky:
- `step = ChunkSizeCharacters - ChunkOverlapCharacters`
- Hranice chunků respektují Unicode rune boundaries (surrogate pairs)
- Každý chunk dostane ID `{pageId}-{chunkIndex}`
- Název prvního chunku = název stránky, dalších = `{název} (část {n+1})`
- Preview chunku = prvních 200 runes + `…`

---

## Vektory a VP-Tree

Po vygenerování embedding vektoru se uloží do MongoDB kolekce `PageEmbeddings` jako dokument `PageEmbedding`:

| Pole | Popis |
|---|---|
| `PageId` | ID stránky |
| `Slug` | Slug stránky |
| `ModelKey` | Klíč modelu |
| `PageHash` | Hash obsahu stránky (pro detekci změn) |
| `ChunkId` | `{pageId}-{chunkIndex}` |
| `ChunkTitle` | Název chunku |
| `ChunkPreview` | Prvních 200 runes obsahu |
| `ChunkOrder` | Pořadí chunku |
| `Vector` | Float[] embedding vektor |
| `CreatedAt` | Čas vytvoření |

V paměti je pro každý model `ModelIndex`:
- `Documents` — list `PageEmbedding` z MongoDB
- `NormalizedVectors` — L2-normalizované vektory
- `Tree` — VP-Tree (Vantage Point Tree) s Cosine vzdáleností (knihovna Accord.Math)

Vyhledávání: query text → ONNX embedding → L2-normalizace → `VpTree.Search(queryVector, count)` → výsledky seřazené sestupně podle `score = 1.0 - distance`.

---

## Fronta indexace (Channel)

Operace indexování probíhají asynchronně přes `Channel<PageIndexOperation>` (unbounded, single reader). Typy operací:
- `Upsert` — přidej/aktualizuj stránku
- `Delete` — smaž stránku podle slugu
- `Rebuild` — plný rebuild

Pozadí zpracovává `ProcessQueueAsync()` v `Task.Run`. Pokud je aktivní rebuild, `Upsert`/`Delete` operace se odkládají do `_rebuildBacklog` (ConcurrentQueue) a po dokončení rebuildu se vrátí zpět do kanálu (`RequeueDeferredOperations`).

Rebuild lze zrušit (`CancellationTokenSource _activeRebuildCts`) — nový požadavek na rebuild zruší aktuální a naplánuje nový.

### Hash-based skip

Před každým embedováním se spočítá `ComputePageHash(page)` = SHA-256 prvních 8 hex znaků z JSON serializace polí `{title, plainText, paragraphs, table, accessRequirements}`. Pokud hash odpovídá uloženému, embedding se přeskočí (`IndexingOutcome.NoChange`).

---

## Průběh indexace

### Startup

1. `InitializeModelsAsync()` — načte ONNX modely (stahuje pokud jsou URL)
2. `LoadExistingEmbeddingsAsync()`:
   - Pro každý model zavolá `RebuildIndexForModelAsync()` — načte vektory z MongoDB do paměti a postaví VP-Tree
   - Zavolá `CatchUpEmbeddingsAsync()` (startup catchup) — prochází všechny stránky, porovnává uložené hashe s aktuálními; stránky s odlišným hashem nebo bez embeddingu zařadí do fronty Upsert

### Inkrementální update (kanál)

- `AddPageToIndex` / `UpdatePageInIndex` → `QueueOperation(Upsert)` → pozadí zavolá `IndexPageForModelAsync` pro každý model
- `DeletePageFromIndex` → `QueueOperation(Delete)` → pozadí smaže záznamy z MongoDB a přestaví VP-Tree
- Po každé změně se VP-Tree přestaví voláním `RebuildIndexForModelAsync`

### Full rebuild — sekvence

1. `QueueOperation(Rebuild)` → pozadí zavolá `ProcessRebuildAsync`
2. `DeleteManyAsync({})` — smaže všechny vektory z MongoDB
3. Všechny `_indices` se resetují na prázdný `ModelIndex`
4. Pro každou stránku × každý model → `IndexPageForModelAsync` (chunk → embed → persist)
5. Po dokončení všech stránek → `RebuildIndexForModelAsync` pro každý model (přestaví VP-Tree)
6. Odložené operace z backlogu se vrátí do kanálu

---

## SearchIndexStatus — stavy

| Konstanta | Hodnota |
|---|---|
| `Unknown` | `"Unknown"` |
| `Starting` | `"Starting"` |
| `Scanning` | `"Scanning pages for outdated embeddings"` |
| `Embedding` | `"Embedding in progress"` |
| `EverythingEmbedded` | `"Everything embedded"` |
| `Rebuilding` | `"Rebuilding index"` |

Stav je persistován do MongoDB přes `StatsService` do kolekce `SearchIndexStats` (dokument s `Id = "embedding-search"`). Obsahuje také:

| Pole | Popis |
|---|---|
| `ScanningProcessedPages` | Počet zpracovaných stránek při skenování |
| `ScanningTotalPages` | Celkový počet stránek ke skenování |
| `IndexedPages` | Počet indexovaných stránek |
| `VectorCount` | Celkový počet vektorů |
| `LastEmbeddedPageSlug` | Slug naposledy embedované stránky |
| `LastEmbeddedAtUtc` | Čas posledního embeddingu |
| `PendingPages` | Počet stránek čekajících na embedding |
| `FailedIndexings` | Neúspěšné indexace (uloženy separátně, v `SearchIndexStats` ignorovány přes `[BsonIgnore]`) |
