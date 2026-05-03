# Krok 9 — Kampaně: Design Spec

**Datum:** 2026-05-03  
**Stav:** Schváleno

---

## Přehled

GM nástroje pro správu herního světa — pavučina vztahů, příběhové linky, scénáře, poznámky, obchod. Každý hráč má vlastní pavučinu; PJ vidí všechny; PJ a PomocnýPJ sdílejí jednu společnou PJ pavučinu per world.

---

## Architektura

Jeden NestJS modul `campaign` s:
- 7 Mongoose schémat (6 entit + changelog)
- 7 repozitářů (interface + implementace)
- 1 service (~350 řádků)
- 1 controller (33 endpointů)

Modul závisí na `WorldMembership` (globálně dostupný) pro ověření role ve světě.

---

## Datové modely

### Společná pole (všechny entity kromě ChangeLog)

```typescript
worldId: string          // povinné
ownerId: string          // userId vlastníka
isShared: boolean        // true = sdílená PJ pavučina (jedna per world)
createdAtUtc: Date
updatedAtUtc: Date
```

---

### CampaignSubject

Uzel pavučiny — postava, NPC, lokace, organizace nebo frakce.

```typescript
type: 'PC' | 'NPC' | 'LOCATION' | 'ORG' | 'FACTION'
name: string
avatarUrl?: string
tags: string[]
status: 'active' | 'archived'           // default: active
linkedPageSlug?: string                  // odkaz na wiki stránku (přeskočit)
linkedCharacterSlug?: string             // odkaz na deník postavy (přeskočit)
notes?: string
```

**Indexy:**
```
{ worldId: 1, ownerId: 1 }
{ worldId: 1, isShared: 1 }
{ worldId: 1, updatedAtUtc: -1 }
```

---

### CampaignRelationship

Vztah mezi dvěma subjekty — síla a povaha per strana.

```typescript
subjectAId: string
subjectBId: string
shared: {
  whatHappened?: string        // co se stalo mezi nimi
  behindTheScenes?: string     // GM-only kontext
}
sideA: {
  tone?: string                // emocionální ladění vztahu ze strany A
  behavior?: string            // jak se A chová k B
  gmIntent?: string            // GM záměr pro tuto stranu
  strength: number             // 1–10, default: 5
}
sideB: {
  tone?: string
  behavior?: string
  gmIntent?: string
  strength: number             // 1–10, default: 5
}
status: 'active' | 'dormant' | 'crisis' | 'closed'   // default: active
priority: number               // 1–5, default: 3
storylineIds: string[]
lastChangeNote?: string
```

**Indexy:**
```
{ worldId: 1, ownerId: 1 }
{ worldId: 1, isShared: 1 }
{ worldId: 1, updatedAtUtc: -1 }
{ worldId: 1, subjectAId: 1 }
{ worldId: 1, subjectBId: 1 }
```

---

### CampaignStoryline

Příběhová linka — makro/mid/mikro úroveň příběhu.

```typescript
level: 'macro' | 'mid' | 'micro'        // default: mid
title: string
status: 'active' | 'dormant' | 'escalating' | 'climax' | 'closed'  // default: active
phase?: string
summary?: string
whatHappened?: string
truth?: string                           // GM-only pravda
playersBelief?: string                   // co si myslí hráči
gmIntent?: string
nextStep?: string                        // zobrazí se na dashboardu
subjectIds: string[]
relationshipIds: string[]
```

**Indexy:**
```
{ worldId: 1, ownerId: 1 }
{ worldId: 1, isShared: 1 }
{ worldId: 1, status: 1 }
{ worldId: 1, updatedAtUtc: -1 }
```

---

### CampaignScenario

Scénář / storyboard s TipTap obsahem a galerií.

```typescript
title: string
contentData?: object                     // TipTap JSON
order: number                            // při create: max(order) + 1 v rámci (worldId, ownerId, isShared); default 0
linkedPageSlug?: string
subjectIds: string[]
storylineIds: string[]
images: string[]                         // Cloudinary URLs
```

**Indexy:**
```
{ worldId: 1, ownerId: 1 }
{ worldId: 1, isShared: 1 }
{ worldId: 1, order: 1 }
{ worldId: 1, updatedAtUtc: -1 }
```

---

### CampaignQuickNote

Rychlá poznámka — úkol nebo připomínka.

```typescript
title: string
body?: string
status: 'open' | 'done'                 // default: open
pinned: boolean                          // default: false
subjectIds: string[]
storylineIds: string[]
```

**Indexy:**
```
{ worldId: 1, ownerId: 1 }
{ worldId: 1, isShared: 1 }
{ worldId: 1, pinned: 1 }
{ worldId: 1, updatedAtUtc: -1 }
```

---

### CampaignShopItem

Položka obchodu s křížovými referencemi.

```typescript
name: string
description?: string
group: string
subgroup?: string
price: number                            // default: 0
currencyCode: string
linkedItemIds: string[]                  // křížové reference; kaskádové mazání
referenceLink?: string
isRecommended: boolean                   // default: false
```

**Kaskádové mazání:** při DELETE itemu → `$pull` linkedItemIds ze všech ostatních itemů ve stejném worldId.

**Indexy:**
```
{ worldId: 1, ownerId: 1 }
{ worldId: 1, isShared: 1 }
{ worldId: 1, group: 1 }
{ worldId: 1, updatedAtUtc: -1 }
```

---

### CampaignChangeLog

Auditní log změn pavučiny.

```typescript
worldId: string
ownerId: string                          // čí pavučina byla změněna
isShared: boolean
entityType: 'subject' | 'relationship' | 'storyline' | 'scenario' | 'quicknote' | 'shopitem'
entityId: string
entityName: string                       // pro zobrazení bez lookup
changeType: 'created' | 'updated' | 'deleted'
changedByUserId: string
changedByName: string
changedAtUtc: Date
```

**Indexy:**
```
{ worldId: 1, changedAtUtc: -1 }                      // PJ — všechny změny světa
{ worldId: 1, isShared: 1, changedAtUtc: -1 }         // PomocnýPJ — jen sdílená
{ changedAtUtc: 1 }  expireAfterSeconds: 7776000       // TTL 90 dní
```

**Cleanup politika:** při každém zápisu → spočítej záznamy pro daný `worldId`; pokud > 200, smaž nejstarší přebytečné. MongoDB TTL zároveň čistí záznamy starší 90 dní.

---

## Přístupová práva

### resolveScope

Každý list endpoint volá `resolveScope(userId, worldRole)` → vrátí MongoDB filter:

| WorldRole | MongoDB filter (list) | Může zapisovat |
|-----------|----------------------|----------------|
| Hráč | `{ worldId, ownerId: userId }` | jen vlastní |
| PomocnýPJ | `{ worldId, $or: [{ ownerId: userId }, { isShared: true }] }` | vlastní + sdílená |
| PJ | `{ worldId }` — vše | vše |
| Admin/Superadmin | `{ worldId }` — vše | vše |

### Ownership check (GET /:id, PUT, DELETE)

- Načti entitu, zkontroluj `entity.ownerId === userId` NEBO `entity.isShared === true && worldRole >= PomocnýPJ` NEBO `worldRole >= PJ`.
- Nesplnění → 403 Forbidden.

### Change log přístup

- PJ: `{ worldId }`
- PomocnýPJ: `{ worldId, isShared: true }`
- Hráč: 403

### WorldRole čtení

Z `WorldMembership` (globálně dostupné) — stejný pattern jako npc-templates, maps.

---

## REST API

**Base:** `GET/POST /api/campaign/...` — vše vyžaduje JWT.

### Speciální endpointy

| Method | Path | Přístup | Popis |
|--------|------|---------|-------|
| GET | `/players?worldId=` | PJ+ | Seznam hráčů světa (pro picker subjektů) |
| GET | `/dashboard?worldId=&ownerId=` | všichni | Shrnutí dle role |
| GET | `/changelog?worldId=&limit=` | PJ, PomocnýPJ | Auditní log |

### CRUD endpointy (6× stejný pattern)

Pro každý z: `subjects`, `relationships`, `storylines`, `scenarios`, `quicknotes`, `shopitems`:

| Method | Path | Popis |
|--------|------|-------|
| GET | `/:resource?worldId=&ownerId=&isShared=&status=&...` | List s filtry |
| GET | `/:resource/:id` | Detail |
| POST | `/:resource` | Vytvoření |
| PUT | `/:resource/:id` | Aktualizace (full replace, zachová ownerId + createdAtUtc) |
| DELETE | `/:resource/:id` | Smazání |

### Query filtry per resource

- **subjects:** `type`, `status`, `q` (fulltext name)
- **relationships:** `subjectId` (A nebo B), `status`, `storylineId`
- **storylines:** `level`, `status`, `subjectId`
- **scenarios:** řazení dle `order`
- **quicknotes:** `status`, `pinned`
- **shopitems:** `group`

Všechny listy: `worldId` + `ownerId` + `isShared` (scope dle role, viz výše). Řazení: `updatedAtUtc DESC` (výjimka: scenarios → `order ASC`).

### Dashboard response

```typescript
{
  crisisRelationships: CampaignRelationship[]   // status = 'crisis', max 10
  activeStorylines: CampaignStoryline[]         // status = 'active', dle level priority
  pinnedNotes: CampaignQuickNote[]              // pinned = true, status = 'open'
  recentChanges: CampaignChangeLog[]            // max 20, dle role
}
```

---

## Change Log — automatický zápis

Service zapíše do changelogu po každém úspěšném:
- `create` → `changeType: 'created'`
- `update` → `changeType: 'updated'`
- `delete` → `changeType: 'deleted'`

Zápis je fire-and-forget (nezpůsobí rollback hlavní operace při selhání).

---

## Struktura modulu

```
backend/src/modules/campaign/
├── campaign.module.ts
├── campaign.controller.ts
├── campaign.service.ts
├── schemas/
│   ├── campaign-subject.schema.ts
│   ├── campaign-relationship.schema.ts
│   ├── campaign-storyline.schema.ts
│   ├── campaign-scenario.schema.ts
│   ├── campaign-quick-note.schema.ts
│   ├── campaign-shop-item.schema.ts
│   └── campaign-change-log.schema.ts
├── interfaces/
│   ├── campaign-subject.interface.ts
│   ├── campaign-relationship.interface.ts
│   ├── campaign-storyline.interface.ts
│   ├── campaign-scenario.interface.ts
│   ├── campaign-quick-note.interface.ts
│   ├── campaign-shop-item.interface.ts
│   ├── campaign-change-log.interface.ts
│   └── campaign-*-repository.interface.ts  (7×)
├── repositories/
│   ├── campaign-subject.repository.ts
│   ├── campaign-relationship.repository.ts
│   ├── campaign-storyline.repository.ts
│   ├── campaign-scenario.repository.ts
│   ├── campaign-quick-note.repository.ts
│   ├── campaign-shop-item.repository.ts
│   └── campaign-change-log.repository.ts
└── dto/
    ├── create-campaign-subject.dto.ts
    ├── create-campaign-relationship.dto.ts
    ├── create-campaign-storyline.dto.ts
    ├── create-campaign-scenario.dto.ts
    ├── create-campaign-quick-note.dto.ts
    └── create-campaign-shop-item.dto.ts
```

---

## Feature Parity se starým systémem

| Starý systém | Nový systém | Změny |
|---|---|---|
| PC/NPC/FACTION/ORG | PC/NPC/LOCATION/ORG/FACTION | přidána LOCATION |
| strength — chybí | sideA.strength + sideB.strength (1–10) | nové pole |
| PJ_BASE_ token | isShared: boolean | čistší model |
| žádný changelog | CampaignChangeLog | nové |
| žádná indexace | compound indexy na všech kolekcích | nové |
| GET /players | GET /campaign/players | shodné |
| GET /dashboard | GET /campaign/dashboard | shodné |
