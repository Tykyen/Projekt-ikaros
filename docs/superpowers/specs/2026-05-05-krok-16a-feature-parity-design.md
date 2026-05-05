# Krok 16a — Feature Parity Checklist: Design

**Datum:** 2026-05-05  
**Stav:** schváleno

---

## Cíl

Ověřit, že nový NestJS backend pokrývá veškerou funkcionalitu starého C# backendu (`C:\Matrix\Matrix\backend`). Výsledkem je spustitelný skript, který automaticky analyzuje oba kodebase a vygeneruje `docs/checklist-be.md` se zjištěnými mezerami.

Záměrně vylepšené nebo přepracované věci se **nepovažují za mezery** — zajímají nás pouze funkce, které chybí úplně.

---

## Přístup

**Kombinace: ts-morph AST (NestJS) + regex (C#)**

- Pro nový NestJS backend: `ts-morph` AST parser — 100% přesné čtení dekorátorů, typů, tříd
- Pro starý C# backend: regex na ASP.NET atributy — spolehlivé díky konzistentním vzorům ASP.NET Core
- Výstup: strukturovaný JSON + čitelný Markdown checklist

---

## Struktura skriptu

```
backend/scripts/parity-check/
  index.ts              ← vstupní bod, orchestrace všech analyzerů
  lib/
    parse-csharp.ts     ← regex parser pro C# soubory
    parse-nestjs.ts     ← ts-morph AST parser pro NestJS soubory
    comparator.ts       ← normalizace cest, diff logika, fuzzy matching
    report.ts           ← generuje JSON + Markdown
  output/
    parity-report.json  ← strojový výstup (gitignored)
```

**Výstupní dokument:** `docs/checklist-be.md`

---

## Dimenze analýzy (6 vrstev)

### 1. REST endpointy

**Starý C#:**
- Třídní atribut `[Route("api/[controller]")]` → base path
- Metodové atributy `[HttpGet("path")]`, `[HttpPost]`, `[HttpPut]`, `[HttpDelete]`, `[HttpPatch]` → HTTP verb + sub-path
- Sestavení absolutní routy: base + sub

**Nový NestJS:**
- `@Controller('path')` → base path (ts-morph: dekorátor třídy)
- `@Get('path')`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()` → HTTP verb + sub-path (ts-morph: dekorátor metody)
- Sestavení absolutní routy: `/api/` + controller + method path

**Normalizace pro porovnání:**
- `{id}` (C#) ↔ `:id` (NestJS) → oba na `{param}`
- `[controller]` → lowercase název controlleru (bez "Controller" suffixu)
- Case-insensitive porovnání cest

**Fuzzy matching:**
- Přesná shoda (verb + path)
- Shoda path bez parametrů (odhalí přejmenované parametry)
- Označení jako `renamed` pokud se path liší jen v názvu parametru

### 2. WebSocket události

**Starý C# (SignalR):**
- Klient→server: public metody v třídách dědících `Hub` = volatelné metody
- Server→klient: `SendAsync("EventName", ...)` volání = emitované eventy

**Nový NestJS (Socket.io):**
- Klient→server: `@SubscribeMessage('event')` dekorátory (ts-morph)
- Server→klient: `this.server.emit('eventName', ...)` a `this.server.to(...).emit(...)` volání

Porovnání per hub: `ChatHub` ↔ `ChatGateway`, `MapHub` ↔ `MapsGateway`, `IkarosChatHub` ↔ `GlobalChatGateway`

### 3. MongoDB schémata / kolekce

**Starý C#:**
- Název `.cs` model třídy v `Models/` → odvození collection name (konvence nebo `[Collection("name")]` atribut)

**Nový NestJS:**
- `@Schema()` třídy v `*.schema.ts` souborech (ts-morph: dekorátor třídy)
- `MongooseModule.forFeature([{ name: X, schema: Y }])` v module souborech → collection name

Výsledek: seznam kolekcí na obou stranách, diff.

### 4. Cron joby / background joby

**Starý C#:**
- Třídy implementující `IHostedService` nebo dědící `BackgroundService`
- Identifikace dle názvu a účelu

**Nový NestJS:**
- `@Cron('schedule')` dekorátory (ts-morph)
- Třídní dekorátor `@Injectable()` na třídách s `@Cron` metodami

### 5. JWT claims

**Starý C#:**
- `new Claim(type, value)` volání v `AuthController.cs`
- Extrakce hodnot `ClaimTypes.*` a `JwtRegisteredClaimNames.*`

**Nový NestJS:**
- JWT payload objekt sestavený v `auth.service.ts` nebo `jwt.strategy.ts`
- ts-morph: hledá `sign({ ... })` volání nebo payload objekty

### 6. Seed data

**Starý C#:**
- `Program.cs` inicializační kód
- Skripty v `scripts/` adresáři starého projektu

**Nový NestJS:**
- Soubory v `backend/src/database/seed/`
- ts-morph: třídní a metodové struktury seed souborů

---

## Výstupní formáty

### parity-report.json (strojový)

```json
{
  "generatedAt": "ISO timestamp",
  "summary": {
    "endpoints": { "old": N, "new": N, "covered": N, "missing": N, "renamed": N },
    "websocket": { ... },
    "schemas": { ... },
    "cronJobs": { ... },
    "jwtClaims": { ... },
    "seedData": { ... }
  },
  "endpoints": {
    "covered": [{ "old": "GET /api/worlds", "new": "GET /api/worlds" }],
    "missing": [{ "old": "GET /api/foo/bar", "reason": "no match found" }],
    "renamed": [{ "old": "GET /api/worlds/{id}", "new": "GET /api/worlds/:worldId", "confidence": "high" }],
    "extra": [{ "new": "GET /api/admin/users", "note": "nový endpoint bez starého ekvivalentu" }]
  },
  "websocket": { ... },
  "schemas": { ... },
  "cronJobs": { ... },
  "jwtClaims": { ... },
  "seedData": { ... }
}
```

### docs/checklist-be.md (Checklist BE)

Struktura:
1. **Sumarizační tabulka** — počty covered/missing per dimenze
2. **REST endpointy** — tabulka per controller, ✅/❌/⚠️
3. **WebSocket události** — per hub/gateway
4. **MongoDB schémata** — seznam kolekcí
5. **Cron joby** — seznam jobů
6. **JWT claims** — porovnání claims
7. **Seed data** — co je seedováno
8. **Závěry a rozhodnutí** — sekce pro manuální doplnění po analýze

Ikony: ✅ pokryto | ❌ chybí | ⚠️ pravděpodobně přejmenováno/refaktorováno

---

## Jak spustit

```bash
cd backend
npm install ts-morph   # pokud ještě není v dependencies
npx ts-node scripts/parity-check/index.ts
# → vygeneruje docs/checklist-be.md a backend/scripts/parity-check/output/parity-report.json
```

---

## Závislosti

- `ts-morph` — AST analýza TypeScript souborů
- Node.js `fs`, `path` — procházení souborů
- Žádné runtime závislosti NestJS — skript běží standalone

---

## Co skript neověřuje (manuální kontrola)

- Správnost business logiky (jen přítomnost endpointů)
- Autorizační pravidla per endpoint (role checks)
- Chování při edge cases
- Výkonnostní charakteristiky

Tyto aspekty jsou zahrnuty v sekci **Závěry a rozhodnutí** v `checklist-be.md` pro manuální doplnění.
