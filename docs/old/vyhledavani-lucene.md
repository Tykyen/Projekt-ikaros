# Lucene fulltextové vyhledávání

## ISearchService — rozhraní provideru

Každý vyhledávací provider implementuje `ISearchService`:

```csharp
public interface ISearchService
{
    string ProviderKey { get; }
    string DisplayName { get; }
    List<SearchResult> Search(string queryText, int count = 5);
    void AddPageToIndex(Page page);
    void UpdatePageInIndex(Page page);
    void DeletePageFromIndex(string slug);
    void RebuildIndex();
}
```

Registrované implementace: `LuceneSearchService` (klíč `"lucene"`) a `EmbeddingSearchService` (klíč `"embedding"`).

---

## SearchCoordinator — fasáda

`SearchCoordinator` implementuje `ISearchCoordinator` a je injektován do controlleru. Drží seznam všech `ISearchService` providerů a vystavuje jednotné API.

- Při dotazu bez `providerKey` (nebo s hodnotou `"combined"`) volá `CombineResults`.
- Při dotazu s konkrétním klíčem deleguje přímo na daný provider.
- Mutace indexu (`Add`, `Update`, `Delete`, `Rebuild`) volá na **všech** providerech najednou (foreach).

### Round-robin kombinace výsledků

`CombineResults` iteruje výsledky všech providerů po kolech, ne po blocích. V každém kole vezme `i`-tý výsledek od každého provideru a přidá ho do výsledného seznamu, pokud ještě není přítomen. Deduplikace klíčem `slug:`, `id:`, nebo `title:`. Smyčka běží dokud není dosažen `count` nebo nejsou vyčerpány výsledky všech providerů.

```
kolo 0: lucene[0], embedding[0]
kolo 1: lucene[1], embedding[1]
...
```

---

## SearchResult — model výsledku

| Pole | Typ | Popis |
|---|---|---|
| `id` | string | ID stránky nebo ID chunku (u embeddingů `{pageId}-{chunkIndex}`) |
| `title` | string | Název stránky |
| `slug` | string | Slug stránky |
| `score` | float | Relevance skóre |
| `providerKey` | string | `"lucene"` nebo `"embedding"` |
| `providerName` | string | Zobrazované jméno provideru |

### SearchProviderInfo

Jednoduchý record: `(string Key, string DisplayName)`. Seznam providerů vrací `GET /api/search/providers`, vždy obsahuje `"combined"` jako první položku, pak všechny reálné providery.

---

## Lucene — implementace

### In-memory RAMDirectory

Index je uložen výhradně v paměti (`RAMDirectory`). Při startu se okamžitě zavolá `RebuildIndex()`, který načte stránky přes `PagesService.GetToIndex()` a postaví index. Žádná persistentní cesta na disk neexistuje — restart serveru = prázdný index do doby rebuildu.

### Lucene verze a analyzátor

- Verze: `LUCENE_48`
- Výchozí analyzátor: `CzechSearchAnalyzer` (vlastní implementace, podporuje českou morfologii)
- Per-field override:
  - `titleNGrams` → `EdgeNGramAnalyzer` (prefix matching)
  - `titleExact` → `KeywordAnalyzer` (přesná shoda bez tokenizace)

### Indexovaná pole a váhy

| Pole Lucene | Obsah | Boost při dotazu |
|---|---|---|
| `id` | `page.id` | — (Store.YES, nelze vyhledat standardně) |
| `slug` | `page.slug` | — (Store.YES) |
| `title` | `page.title` | **15.0** |
| `titleNGrams` | `page.title` (EdgeNGram) | 4.0 |
| `titleExact` | `page.title.ToLowerInvariant()` (KeywordAnalyzer) | **100.0** (extra query) |
| `tableTitle` | `page.table.title` | 5.0 |
| `paragraphs` | `page.plainText` | 5.0 |
| `headers` | `page.table.headers` (join) | 3.0 |
| `values` | `page.table.values` (join) | 3.0 |

`id` a `slug` jsou `StringField` (Store.YES), ostatní `TextField`.

### Sestavení dotazu

1. `MultiFieldQueryParser` s výše uvedenými boosty, operátor OR.
2. Přidán `TermQuery` na `titleExact` s boostem 100 (přesná shoda názvu).
3. Pro dotazy délky ≥ 4 znaků: fuzzy dotazy na `title` (boost 2.0) a `titleNGrams` (boost 3.0).
   - Fuzziness = 1 pro délku 4–5, fuzziness = 2 pro délku ≥ 6.
4. Výsledný `BooleanQuery` kombinuje všechny varianty přes `SHOULD`.

Pokud `QueryParser.Parse()` selže (špatná syntaxe), fallback na prostý `TermQuery` na `title`.

### Vracení výsledků

- Výchozí `count = 5` → vrátí top 5.
- Jiný `count` → nejprve spočítá `TotalHits`, pak vrátí všechny výsledky.

### Thread safety

Mutace indexu (`AddPageToIndex`, `UpdatePageInIndex`, `DeletePageFromIndex`) jsou obaleny `lock(_indexLock)` před `_writer.Commit()`.

---

## Průběh indexace

1. Při startu `LuceneSearchService` → `RebuildIndex()` → `_writer.DeleteAll()` + `IndexPages()`
2. `IndexPages()` načte stránky přes `PagesService.GetToIndex()`, vytvoří dokumenty **paralelně** (`AsParallel().Select(...)`) a vloží je přes `_writer.AddDocuments(docs)` + `Flush` + `Commit`
3. Inkrementální update:
   - `AddPageToIndex` — `AddDocument` + `Commit` pod lockem
   - `UpdatePageInIndex` — `UpdateDocument` podle `id` + `Commit` pod lockem
   - `DeletePageFromIndex` — `DeleteDocuments` podle `slug` + `Commit` pod lockem

---

## API endpointy (SearchController)

Základní route: `api/search`

| Metoda | Endpoint | Parametry | Popis |
|---|---|---|---|
| GET | `/api/search` | `query` (req), `count=5`, `provider?`, `worldId?` | Vyhledá stránky. Filtruje výsledky na slugy patřící do světa `worldId` (nebo `MatrixWorldId` jako výchozí). |
| GET | `/api/search/providers` | — | Vrátí seznam providerů (`SearchProviderInfo[]`): `combined`, `lucene`, `embedding`. |
| POST | `/api/search/created` | body: `Page` | Přidá stránku do indexu všech providerů. |
| POST | `/api/search/updated` | body: `Page` | Aktualizuje stránku v indexu všech providerů. |
| POST | `/api/search/deleted` | body: `string` (slug) | Odstraní stránku z indexu všech providerů. |
| POST | `/api/search/reindex` | — | Spustí plný rebuild indexu u všech providerů. |

Filtrování podle světa: výsledky, jejichž `slug` není v množině slugů patřících danému světu (`PagesService.GetByWorld()`), jsou odstraněny z odpovědi.

---

## SearchSettings — konfigurace

V `appsettings.json` pod klíčem `Search`:

```json
{
  "Search": {
    "Provider": "Lucene",
    "Embedding": {
      "DefaultResultCount": 10,
      "MaxParallelism": 2,
      "Models": [ ... ]
    }
  }
}
```

- `Provider` — výchozí provider (informativní; routing řeší SearchCoordinator podle parametru v dotazu)
- `DefaultResultCount` — počet výsledků pro embedding search pokud `count <= 0`
- `MaxParallelism` — v kódu zatím nevyužito na úrovni SearchSettings
- Modely s `Enabled: false` jsou při inicializaci přeskočeny
