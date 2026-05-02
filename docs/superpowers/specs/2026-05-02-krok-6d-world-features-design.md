# Krok 6d — World Features: Design

**Datum:** 2026-05-02  
**Stav:** Schváleno

---

## Přehled

Cross-cutting rozšíření na úrovni světa: pojmenované AKJ skupiny, menu šablony pro stránky, a automatické plnění profilových fotek z postav.

---

## Sekce 1: AKJ typy v WorldSettings

PJ si pro každý svět definuje pojmenované přístupové skupiny. Každá skupina má klíč, zobrazený název a numerický level (access check zůstává numerický — `membership.akj >= group.level`).

### Datový model

Nové pole v `WorldSettings`:

```typescript
akjTypes: AkjType[]
```

```typescript
export interface AkjType {
  key: string;    // interní identifikátor, např. 'woodwide'
  name: string;   // zobrazený název, např. 'Wood Wide Web'
  level: number;  // numerický level, např. 7
}
```

### Matrix seed

Při vytvoření Matrix světa se automaticky vytvoří dvě skupiny:

```typescript
[
  { key: 'akj',      name: 'AKJ',           level: 5 },
  { key: 'woodwide', name: 'Wood Wide Web',  level: 7 },
]
```

### Využití

- Frontend zobrazí název skupiny místo čísla (hráč vidí "Wood Wide Web" ne "7")
- `isWoodWide` na Page odpovídá skupině s `key: 'woodwide'`
- Nový typ v `AccessRequirement`: `{ type: 'AKJType', value: 'woodwide' }` — alternativa k numerickému `AKJ`

---

## Sekce 2: Menu šablony v WorldSettings

PJ si uloží opakovaně použitelné šablony navigačního panelu pro stránky.

### Datový model

Nové pole v `WorldSettings`:

```typescript
menuTemplates: MenuTemplate[]
```

```typescript
export interface MenuTemplate {
  name: string;                          // název šablony, např. 'Postava — plná'
  items: { label: string; href: string; order: number }[];
}
```

### Využití

Při vytváření / úpravě stránky PJ vybere šablonu → frontend vyplní `page.menu` položkami ze šablony. Šablona se jen zkopíruje, neváže se na ni trvale.

---

## Sekce 3: PopulateProfileImages

Automatické plnění `user.profileImageUrl` z `character.imageUrl` pro CP (postavy s přiřazeným `userId`).

### Logika

1. Pro každou CP s `userId` vezmi `character.imageUrl`
2. Pokud `user.profileImageUrl` je prázdné → nastav na `character.imageUrl`
3. Pokud `user.profileImageUrl` již existuje → nepřepisuj (zachová ruční nastavení)

### Kdy se spustí

- Při startu aplikace — backfill existujících dat
- Po `character.created` eventu — nová CP
- Po `character.updated` eventu — jen pokud se změnilo `imageUrl`

### Architektura

`PopulateProfileImagesService` v `CharactersModule` — poslouchá EventEmitter2 eventy `character.created` a `character.updated`. Žádný cron scheduler. Při startu aplikace spustí backfill přes `OnApplicationBootstrap`.

---

## Architektura — přehled souborů

**WorldSettings rozšíření:**
- `world-settings.interface.ts` — přidat `akjTypes`, `menuTemplates`
- `world-settings.schema.ts` — přidat `@Prop` pro obě pole
- `update-world-settings.dto.ts` — přidat validaci obou polí

**PopulateProfileImages:**
- `backend/src/modules/characters/populate-profile-images.service.ts` — nový service

**Seed:**
- `backend/src/database/seed/matrix-world.seed.ts` — rozšířit o AKJ typy pro Matrix
