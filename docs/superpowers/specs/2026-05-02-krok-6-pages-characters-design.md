# Krok 6 — Pages, Characters & Sub-dokumenty: Design

**Datum:** 2026-05-02  
**Stav:** Schváleno

---

## Přehled

Krok 6 přidává dva nové moduly a jejich sub-systém:

| Pod-krok | Modul | Co řeší |
|---|---|---|
| **6a** | `pages` | Wiki stránky světa (Lokace, Noviny, Galerie...) |
| **6b** | `characters` | Postavy CP/NPC s veřejnou a soukromou částí |
| **6c** | `character-subdocs` | Auto-vytvořené sub-dokumenty k postavám |

---

## Migrace ze starého systému

Migrace je deterministická a proveditelná:

| Starý systém | Nový systém |
|---|---|
| `Page` type=0 (CP) | `characters` (isNpc=false) |
| `Page` type=1 (NPC) | `characters` (isNpc=true) |
| `Page` type=2,4,5,8,10,11,12 | `pages` kolekce |
| `Page` `{slug}-denik` (type=9) | `character_diaries` |
| `Page` `{slug}-batoh` (type=7) | `character_inventories` |
| `Page` `{slug}-finance` (type=6) | `character_finances` |
| Stará `Character` game stats | Merge do nového `characters` dokumentu |
| Stará `Calendar` kolekce | `character_calendars` |

Propojení sub-stránek na postavu se určí podle slug konvence (`{char-slug}-denik`, `{char-slug}-batoh`, atd.).

---

## Krok 6a — Pages modul

### Účel
Světové wiki stránky — obsah který PJ nebo hráči tvoří. Nepokrývá CP/NPC (ty jsou Characters).

### PageType
`type` je uložen jako `string` — ne enum. Definované konstanty pro known types:
```
'Lokace' | 'Noviny' | 'Seznam' | 'Galerie' | 'Rodokmen' | 'Obrazovka' | 'Ostatní'
```
Vlastní typy jsou možné bez změny kódu; nový typ s vlastní render logikou vyžaduje změnu frontendu.

### Page dokument
```typescript
{
  id: string
  slug: string                        // unikátní v rámci světa
  worldId: string
  type: PageType
  title: string
  content: string                     // HTML (paragraphs)
  imageUrl: string
  bigImage?: boolean                  // pro Rodokmen
  table?: {
    hasTable: boolean
    title?: string
    headers?: string[]
    values?: string[]
  }
  sections?: PageSection[]            // pro strukturovaný obsah
  galleryImages?: GalleryImage[]      // pro Galerie
  videos?: InstructionalVideo[]       // pro Obrazovka
  accessRequirements: AccessRequirement[]
  customData?: Record<string, string>
  order: number
  createdAt: Date
}
```

**AccessRequirement:**
```typescript
{ type: 'UserId' | 'AKJ' | 'Role', value: string }
```

AKJ je numerická úroveň přístupu — přístup povolen pokud `user.akj >= parseInt(value)`.

### REST API
`/api/worlds/:worldId/pages`

| Metoda | Cesta | Popis | Role |
|---|---|---|---|
| GET | `/` | Seznam stránek světa (volitelný filter `?type=`) | člen světa |
| GET | `/:slug` | Detail stránky (+ access check) | dle accessRequirements |
| POST | `/` | Vytvoření stránky | PJ / Admin |
| PATCH | `/:slug` | Úprava | PJ / Admin |
| DELETE | `/:slug` | Smazání | PJ / Admin |

### Architektura
`PagesModule` → Interface → Schema → Repository → Service → Controller  
Žádný Gateway — stránky nepotřebují real-time broadcast.

---

## Krok 6b — Characters modul

### Účel
Postavy světa. CP je přiřazena konkrétnímu hráči, NPC ovládá PJ. Obě sdílejí stejný dokument s rozdílnou viditelností.

### Viditelnost

| Co | CP | NPC |
|---|---|---|
| Veřejná část (publicBio, publicInfoBlocks) | ostatní hráči světa | všichni hráči světa |
| Soukromá část (privateBio, privateInfoBlocks) | jen přiřazený hráč + PJ | jen PJ |
| Sub-dokumenty | jen přiřazený hráč + PJ | jen PJ |

### Character dokument
Herní statistiky **nejsou** na Character entitě — patří do deníku (charsheet), který je systémově specifický dle světa.

```typescript
{
  id: string
  slug: string                        // unikátní v rámci světa
  worldId: string
  userId?: string                     // null = NPC; vyplněno = CP
  isNpc: boolean

  // Sdílené
  imageUrl: string
  accessRequirements: AccessRequirement[]
  campaignSubjectId?: string          // odkaz na záznam v pavučině

  // Veřejná část
  publicBio: string                   // HTML — vidí ostatní hráči
  publicInfoBlocks: InfoBlock[]       // sidebar "POSTAVA"

  // Soukromá část
  privateBio: string                  // HTML — jen hráč + PJ
  privateInfoBlocks: InfoBlock[]      // info panel soukromé stránky (národnost, povolání, magie... + nav odkazy na sub-docs)

  customData?: Record<string, unknown>
  createdAt: Date
}

type InfoBlock = { label: string; value: string }  // value může být HTML s odkazy
```

### REST API
`/api/worlds/:worldId/characters`

| Metoda | Cesta | Popis | Role |
|---|---|---|---|
| GET | `/` | Seznam postav (jméno, imageUrl, isNpc) | člen světa |
| GET | `/:slug` | Detail — veřejná nebo plná verze dle role | dle viditelnosti |
| POST | `/` | Vytvoření CP nebo NPC | PJ / Admin |
| PATCH | `/:slug` | Úprava | PJ / Admin + hráč (svá CP) |
| PATCH | `/:slug/convert` | CP↔NPC konverze | PJ / Admin |
| DELETE | `/:slug` | Smazání | PJ / Admin |
| GET | `/by-user/:userId` | Aktivní CP hráče ve světě (pro chat identity) | člen světa (autentizovaný) |

### CP↔NPC konverze
- **CP → NPC:** smaže `userId`, nastaví `isNpc=true`, Finance + Výbava sub-doks nastaví `isHidden=true`
- **NPC → CP:** nastaví `userId`, nastaví `isNpc=false`, Finance + Výbava sub-doks: pokud existují → `isHidden=false`, pokud neexistují → vytvoří nové

### Chat integrace
`GET /by-user/:userId` vrací `{ name, imageUrl }` aktivní CP — ChatService to volá pro override name/avatar v chat zprávách.

### Architektura
`CharactersModule` → Interface → Schema → Repository → Service → Controller  
Po `create()` emituje EventEmitter2 event `character.created` → odchytí CharacterSubdocsModule (Krok 6c).

---

## Krok 6c — Character sub-dokumenty

### Účel
Sub-dokumenty auto-vytvořené při vzniku postavy. Přístupné jen přiřazenému hráči (CP) nebo PJ (NPC).

### Co se auto-vytváří

| Sub-dok | CP | NPC | Přístup |
|---|---|---|---|
| Deník | ✅ | ✅ | CP: hráč + PJ / NPC: jen PJ |
| Kalendář | ✅ | ✅ | CP: hráč + PJ / NPC: jen PJ |
| Finance | ✅ | ❌ | jen hráč + PJ |
| Výbava | ✅ | ❌ | jen hráč + PJ |
| Poznámky | ✅ | ✅ | CP: hráč + PJ / NPC: jen PJ |

Finance a Výbava se při CP→NPC konverzi **nesmažou** — nastaví se `isHidden=true`. Při zpětné konverzi NPC→CP se `isHidden=false`.

### Datové struktury

**`character_diaries`**
```typescript
{
  characterId: string
  worldId: string
  sections: PageSection[]                   // volný text obsah deníku
  personalDiarySchema?: CustomDiaryBlock[]  // přepis world.customDiarySchema (optional)
  customData: Record<string, unknown>       // hodnoty charsheeetu (health, fatePoints, atd.)
}
```

Deník přebírá schema ze světa (`world.customDiarySchema`) jako výchozí layout. Každý svět má jiný RPG systém (Matrix, CoC, DnD, Drd16...) — schema definuje jaké bloky se zobrazí a `customData` ukládá hodnoty.

**`character_calendars`**
```typescript
{
  characterId: string
  worldId: string
  events: PersistEvent[]              // { id, title, start, end, allDay, hourStart, hourEnd, description }
}
```

**`character_finances`**
```typescript
{
  characterId: string
  isHidden: boolean                   // true pokud je postava NPC

  // Metadata účtu
  accountType: string                 // "Osobní", "Firemní"...
  accessLocation: string              // "Švýcarsko"...
  currency: string                    // "Libra", "Dolar"...
  lastSyncDate?: Date                 // datum posledního "přidej měsíční"

  // Finanční stav
  balance: number                     // akumulovaný zůstatek

  // Měsíční položky (ROZEPSANÉ)
  entries: {
    id: string
    label: string                     // "GMOI", "Tajné služby"...
    amount: number                    // kladné = příjem, záporné = výdaj
  }[]

  // Historie transakcí (pro "zpět")
  transactions: {
    id: string
    date: Date
    delta: number                     // o kolik se změnil balance
    description: string               // "měsíční zúčtování"
  }[]
}
```

**"Přidej měsíční":** součet `entries` se přičte k `balance`, zapíše se záznam do `transactions`, aktualizuje se `lastSyncDate`.  
**"Zpět":** odebere poslední transakci a odečte její `delta` od `balance`.

**`character_inventories`**
```typescript
{
  characterId: string
  isHidden: boolean                   // true pokud je postava NPC
  sections: PageSection[]             // každá sekce má items[]
}

type PageSectionItem = { id, text, quantity?: number, note?: string }
```

**`character_notes`**
```typescript
{
  characterId: string
  content: string                     // HTML
}
```

### REST API
Všechny sub-dokumenty jsou dostupné přes Character slug:

| Metoda | Cesta |
|---|---|
| GET / PATCH | `/api/worlds/:worldId/characters/:slug/diary` |
| GET / PATCH | `/api/worlds/:worldId/characters/:slug/calendar` |
| GET / PATCH | `/api/worlds/:worldId/characters/:slug/finance` |
| GET / PATCH | `/api/worlds/:worldId/characters/:slug/inventory` |
| GET / PATCH | `/api/worlds/:worldId/characters/:slug/notes` |

### Architektura
`CharacterSubdocsModule` poslouchá `character.created` (EventEmitter2) a vytvoří příslušné sub-dokumenty.  
Každý sub-dok má vlastní: Interface → Schema → Repository + service metody (get, update).  
Žádné samostatné controllery — routes jsou vnořené pod Characters.

---

## Škálovací limity

Projekt počítá s až 500 světů × 500 členů. Characters jsou world-scoped a dotazy vždy filtrují `worldId` — bez N+1 problémů. Sub-dokumenty jsou 1:1 s postavou, takže žádná kolekce neporoste nelineárně.
