# Stránky (Pages)

## Model `Page`

Kolekce: název dle `MongoDBSettings.PagesCollectionName`.

| Pole | Typ | Popis |
|---|---|---|
| `id` | ObjectId (string) | `_id` v MongoDB |
| `slug` | string? | URL identifikátor; generuje se z titulu přes `Page.Slugify()` |
| `WorldId` | ObjectId (string)? | `null` = globální/Matrix stránka; jinak ID světa |
| `menu` | string | Sekce navigačního menu (např. `"informace"`) |
| `type` | int | Typ stránky: 0=PC, 1=NPC, 2=LOCATION, 5=OTHER, 11=InstruktážníVidea |
| `title` | string | Nadpis |
| `paragraphs` | string | Obsah jako TipTap JSON string |
| `plainText` | string? | Čistý text extrahovaný z TipTap JSON (generuje se automaticky) |
| `bigImage` | bool? | Zobrazit obrázek přes celou šířku |
| `imageUrl` | string | URL hlavního obrázku |
| `table` / `accountTable` | Table | Volitelná tabulka (`hasTable`, `title`, `headers[]`, `values[]`) |
| `createdAt` | DateTime UTC | Čas vytvoření |
| `isWoodWide` | bool? | Meta příznak (vrací `GET /api/pages/meta/{slug}`) |
| `accessRequirements` | List\<AccessRequirement\> | Pravidla přístupu (prázdný seznam = veřejná stránka) |
| `videos` | List\<InstructionalVideo\>? | Pouze pro type=11; YouTube videa (`id`, `title`, `youtubeUrl`, `youtubeVideoId`) |
| `sections` | List\<PageSection\>? | Kolapsovatelné sekce (`id`, `title`, `content`, `isCollapsed`, `order`, `items[]`) |
| `galleryImages` | List\<GalleryImage\>? | Galerie (`id`, `url`, `caption`, `order`) |
| `customData` | Dictionary\<string,string\>? | Libovolná key-value data |
| `order` | int | Pořadí v menu (výchozí 0) |

**Slugify:** lowercase → odstranění diakritiky (NFD dekompozice) → odstranění non-alfanumerických znaků → sloučení mezer/pomlček.

---

## Model `PageEmbedding`

Kolekce pro vektorové embeddingy stránek (AI vyhledávání).

| Pole | Typ | Popis |
|---|---|---|
| `Id` | ObjectId | `_id` |
| `PageId` | string | Odkaz na `Page.id` |
| `Slug` | string | Slug stránky |
| `ModelKey` | string | Identifikátor embedding modelu |
| `PageHash` | string | Hash obsahu stránky (pro detekci změn) |
| `PageTitle` | string | Titulek stránky |
| `ChunkId` | string | ID chunku (stránka může být rozdělena na více chunků) |
| `ChunkTitle` | string | Nadpis chunku |
| `ChunkPreview` | string? | Náhled textu chunku |
| `ChunkOrder` | int | Pořadí chunku v rámci stránky |
| `Vector` | double[] | Embedding vektor |
| `CreatedAt` | DateTime UTC | Čas vytvoření |

---

## `accessRequirements` — logika přístupu

`AccessRequirement` má `type` (enum `RequirementType`) a `value` (string).

### Typy požadavků

| Typ | Hodnota | Chování |
|---|---|---|
| `AKJ` | číslo (string) | Uživatel musí mít `user.AKJ >= value`; při více AKJ požadavcích se bere maximum |
| `UserId` | userId | Explicitní whitelist uživatele — okamžitě udělí přístup |
| `Role` | název role | Uživatel musí mít danou roli; `Role=PJ` → vždy zamítne (jen PJ vidí) |

**Hierarchie rolí:** PJ/Admin/Superadmin mají přístup vždy. Korektor splňuje požadavek `Player` nebo `User`. Player splňuje `User`.

**Bypass pro nabízené postavy:** Pokud je svět v režimu `open` a slug stránky je v `world.OfferedCharacters`, přístupová omezení se přeskočí.

Implementace v `PagesController.CanAccessPage()`.

---

## TipTap plainText extrakce

Při každém `Create` i `Update` se volá `TipTapExtractor.ExtractText(page.paragraphs)` a výsledek se ukládá do `plainText`. Slouží pro fulltext vyhledávání (Lucene index).

---

## Seed šablon pro nové světy

`PagesService.SeedWorldPages(worldId)` vytvoří 5 šablonových stránek při zakládání nového světa:

| Slug (prefix: `{worldId}-`) | Titulek | Type | Menu |
|---|---|---|---|
| `pravidla` | Pravidla | 5 | informace |
| `magicky-system` | Magický systém | 5 | informace |
| `technologie` | Technologie | 5 | informace |
| `faq` | Často kladené otázky | 5 | informace |
| `videa` | Instruktážní videa | 11 | informace |

Slug každé šablony je `{worldId}-{slug}` — zajišťuje unikátnost napříč světy.

---

## Izolace světů a `MatrixWorldFilter`

Globální endpoint `/api/pages/{slug}` vrací jen stránky patřící Matrix světu (`MatrixWorldId`). Stránky jiných světů jsou dostupné pouze přes `/api/worlds/{worldId}/pages/{slug}`.

`MatrixWorldFilter()` řeší mixed-type problém: pole `WorldId` je v MongoDB uloženo někdy jako ObjectId, jindy jako string — filter používá `$or` se čtyřmi variantami (`null`, chybí, ObjectId, string).

---

## API endpointy

Základní cesta: `api/pages`

| Metoda | Endpoint | Auth | Popis |
|---|---|---|---|
| GET | `/api/pages` | — | Všechny stránky (bez paragraphs/plainText); `?worldId=` pro filtr světa |
| GET | `/api/pages/directory` | AnonymousAllowed | Adresář stránek typů 0,1,2,5; filtruje dle přístupu; řadí česky |
| GET | `/api/pages/favorite-pages` | Authorize | Oblíbené stránky přihlášeného uživatele; `?worldId=` |
| POST | `/api/pages/favorite-pages/toggle/{slug}` | Authorize | Přidat/odebrat oblíbenou stránku |
| PUT | `/api/pages/favorite-pages/reorder` | Authorize | Přeuspořádat oblíbené (body: `string[]`); při desyncu bere průnik |
| GET | `/api/pages/favorite-pages/check/{slug}` | Authorize | Je stránka v oblíbených? → bool |
| GET | `/api/pages/data?number=N` | — | Počet, N nejnovějších stránek, všechny slugy (pages+characters+calendar) |
| GET | `/api/pages/dataSlugs` | — | Slugy pages+characters+calendar; `?worldId=` |
| GET | `/api/pages/{slug}` | AnonymousAllowed | Konkrétní stránka; ověří přístup, world izolaci |
| GET | `/api/pages/meta/{slug}` | AnonymousAllowed | Vrací `isWoodWide` bool |
| POST | `/api/pages` | PJ/Admin/Superadmin | Vytvoří stránku; slug = Slugify(title); 409 pokud existuje |
| PUT | `/api/pages` | — | Aktualizuje stránku (body: celý Page) |
| DELETE | `/api/pages/{slug}` | PJ/Admin/Superadmin | Smaže stránku |
