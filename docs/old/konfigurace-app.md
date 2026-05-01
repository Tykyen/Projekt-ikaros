# Konfigurace aplikace — Matrix Backend

## appsettings.json sekce

### JwtSettings

| Pole | Hodnota |
|---|---|
| `Secret` | 48znakový symetrický klíč (placeholder v appsettings, přepisuje se v secrets) |
| `Issuer` | `matrix-api` |
| `Audience` | `matrix-client` |
| `ExpiryMinutes` | `1440` (24 hodin) |

JWT validace: ověřuje issuer, audience, životnost i podpisový klíč.
- `NameClaimType` = `sub`
- `RoleClaimType` = `ClaimTypes.Role`
- `MapInboundClaims = false`

Chyby autentifikace se logují do souboru `jwt_debug.txt` v `AppContext.BaseDirectory` (události `OnAuthenticationFailed` a `OnChallenge`).

---

### VapidSettings

Web Push notifikace.

| Pole | Hodnota |
|---|---|
| `PublicKey` | VAPID veřejný klíč (placeholder `YOUR_VAPID_PUBLIC_KEY`, přepisuje se v secrets) |
| `PrivateKey` | VAPID privátní klíč (placeholder, přepisuje se v secrets) |
| `Subject` | `mailto:honzamarx08@gmail.com` — identita odesílatele |

---

### Search

| Pole | Hodnota |
|---|---|
| `Provider` | `Combined` — použity oba search provideři (Embedding + Lucene) |
| `Embedding.DefaultResultCount` | `10` |
| `Embedding.MaxParallelism` | `2` — max souběžných embedding výpočtů |

#### Embedding modely

**granite-107** (`Enabled: false` — vypnutý):
| Pole | Hodnota |
|---|---|
| Key | `granite-107` |
| DisplayName | `Granite 107m` |
| OnnxModelPath | `https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_107/model.onnx` |
| TokenizerModelPath | `.../onnx_granite_107/sentencepiece.bpe.model` |
| SequenceLength | `128` |
| EmbeddingDimension | `384` |
| ChunkSizeCharacters | `750` |
| ChunkOverlapCharacters | `250` |
| BatchSize | `1` |

**granite-278** (`Enabled: true` — aktivní):
| Pole | Hodnota |
|---|---|
| Key | `granite-278` |
| DisplayName | `Granite 278m` |
| OnnxModelPath | `https://www.patrikzplzne.cz/data/matrix_embedding_models/onnx_granite_278/model.onnx` |
| TokenizerModelPath | `.../onnx_granite_278/sentencepiece.bpe.model` |
| SequenceLength | `128` |
| EmbeddingDimension | `768` |
| ChunkSizeCharacters | `750` |
| ChunkOverlapCharacters | `250` |
| BatchSize | `1` |

---

### Logging

| Kategorie | Úroveň |
|---|---|
| Default | `Information` |
| Microsoft.AspNetCore | `Warning` |

---

## SystemPresetsService

Soubor: `matrixBackend/Services/SystemPresetsService.cs`

Statická třída. Metoda: `GetPresetBlocks(string? systemId) → List<CustomDiaryBlock>`

Poskytuje předvyplněné bloky deníku postavy (`CustomDiaryBlock`) pro různé RPG systémy.

`CustomDiaryBlock` pole: `Id`, `Type` (`bar`/`stat`/`list`/`text`), `Label`, `MaxValue`, `MinValue`, `Color`, `Order`, `LayoutArea` (`header`/`main`/`sidebar`).

### Podporované systémy

**`custom` / prázdný systemId** — vrací prázdný seznam (hráč si definuje bloky sám).

**`dnd5e`** — Dungeons & Dragons 5e (10 bloků):

| Id | Type | Label | Area | Poznámka |
|---|---|---|---|---|
| `hp` | bar | Životy (HP) | header | `#ff3333`, 0–10 |
| `ac` | stat | Obranné číslo (AC) | header | |
| `str` | stat | Síla (STR) | main | |
| `dex` | stat | Obratnost (DEX) | main | |
| `con` | stat | Odolnost (CON) | main | |
| `int` | stat | Inteligence (INT) | main | |
| `wis` | stat | Moudrost (WIS) | main | |
| `cha` | stat | Charisma (CHA) | main | |
| `skills` | list | Dovednosti | sidebar | |
| `spells` | text | Kouzla a Vlastnosti | main | |

**`fate`** — FATE Core (6 bloků):

| Id | Type | Label | Area | Poznámka |
|---|---|---|---|---|
| `physical_stress` | bar | Fyzický Stres | header | `#ff3333`, 0–3 |
| `mental_stress` | bar | Psychický Stres | header | `#3333ff`, 0–3 |
| `high_concept` | text | Hlavní Aspekt | main | |
| `trouble` | text | Trable | main | |
| `aspects` | text | Další Aspekty | main | |
| `skills_great` | list | Výborné (+4) Dovednosti | sidebar | |

**`gurps`** — GURPS (9 bloků):

| Id | Type | Label | Area | Poznámka |
|---|---|---|---|---|
| `hp` | bar | HP | header | `#cc0000`, 0–10 |
| `fp` | bar | Únava (FP) | header | `#00cc00`, 0–10 |
| `st` | stat | ST | main | |
| `dx` | stat | DX | main | |
| `iq` | stat | IQ | main | |
| `ht` | stat | HT | main | |
| `advantages` | text | Výhody | sidebar | |
| `disadvantages` | text | Nevýhody | sidebar | |
| `skills` | list | Dovednosti | main | |

**`drdplus`** — DrD+ (8 bloků):

| Id | Type | Label | Area | Poznámka |
|---|---|---|---|---|
| `hp` | bar | Mrtvé bodíky | header | `#990000`, 0–10 |
| `fatigue` | bar | Únava | header | `#aaaaaa`, 0–20 |
| `str` | stat | Síla | main | |
| `dex` | stat | Obratnost | main | |
| `con` | stat | Odolnost | main | |
| `int` | stat | Inteligence | main | |
| `cha` | stat | Charisma | main | |
| `vol` | stat | Vůle | main | |

**`matrix`** / výchozí — Legacy Matrix systém (3 bloky):

| Id | Type | Label | Area | Poznámka |
|---|---|---|---|---|
| `health` | bar | Vitalita | header | `#cc3333`, 0–10 |
| `magic` | bar | Magenerg | header | `#3333cc`, 0–10 |
| `armor` | stat | Zbroj | header | |

---

## MatrixConstants

Soubor: `matrixBackend/MatrixConstants.cs`

```csharp
public const string MatrixWorldId = "6d6174726978000000000001";
```

Pevné MongoDB ObjectId pro primární herní svět platformy Matrix. Konzistentní napříč všemi prostředími (dev, staging, prod).

Používá se všude, kde je potřeba identifikovat Matrix svět bez dotazu do DB — seedování dat, filtrování herních objektů, autorizační kontroly na úrovni světa.

Hex `6d617472697800...` = ASCII "matrix" v prvních 6 bajtech ObjectId.
