# Krok 12b — Sound Database — Design

**Datum:** 2026-05-05  
**Status:** Schváleno

---

## Přehled

Databáze zvuků se dvěma úrovněmi: per-world (spravuje PJ) a globální pool (spravuje Admin/Superadmin). PJ může navrhnout zvuk ze svého světa do globálního poolu — Admin ho schválí nebo zamítne. Deduplicita zabraňuje duplikátům v globální DB. Integrace s taktickou mapou přes již existující `map:sound-changed` Socket.io event.

---

## Schema

Jedna kolekce `sounds`. `worldId=null` označuje globální pool.

```typescript
Sound {
  worldId: string | null        // null = globální pool; string = per-world

  // Metadata
  name: string
  youtubeUrl: string

  // Kategorizace (enumy — viz níže)
  mediaType: SoundMediaType
  primaryFunction: SoundPrimaryFunction
  environment: SoundEnvironment
  emotionalTone: SoundEmotionalTone
  intensity: number             // 1–5
  duration: number              // sekundy
  loop: boolean
  onsetProfile: SoundOnsetProfile
  outroProfile: SoundOutroProfile
  factionStyle: SoundFactionStyle
  techLevel: SoundTechLevel
  magicLevel: SoundMagicLevel
  combatEnergy: SoundCombatEnergy
  tags: string[]
  notes: string

  // Pouze pro globální zvuky (worldId=null)
  status: 'active' | 'pending' | 'rejected'  // world soundy mají vždy 'active'
  proposedBy: string | null     // userId PJ, který nominoval
  proposedByWorldId: string | null
  rejectReason: string | null

  // Audit
  createdBy: string             // userId
  createdAt: Date
}
```

### Enumy (port ze starého systému)

```typescript
enum SoundMediaType       { music, ambient, sfx, signal, voice }
enum SoundPrimaryFunction { safe, social, exploration, tension, threat, combat, ritual, horror, revelation, aftermath, transition, system }
enum SoundEnvironment     { neutral, nature, urban, interior, industrial, military, sacral, arcane, digital, alien, ruin, void }
enum SoundEmotionalTone   { calm, wonder, melancholy, mystery, dread, fear, urgency, aggression, grief, awe, faith, corruption }
enum SoundOnsetProfile    { instant, fast, soft, slow }
enum SoundOutroProfile    { hard, soft, fade, seamless }
enum SoundFactionStyle    { civilian, noble, religious, military, corporate, criminal, tribal, arcane, alien }
enum SoundTechLevel       { preindustrial, industrial, modern, advanced, posthuman }
enum SoundMagicLevel      { none, low, medium, high, extreme }
enum SoundCombatEnergy    { none, low, medium, high }
```

### MongoDB indexy

- `{ worldId: 1, name: 1 }` — deduplicita + filtrování per world
- `{ worldId: 1, mediaType: 1 }` — filtrování
- `{ status: 1 }` — admin fronta pending nominations

---

## API

### Globální pool — `/api/sounds`

| Metoda | Endpoint | Role | Popis |
|--------|----------|------|-------|
| GET | `/api/sounds` | JWT | Všechny approved globální zvuky (`status=active`) |
| GET | `/api/sounds/pending` | Admin+ | Fronta nominations (`status=pending`) |
| GET | `/api/sounds/:id` | JWT | Detail zvuku |
| POST | `/api/sounds` | Admin+ | Přímé přidání do globální DB (status=active) |
| PUT | `/api/sounds/:id` | Admin+ | Editace globálního zvuku |
| DELETE | `/api/sounds/:id` | Admin+ | Smazání globálního zvuku |
| POST | `/api/sounds/:id/approve` | Admin+ | Schválení nomination → status=active |
| POST | `/api/sounds/:id/reject` | Admin+ | Zamítnutí → status=rejected, body: `{ reason: string }` |

### Per-world — `/api/worlds/:worldId/sounds`

| Metoda | Endpoint | Role | Popis |
|--------|----------|------|-------|
| GET | `/api/worlds/:worldId/sounds` | JWT člen | Zvuky daného světa |
| POST | `/api/worlds/:worldId/sounds` | PJ/PomocnýPJ | Přidat zvuk do světa |
| PUT | `/api/worlds/:worldId/sounds/:id` | PJ/PomocnýPJ | Editace world zvuku |
| DELETE | `/api/worlds/:worldId/sounds/:id` | PJ/PomocnýPJ | Smazání world zvuku |
| POST | `/api/worlds/:worldId/sounds/:id/nominate` | PJ/PomocnýPJ | Navrhnout zvuk do globální DB |
| POST | `/api/worlds/:worldId/sounds/import/:globalId` | PJ/PomocnýPJ | Importovat globální zvuk do světa (vytvoří kopii s worldId) |

---

## Deduplicita

Při **nominaci** (`POST /api/worlds/:worldId/sounds/:id/nominate`) backend před vytvořením pending záznamu zkontroluje globální pool (všechny statusy):

1. `youtubeUrl` exact match
2. `name` case-insensitive match

Pokud shoda → `409 Conflict` s ID a názvem kolidujícího zvuku. Rejected zvuky **také blokují** nominaci (PJ musí kontaktovat admina pro přehodnocení).

Při **přímém přidání** adminem (`POST /api/sounds`) stejná deduplicita kontrola.

---

## Access Control

| Akce | Kdo |
|------|-----|
| GET globální (approved) | Jakýkoli přihlášený uživatel |
| GET pending | Admin, Superadmin |
| Mutace globální (POST/PUT/DELETE/approve/reject) | Admin, Superadmin |
| GET per-world | Člen daného světa (JWT) |
| Mutace per-world (POST/PUT/DELETE/nominate/import) | PJ, PomocnýPJ daného světa |

Role kontrola per-world přes `WorldMembership` — stejný vzor jako Maps, NpcTemplates.

---

## MapHub integrace

`MapsGateway` již obsahuje `map:sound-changed` event:

```typescript
@SubscribeMessage('map:sound-changed')
handleSoundChanged(payload: { sceneId: string; soundIds: string[] }, client: Socket): void {
  client.to(payload.sceneId).emit('map:sound-changed', payload.soundIds);
}
```

`MapScene.activeSoundIds: string[]` ukládá aktivní zvuky scény. Při změně frontend emituje `map:sound-changed` — žádný nový gateway event není potřeba. Backend nemusí validovat existence soundId (frontend zodpovědnost).

---

## Modul struktura

```
src/modules/sounds/
  sounds.module.ts
  sounds.service.ts
  sounds.service.spec.ts
  sounds.controller.ts          // /api/sounds/* (globální)
  world-sounds.controller.ts    // /api/worlds/:worldId/sounds/*
  schemas/
    sound.schema.ts
  interfaces/
    sound.interface.ts
    sounds-repository.interface.ts
  repositories/
    sounds.repository.ts
  dto/
    create-sound.dto.ts
    update-sound.dto.ts
    nominate-sound.dto.ts
    reject-sound.dto.ts
```

Jeden `SoundsRepository` sdílí kolekci pro oba scopy (world i global) — filtrování přes `worldId`.

---

## Datový tok — Nomináce

```
PJ → POST /worlds/:id/sounds/:soundId/nominate
  → dedup check (URL + name) v globální DB
  → 409 pokud shoda
  → vytvoř Sound { worldId: null, status: 'pending', proposedBy, proposedByWorldId, ...data ze source }
  → 201 Created

Admin → GET /api/sounds/pending
Admin → POST /api/sounds/:id/approve
  → sound.status = 'active'
  → 200 OK

Admin → POST /api/sounds/:id/reject  { reason }
  → sound.status = 'rejected', sound.rejectReason = reason
  → 200 OK
```

---

## Co není součástí tohoto kroku

- Push notifikace PJ při approve/reject (Krok 13)
- Přehrávání zvuků na backendu — čistě frontend zodpovědnost
- Hromadný import/export zvuků
