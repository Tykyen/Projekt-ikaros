# Krok 6a Rozšíření — Pages doplňky: Design

**Datum:** 2026-05-02  
**Stav:** Schváleno

---

## Přehled

Rozšíření existujícího Pages modulu (Krok 6a) o chybějící pole, utility, seed šablony, extra endpointy a FavoritePages. Navazuje na `krok-6a-pages` plán.

---

## Sekce 1: Nová pole na Page dokumentu

Tři nová pole přibydou do interface, schématu i DTO:

```typescript
menu: MenuItem[]     // navigační panel stránky
plainText: string    // auto-generováno z content, nikdy v DTO
isWoodWide: boolean  // příznak speciální viditelnosti (WoodWide AKJ skupina)
```

### MenuItem

```typescript
export interface MenuItem {
  label: string;
  href: string;
  order: number;
}
```

Navigační panel zobrazuje seznam odkazů na související stránky/zdroje světa. PJ může sestavit ručně nebo použít šablonu z WorldSettings (viz krok-6d).

### plainText

- Nikdy se neposílá z frontendu — generuje ho `TipTapExtractor` automaticky při `create` i `update`
- V `CreatePageDto` / `UpdatePageDto` toto pole chybí záměrně
- Používá se pro vyhledávání stránek v TipTap editoru ("Vložit odkaz")

### isWoodWide

- Boolean příznak — stránka vyžaduje přístup přes WoodWide AKJ skupinu
- Access check se napojí na AKJ typy definované v WorldSettings (viz krok-6d)
- `GET /meta/:slug` vrací `{ isWoodWide: bool }` pro rychlou kontrolu bez načtení celé stránky

---

## Sekce 2: TipTapExtractor

Jednoduchý injectable service pro stripování HTML na čistý text:

```typescript
@Injectable()
export class TipTapExtractor {
  extract(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
```

Volá se v `PagesService.create()` i `update()`. Výsledek se uloží do `page.plainText`.

---

## Sekce 3: MatrixWorldFilter

**Stav: k rozhodnutí**

Technický problém — v databázi mohou být `worldId` uložena jako string nebo ObjectId, dotazy pak nenajdou záznamy. Utilita by pokryla oba formáty:

```typescript
export function worldFilter(worldId: string): Record<string, unknown> {
  return { $or: [{ worldId }, { worldId: new Types.ObjectId(worldId) }] };
}
```

Implementace závisí na tom zda nový kód ukládá `worldId` konzistentně jako string (pak není potřeba).

---

## Sekce 4: Seed — 5 šablon stránek

Při vytvoření světa se automaticky vytvoří 5 výchozích stránek přes `world.created` event (EventEmitter2):

| Slug | Typ | Order |
|---|---|---|
| `pravidla` | Ostatní | 0 |
| `magicky-system` | Ostatní | 1 |
| `technologie` | Ostatní | 2 |
| `faq` | Ostatní | 3 |
| `videa` | Obrazovka | 4 |

Všechny začínají s:
- `content: ''`, `menu: []`, `accessRequirements: []`
- `isWoodWide: false`, `plainText: ''`

`WorldsService` emituje `world.created` → `PagesModule` odchytí a vytvoří šablony. Stejný pattern jako `character.created` → `CharacterSubdocsModule`.

---

## Sekce 5: Extra endpointy

Čtyři nové GET endpointy pod `/api/worlds/:worldId/pages`:

| Endpoint | Popis | Auth |
|---|---|---|
| `GET /directory` | Seznam všech stránek bez access filtru (slug + title) — pro navigaci světa | člen světa |
| `GET /meta/:slug` | Vrátí `{ isWoodWide: bool }` — rychlá kontrola bez načtení celé stránky | člen světa |
| `GET /data?number=N` | N náhodných stránek (default N=5) — pro doporučené / dashboard | člen světa |
| `GET /dataSlugs` | Seznam všech slugů — pro TipTap "Vložit odkaz" vyhledávač | člen světa |

`/directory` se liší od `GET /` tím, že ignoruje `accessRequirements` — vrátí všechny stránky pro navigační menu.

---

## Sekce 6: FavoritePages

World-scoped oblíbené stránky — PJ označí stránky jako prioritní pro daný svět.

### Datový model

Pole `favoritePageSlugs: string[]` přibude přímo na `World` dokumentu.

### Endpointy

| Metoda | Cesta | Popis | Role |
|---|---|---|---|
| `POST` | `/api/worlds/:worldId/pages/:slug/favorite` | Přidat do oblíbených | PJ / Admin |
| `DELETE` | `/api/worlds/:worldId/pages/:slug/favorite` | Odebrat z oblíbených | PJ / Admin |
| `GET` | `/api/worlds/:worldId/favorites` | Seznam oblíbených stránek světa | člen světa |
| `GET` | `/api/worlds/:worldId/pages/:slug` | Detail stránky — vrátí i `isFavorite: bool` | dle accessRequirements |

---

## Architektura

Rozšíření jsou součástí existujícího `PagesModule`. Nové soubory:

- `backend/src/modules/pages/tiptap-extractor.service.ts`
- `backend/src/modules/pages/utils/world-filter.ts` *(pokud se rozhodne implementovat)*

Upravené soubory:
- `page.interface.ts` — přidat `menu`, `plainText`, `isWoodWide`
- `page.schema.ts` — přidat odpovídající `@Prop`
- `create-page.dto.ts` — přidat `menu` (bez `plainText`)
- `pages.repository.ts` — přidat `toEntity` mapování
- `pages.service.ts` — volat TipTapExtractor, přidat nové service metody
- `pages.controller.ts` — přidat 4 extra endpointy + favorite endpointy
- `worlds.service.ts` — emitovat `world.created` event
- `worlds/schemas/world.schema.ts` — přidat `favoritePageSlugs`
- `worlds/interfaces/world.interface.ts` — přidat `favoritePageSlugs: string[]`
