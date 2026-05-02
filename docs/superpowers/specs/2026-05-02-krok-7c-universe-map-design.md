# Návrh: Krok 7c — Universe Map

## Přehled

3D vesmírná mapa světa — uzly (planety, hvězdy, nebuly...), spojení mezi nimi, postupné odhalování hráčům. Každý svět má vlastní mapu; PJ ji buduje od nuly nebo upravuje. Matrix world dostane předvyplněný seed (40 uzlů, 108+ spojení). Změny se propagují real-time přes WebSocket.

---

## Datový model

### UniverseMap schema

```typescript
@Schema({ timestamps: true, collection: 'universeMaps' })
UniverseMapSchemaClass {
  worldId:  string           // per-world izolace; unique index
  nodes:    UniverseNode[]
  links:    UniverseLink[]
}
```

Index: `{ worldId: 1, unique: true }`

### UniverseNode

```typescript
interface UniverseNode {
  id:                 string    // unikátní v rámci mapy (např. "Midgard")
  name:               string
  type:               'planet' | 'star' | 'nebula' | 'asteroid' | 'moon' | 'blackhole'
  color:              string    // hex barva frakce (např. "#ffffff")
  size:               number    // vizuální velikost 1–10
  img?:               string    // Cloudinary ID nebo URL obrázku
  alliance?:          string    // název frakce (volný string, backend neinterpretuje)
  x?:                 number    // 3D souřadnice (vypočítává frontend — ForceGraph3D)
  y?:                 number
  z?:                 number
  isPublic:           boolean        // viditelný všem hráčům
  visibleToPlayerIds: string[]       // viditelný konkrétním hráčům (userId)
}
```

### UniverseLink

```typescript
interface UniverseLink {
  source:  string    // UniverseNode.id
  target:  string    // UniverseNode.id
  isOrbit: boolean   // true = kruhová vizualizace (měsíce)
}
```

### UniverseMap interface

```typescript
interface UniverseMap {
  id:        string
  worldId:   string
  nodes:     UniverseNode[]
  links:     UniverseLink[]
  createdAt: Date
  updatedAt: Date
}
```

---

## API endpointy

Základní cesta: `/api/universe`

| Metoda | Cesta | Auth | Popis |
|--------|-------|------|-------|
| `GET` | `/?worldId=:id` | bez JWT | Mapa světa; hráči dostanou filtrovanou, PJ/Admin dostanou vše |
| `PUT` | `/?worldId=:id` | JWT; PJ+ nebo Admin | Full replace celé mapy |
| `PATCH` | `/:worldId/nodes/:nodeId/visibility` | JWT; PJ+ nebo Admin | Odhalení/skrytí jednoho uzlu bez posílání celé mapy |

### GET — visibility filtr

- **PJ / Admin:** vrátí mapu beze změny
- **Hráč (JWT nebo anon):** vrátí pouze uzly kde `isPublic=true` NEBO `visibleToPlayerIds` obsahuje userId volajícího
- **Filtr linků:** odkaz kde alespoň jeden z uzlů (`source` nebo `target`) není viditelný pro volajícího se nevrátí — neprozradí existenci skrytého uzlu

### GET — lazy init

Pokud dokument pro `worldId` neexistuje:
- **Matrix worldId:** auto-vloží seed (40 uzlů, 108+ spojení)
- **Ostatní světy:** vytvoří prázdný dokument `{ nodes: [], links: [] }`

Matrix world se identifikuje podle world slugu `matrix` — service načte worldId přes `IWorldsRepository.findBySlug('matrix')` při startu modulu (nebo lazy při prvním požadavku). Alternativa: `MATRIX_WORLD_ID` env proměnná — konzistentní s Krokem 15.

### PUT body

```json
{
  "nodes": [...],
  "links": [...]
}
```

`worldId` se bere vždy z query parametru, nikdy z těla requestu.

### PATCH body

```json
{
  "isPublic": true,
  "visibleToPlayerIds": ["userId1", "userId2"]
}
```

Pokud `nodeId` v `nodes[]` neexistuje → 404. Úspěch → vrátí aktualizovanou celou mapu.

---

## Architektura modulu

```
modules/universe/
  universe.module.ts
  universe.controller.ts
  universe.service.ts
  universe.service.spec.ts
  universe.gateway.ts
  schemas/
    universe-map.schema.ts
  interfaces/
    universe-map.interface.ts
    universe-repository.interface.ts
  repositories/
    universe.repository.ts
  dto/
    update-universe.dto.ts
    update-node-visibility.dto.ts
  seed/
    matrix-universe.seed.ts       ← 40 uzlů, 108+ spojení
```

### IUniverseRepository

```typescript
interface IUniverseRepository {
  findByWorld(worldId: string): Promise<UniverseMap | null>
  upsert(worldId: string, nodes: UniverseNode[], links: UniverseLink[]): Promise<UniverseMap>
  updateNodeVisibility(worldId: string, nodeId: string, dto: UpdateNodeVisibilityDto): Promise<UniverseMap | null>
}
```

---

## Access control

| Operace | Kdo může |
|---------|----------|
| GET | kdokoliv; výsledek filtrován dle role |
| PUT | JWT; WorldRole.PJ nebo vyšší, nebo Admin+ |
| PATCH visibility | JWT; WorldRole.PJ nebo vyšší, nebo Admin+ |

---

## Real-time

Po každém `PUT` nebo úspěšném `PATCH` service emituje event:

```typescript
this.eventEmitter.emit('universe.updated', { worldId, map })
```

### UniverseGateway

```typescript
@OnEvent('universe.updated')
handleUniverseUpdated({ worldId, map }) {
  // broadcast do world roomu — každý connection dostane svůj filtrovaný pohled
  this.server.to(`world:${worldId}`).emit('universe:updated', map)
}
```

Poznámka: filtrování visibility per-connection by vyžadovalo iteraci přes všechny sockety v roomu — pro první verzi broadcastujeme plná data a **filtrování provádí frontend** dle svého JWT role. PJ vidí vše, hráč aplikuje filtr lokálně. Pokud bude potřeba server-side filtr per-socket, přidáme v pozdější iteraci.

---

## Seeding (Matrix world)

`matrix-universe.seed.ts` exportuje statická data — 40 uzlů z legacy systému:

**Frakce a barvy:**
| Frakce | Barva |
|--------|-------|
| Glacijská | `#00bfff` |
| Asgardská | `#ffee00` |
| Alfská | `#b24bf3` |
| Vanirská | `#11bb55` |
| Lidská | `#ffffff` |
| Trpasličí | `#aa0000` |
| Nordská | `#888888` |
| Svobodná | `#222222` |

**Uzly (výběr):** Midgard, Asgard, Vanaheim, Alfheim, Jotunheim, Niflheim, Muspelheim, Hellheim, Svartalfheim, Olymp, Babylon, Trója, Simheim, Yume, Folkvangr, Purgatorium, Noutun, Qiunxun, Hvelgelmir, Urdarbrunnr, Mímismundr, Svar, Bhuvar, Bhúr, Eden, Nav, Lachesis, Tim, Fránangrské vodopády, Neo Kosmos, Veschonechye Lesa, Tartaros, Ma'an Ashwada, Aleasr althalith, Alsini alththani, Alsinu al'awal, + 4 měsíce (Měsíc, Infernun, Caelum + Měsíc Asgard)

Všechny uzly se seedují s `isPublic: true` (historická data — vše bylo veřejné). PJ může viditelnost následně upravit.

---

## Testování

Unit testy na service vrstvě s mockovanými repositories (vzor z `npc-templates.service.spec.ts`).

### UniverseService — testy

- `findByWorld` — existující worldId → vrátí mapu; neexistující Matrix worldId → vrátí seed; neexistující jiný worldId → vrátí prázdnou mapu
- `update` — ověř že `worldId` z parametru, ne z DTO; vrátí aktualizovanou mapu
- `updateNodeVisibility` — neexistující nodeId → NotFoundException; úspěch → vrátí aktualizovanou mapu
- Visibility filtr — hráč nevidí uzly kde `isPublic=false` a není v `visibleToPlayerIds`; linky na skryté uzly jsou odstraněny

### Co netestujeme

- Validaci obsahu `alliance` a pozic (x/y/z) — frontend zodpovědnost
- Reálné MongoDB operace — mock stačí

---

## Závislosti

| Závisí na | Proč |
|-----------|------|
| Krok 1 Základ | JWT guard, WorldRole check |
| Krok 2 Světy | worldId validace, WorldMembership pro access control |
| Krok 8 Mapy | UniverseMap je nezávislý — Krok 8 na něm nezávisí |
