# Krok 10e — WorldCurrencies: Design Spec

**Datum:** 2026-05-04  
**Stav:** Schváleno

---

## Přehled

Samostatný modul pro měnový systém světa. Měny jsou vyčleněny z `WorldSettings` do vlastní kolekce `world_currencies` (1 dokument per world), následují vzor `WorldCalendarConfig`. Modul poskytuje CRUD endpointy pro správu měn a konverzní endpoint pro přepočet mezi měnami.

---

## Datový model

### Kolekce: `world_currencies`

Jeden dokument per world (1:1 vazba přes `worldId`).

```
WorldCurrencies {
  id: string
  worldId: string          // unique index
  items: WorldCurrencyItem[]
  updatedAt: Date
}

WorldCurrencyItem {
  id: string               // UUID, generovaný serverem
  code: string             // zkratka: 'ZL', 'ST', 'CR'
  name: string             // 'Zlaťák', 'Kredit'
  symbol: string           // 'Zl', 'Cr'
  rate: number             // poměr k základní jednotce světa (base má rate=1.0)
}
```

### Konverzní matematika

`rate` je absolutní poměr k bázové měně (ta s nejvyšší hodnotou má rate=1.0):

- ZL = 1.0, ST = 0.1, MD = 0.01
- přepočet: `result = amount × (from.rate / to.rate)`
- příklad: 5 ZL → ST = `5 × (1.0 / 0.1)` = 50 ST
- příklad: 1 ST → MD = `1 × (0.1 / 0.01)` = 10 MD

---

## API endpointy

Všechny endpointy jsou pod prefixem `worlds/:worldId/`.

### GET /api/worlds/:worldId/currencies
- **Auth:** JwtAuthGuard + členství ve světě
- **Response:** `{ worldId, items: WorldCurrencyItem[] }`
- Pokud dokument neexistuje → vrátí prázdné `items: []`

### PUT /api/worlds/:worldId/currencies
- **Auth:** JwtAuthGuard + role PJ nebo Admin
- **Body:** `{ items: WorldCurrencyItemDto[] }`
- Full replace — nahradí celé `items[]`
- Auto-create pokud dokument neexistuje (upsert)
- Server přiřadí `id` (UUID) položkám bez `id`

### POST /api/worlds/:worldId/currencies/convert
- **Auth:** JwtAuthGuard + členství ve světě
- **Body:** `{ amount: number, from: string, to: string }` (from/to = code)
- **Response:** `{ from, to, amount, result: number }`
- Chyba 400 pokud `from` nebo `to` code neexistuje v měnách světa
- Chyba 400 pokud `from === to`
- Výsledek zaokrouhlen na 4 desetinná místa

---

## Seed při vytvoření světa

Metoda `getCurrenciesForGenre(genre)` se přesune z `WorldsService` do `WorldCurrenciesService`. Zavolá se v `WorldsService.create()` po vytvoření světa — stejný pattern jako seed `WorldCalendarConfig`.

### Seedované sady dle žánru

| Žánr | Měny |
|------|------|
| fantasy, dark-fantasy, heroic-fantasy, sword-sorcery, grimdark, mytologicky | ZL (1.0), ST (0.1), MD (0.01) |
| cyberpunk, sci-fi, hard-sci-fi, soft-sci-fi, biopunk | CR (1.0), NUSD (2.5) |
| space-opera, military | CR (1.0), KR (100.0) |
| postapo, post-postapo, dieselpunk | ZAT (1.0), PR (50.0) |
| ostatní | MNC (1.0) |

---

## Architektura modulu

```
backend/src/modules/world-currencies/
  schemas/world-currencies.schema.ts
  interfaces/world-currencies.interface.ts
  interfaces/world-currencies-repository.interface.ts
  repositories/world-currencies.repository.ts
  dto/update-world-currencies.dto.ts
  dto/convert-currency.dto.ts
  world-currencies.service.ts
  world-currencies.controller.ts       // @Controller('worlds')
  world-currencies.module.ts
```

Controller je zaregistrován pod `@Controller('worlds')` — endpointy tak přirozeně sedí na `/api/worlds/:worldId/currencies`.

`WorldCurrenciesModule` exportuje `WorldCurrenciesService`. `WorldsModule` ho importuje pro seed při vytvoření světa.

---

## Vztah k WorldSettings.currencies

Pole `WorldSettings.currencies` zůstane ve schématu beze změny — nové endpointy ho ignorují, seedování nového světa přestane plnit toto pole. Čisté odstranění patří do Krok 16 cleanup.

---

## Validace

`UpdateWorldCurrenciesDto`:
- `items`: povinné pole, může být prázdné (`[]`)
- každá položka: `code` (string, neprázdný), `name` (string), `symbol` (string), `rate` (number, min 0.0001)
- `id` na položce je volitelné — server ho doplní UUID pokud chybí

`ConvertCurrencyDto`:
- `amount`: number, min 0
- `from`: string, neprázdný
- `to`: string, neprázdný

---

## Chybové stavy

| Situace | HTTP |
|---------|------|
| `from` nebo `to` code neexistuje | 400 Bad Request |
| `from === to` | 400 Bad Request |
| Uživatel není členem světa | 403 Forbidden |
| Uživatel není PJ/Admin (pro PUT) | 403 Forbidden |
