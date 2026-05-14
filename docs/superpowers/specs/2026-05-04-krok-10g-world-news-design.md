# Krok 10g — WorldNews: Design Spec

**Datum vzniku:** 2026-05-04
**Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 3.1)
**Stav:** Schváleno (po revizi)

---

## Přehled

Modul pro správu novinek — **globálních** (platformových, `worldId=null`) i **per-world** (`worldId=<id>`). GET endpointy jsou anonymní. Jeden flat endpoint `/api/news` s volitelným `worldId` query parametrem.

**Path API:** `/api/news` (parity se starým systémem)
**Modul (kód):** `backend/src/modules/world-news/` (jméno odlišuje od existujícího `ikaros-news`, který je separátní doména — Ikaros platformové zprávy mají vlastní wider scope a vlastní endpointy)

---

## Rozdíly proti původní verzi (2026-05-04)

Tato sekce je auditní — proč spec vypadá jinak než původní návrh:

| Téma | Verze 2026-05-04 | Verze 2026-05-06 (aktuální) | Důvod |
|---|---|---|---|
| `GET /api/news` (bez query) | Vrací jen globální (`worldId=null`) | Vrací **vše** (globální + všechny světy) | Parity se starým systémem ([docs/old/news.md](../../old/news.md)) |
| `GET /api/news?worldId=xyz` | Jen daný svět | Daný svět **+** globální (sloučeno, `date DESC`) | Lepší UX (frontend nemusí dělat 2 requesty); user volba |
| Audit autora | `authorId` + `authorName` (denormalizováno) | Jen `createdBy: userId` | Eliminace rename-leak anti-vzoru (viz [docs/dluhy.md](../../dluhy.md) — `ikaros-news` má stejný problém) |
| `date` typ | `Date` | ISO 8601 string | Round-trip s migrací ze staré .NET databáze (parity); přesnost a formát zachované |
| Mongo `timestamps` | `createdAt` + `updatedAt` automaticky | `timestamps: false` | Parity (starý systém je neměl); `date` je business field |
| PUT/DELETE auth | Role-based **+** vlastník (`authorId`) může | Jen role-based | Vlastnictví bylo nadbytečné — kdo má `≥PomocnyPJ` má autoritu nad obsahem světa bez ohledu na to, kdo to napsal |
| PUT může měnit `worldId` | Není řešeno | **Zakázáno** (vrací 400) | Bezpečnostní past (cross-world data leak) |
| Migrace ze starého systému | Neřešeno | `scripts/migrate-world-news.ts` (CLI, idempotentní upsert per `_id`) | Stará produkční DB obsahuje news, které se musí přenést |

---

## Datový model

### Mongoose schema `WorldNewsSchemaClass`

```ts
// backend/src/modules/world-news/schemas/world-news.schema.ts
@Schema({ collection: 'worldnews', timestamps: false })
export class WorldNewsSchemaClass {
  @Prop({ default: null }) worldId: string | null;
  @Prop({ required: true, maxlength: 200 }) title: string;
  @Prop({ required: true, maxlength: 10000 }) content: string;
  @Prop({ required: true }) date: string;       // ISO 8601 string
  @Prop({ type: String, enum: ['info','alert','system'], default: 'info' })
  type: 'info' | 'alert' | 'system';
  @Prop() link?: string;
  @Prop() createdBy?: string;                   // userId — audit, ne v anon API responses
}
```

**Indexy:**
```
{ worldId: 1, date: -1 }   // compound; pokrývá filtry i sort
```

**Poznámky k polím:**

- `worldId: null` (default) = globální news, viditelné napříč platformou
- `worldId: <ObjectId-string>` = per-world news, vázané na konkrétní svět
- `date` jako string (ne `Date`) — sklad ISO 8601 textu **v UTC** (`...Z` suffix) pro round-trip s legacy daty. UTC zaručuje, že lexikální řazení = chronologické řazení. DTO validátor odmítne ne-UTC formáty (např. `+02:00`); migrace skript normalizuje na UTC při importu, pokud legacy data nejsou v UTC
- `type` enum přesně dle staré specifikace: `info|alert|system` (vizuální klasifikace, nemá vliv na auth)
- `createdBy` plněno z JWT u write operací; **u importu ze staré DB zůstává `undefined`** (legacy data nemají autora) — design akceptuje
- `maxlength` defenzivní validace na DB úrovni (200 / 10 000) — news, ne článek

---

## API endpointy

Prefix: `/api/news`

| Metoda | URL | Auth | Popis |
|--------|-----|------|-------|
| GET | `/` | Anonymní | Seznam novinek (viz query níže) |
| GET | `/:id` | Anonymní | Detail novinky |
| POST | `/` | Admin\|Superadmin **\|** `WorldRole≥PomocnyPJ` na `worldId` z body | Vytvoř novinku |
| PUT | `/:id` | Stejné jako POST, hodnoceno per `worldId` **existujícího** dokumentu | Aktualizuj novinku (partial) |
| DELETE | `/:id` | Stejné jako PUT | Smaž novinku |

### Query parametry pro `GET /`

| Parametr | Typ | Default | Popis |
|----------|-----|---------|-------|
| `worldId` | string | — | Filtr per-world novinek; **vrací svět + globální** sloučené |
| `limit` | number | `50` (max `200`) | Max počet vrácených položek |

**Sort:** vždy `date DESC`. Mergování svět + globální probíhá po DB query a před `limit` cut-off.

**Bez `worldId`** — vrátí všechny news (globální + ze všech světů), seřazené `date DESC`. To je shodné se starým systémem; výsledek znamená, že per-world news jsou **veřejné** pro anon. Pokud má v budoucnu existovat "world-private news", je to **mimo scope** této fáze a vyžaduje samostatný spec.

### Tělo POST `/`

```ts
// CreateWorldNewsDto
{
  worldId?: string | null     // null nebo nepřítomné = globální
  title: string               // 1..200
  content: string             // 1..10000
  date?: string               // ISO 8601 v UTC (`...Z`); default = `new Date().toISOString()`
  type?: 'info' | 'alert' | 'system'   // default 'info'
  link?: string               // pokud přítomno: validní URL
}
```

### Tělo PUT `/:id`

`UpdateWorldNewsDto` — všechna pole optional **kromě**:
- `worldId` v body je **zakázáno** (i kdyby identické s existujícím) — vrátí `400 Bad Request: "worldId is immutable; delete and recreate to change scope"`
- `createdBy` v body je **ignorováno** (server-side audit field, klient nesmí měnit)

PUT je **partial update** (PATCH semantika), ne `ReplaceOne`. Důvod: `ReplaceOne` by smazal `createdBy` a další serverové fieldy.

---

## Autorizace (guard logika)

```
canActivate(req, dto, paramsId?):
  user = req.user                             // JwtAuthGuard běží před tímto

  // Globální admin smí vždy
  if user.roles.includes('Admin' | 'Superadmin'): allow

  // Zjisti cílový worldId
  if POST: worldId = dto.worldId ?? null
  if PUT|DELETE:
    existing = await repo.findById(paramsId)
    if !existing: throw 404
    worldId = existing.worldId
    if PUT && dto.worldId !== undefined && dto.worldId !== existing.worldId:
      throw 400 'worldId immutable'

  // Globální news → jen Admin/Superadmin (už by allow proběhl výše)
  if worldId === null: deny 403

  // Per-svět: vyžaduje membership s rolí ≥ PomocnyPJ
  membership = await worldMembership.findByUserAndWorld(user.id, worldId)
  if !membership: deny 403
  if membership.role < WorldRole.PomocnyPJ: deny 403

  allow
```

**Zdůvodnění klíčových rozhodnutí:**

- **Vlastník světa NENÍ automaticky autorizován** (per memory rule projektu) — jen `WorldMembership.role ≥ PomocnyPJ` rozhoduje, plus globální Admin/Superadmin
- **Two-step lookup pro PUT/DELETE** — nejdřív načti dokument (kvůli `worldId` z DB, ne z URL/body), pak autorizuj. Brání spoofingu přes URL parametry
- **`worldId` immutability check v guardu** (ne v service) — early reject; jasná zodpovědnost

---

## Validace (class-validator + Mongoose)

| Pravidlo | Vrstva | Chyba |
|---|---|---|
| `title`, `content` povinné | DTO | 400 (class-validator) |
| `title` ≤ 200 | DTO + DB | 400 / 422 |
| `content` ≤ 10000 | DTO + DB | 400 / 422 |
| `date` musí být ISO 8601 string | DTO | 400 |
| `type ∈ {info,alert,system}` | DTO + DB enum | 400 / 422 |
| `link` (pokud přítomné) musí být validní URL | DTO | 400 |
| `worldId` v PUT body | Guard | 400 (immutable) |
| `worldId` v POST odkazuje na neexistující svět | Guard (membership lookup selže) | 403 (anti-leak — neodhalíme existenci světa) |
| `:id` neexistuje (PUT/DELETE/GET) | Repository | 404 |
| `limit` < 1 nebo nečíselné | DTO | 400 |

---

## Migrace ze staré databáze

**Cíl:** Idempotentní jednorázový import ze starého .NET produkčního systému do nové Mongo DB.

### Skript `backend/scripts/migrate-world-news.ts`

**CLI:**
```bash
ts-node scripts/migrate-world-news.ts --input=./data/news-export.json [--dry-run]
```

**Vstupní formát** (předpoklad — odpovídá `mongoexport --jsonArray` ze starého systému):

```json
[
  {
    "_id": { "$oid": "65a1b2c3d4e5f60123456789" },
    "WorldId": "65a1b2c3d4e5f6012345abcd",  // null nebo "MatrixWorldId" → globální
    "Title": "...",
    "Content": "...",
    "Date": "2025-01-15T10:00:00.000Z",
    "Type": "info",
    "Link": "https://..."                    // optional
  }
]
```

**Algoritmus:**

1. Načti JSON soubor → pole položek
2. Připoj se k cílové Mongo DB přes konfiguraci z `.env` (stejně jako aplikace)
3. Pro každou položku:
   - Mapuj PascalCase → camelCase (`Title` → `title`, atd.)
   - **Normalizuj `worldId`**: `"MatrixWorldId"` *nebo* `null` *nebo* prázdný string → `null`. Jinak ponech string
   - **Validuj** přes class-validator (DTO podobné `CreateWorldNewsDto`, ale akceptuje navíc `_id`)
   - **Skip & log** položky, které neprojdou validací (důvod do logu); migrace nesmí padat na jedné špatné položce
4. **Idempotentní upsert** přes `_id` — `bulkWrite` s `replaceOne({ _id }, doc, { upsert: true })`. Re-run je bezpečný (přepíše stejnými daty)
5. `--dry-run` flag: validace + počítání, ale `bulkWrite` se nespustí
6. Závěrečný log: `imported X, skipped Y (reasons: ...), total Z`

**Rozhodnutí:**

- **PascalCase → camelCase mapping** — stará specifikace ([docs/old/news.md](../../old/news.md)) používá .NET konvenci; nové schema je camelCase per JS standard
- **`MatrixWorldId` jako synonym pro `null`** — explicitně dokumentováno ve staré spec ([docs/old/news.md:10](../../old/news.md#L10)); normalizujeme na `null` v novém systému
- **Zachování `_id`** — uloží se *stejné* ObjectId. Důvod: pokud na ně někdo někde odkazuje (link v IkarosArticle, logy), URL `/api/news/<id>` zůstane funkční po migraci
- **`createdBy` nezahrnuto** — staré položky autora neměly. Field zůstane `undefined` u importovaných (signál: legacy data)
- **NPM script** — `"migrate:news": "ts-node scripts/migrate-world-news.ts"` v `backend/package.json`

---

## Testy

`backend/src/modules/world-news/world-news.service.spec.ts` — fokus na **business invarianty**, ne 100 % coverage:

### Read path

- `GET` bez filtru → vrátí všechny news (globální + ze všech světů), `date DESC`
- `GET ?worldId=xyz` → vrátí news světa `xyz` **+ globální**, sloučené, `date DESC`
- `GET ?limit=10` → max 10 položek
- `GET ?limit=999` → clamp na 200 (max)
- `GET /:id` neexistující → 404

### Write path (autorizace — security invarianty)

- POST jako anon → 401
- POST `worldId=null` jako běžný User → 403
- POST `worldId=null` jako Admin → 201
- POST `worldId=xyz` jako PJ světa `xyz` (role 3) → 201
- POST `worldId=xyz` jako PomocnyPJ světa `xyz` (role 2) → 201
- POST `worldId=xyz` jako Korektor (role 1) → 403
- POST `worldId=xyz` jako Hrac (role 0) → 403
- **POST `worldId=xyz` jako PJ jiného světa `abc` → 403** *(klíč: cross-world isolation)*
- PUT s `worldId` v body → 400 (immutability)
- PUT/DELETE neexistující `:id` → 404

### Schema / validation

- POST bez `title` / `content` → 400
- POST `type='banana'` → 400 (enum reject)
- POST default `type` → `'info'`
- POST `title` > 200 chars → 400
- POST `link='not-a-url'` → 400

### Migrace skript — `migrate-world-news.spec.ts`

- PascalCase → camelCase mapping správný
- `WorldId='MatrixWorldId'` → `worldId=null`
- `WorldId=null` → `worldId=null`
- Idempotentnost: dvě spuštění stejného JSON nevytvoří duplicity (ověř count před/po)
- Invalid položka (chybí `Title`) → skipped, log obsahuje důvod, ostatní položky se importují
- `--dry-run` neprovede zápis (count v DB beze změny)

---

## Implementační poznámky

- **Naming `world-news`** (modul, collection `worldnews`) — odlišení od existujícího `ikaros-news` modulu (jiná doména: Ikaros platformové zprávy o systému). API path `/api/news` zůstává per parity
- `worldId=null` v Mongo dotazu vyžaduje **explicitní** `{ worldId: null }`, ne `{ worldId: { $exists: false } }` — `null` value match vs. missing field
- Modul **nevyžaduje** WebSocket ani background joby
- Guard použije DI `WorldNewsRepository` + `WorldMembershipRepository` přes constructor
- **DELETE je hard delete** (`deleteOne`), ne soft delete. News neuchovávají historii (parity); pokud potřeba "archivu", řeší se až později samostatným fieldem `isArchived` mimo tento scope
- Pseudo-kód v sekci Autorizace používá TS notaci pro union typy (`'Admin' | 'Superadmin'`); v reálné implementaci je to `user.roles.some(r => r === 'Admin' || r === 'Superadmin')`

---

## Mimo scope této fáze

- **World-private news** (per-world news viditelné jen členům světa) — neřešeno; vyžaduje samostatný design (auth na GET endpointech, query optimalizace)
- **Real-time push** nových news (WebSocket broadcast) — žádný požadavek
- **Markdown / HTML rendering** v `content` — frontend záležitost, backend ukládá raw text
- **Attachments / images** — nemá field; pokud potřeba, řešit přes existující image upload modul a `link` field
