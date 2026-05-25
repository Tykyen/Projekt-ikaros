# Backfill — Multi-config kalendáře (9.2b)

Migrace existujících světů do nového multi-config modelu kalendářů.

## Co skript dělá

Pro každý `World` v DB:

1. **Scénář A — legacy singular config** (`world_calendar_configs` doc bez `slug` field, pre-9.2b):
   - Doplní `slug: 'default'`, `name: 'Default kalendář'`.
   - Přidá prázdné `seasons[]`, `epochOffset: 0`.
   - Konvertuje `celestialBodies` z discriminated union (moon/sun/planet/comet/other) na 9.2a uniform shape.
   - Set `World.defaultCalendarConfigSlug = 'default'`.

2. **Scénář B — existující config s `slug`** (re-run po 9.2b deploy):
   - No-op pro config samotný.
   - Zachová `defaultCalendarConfigSlug` (preferuje 'gregorian' pokud existuje, jinak první config).

3. **Scénář C — žádný config** (svět nikdy nenastavil kalendář):
   - Vytvoří Gregorian default config (`slug: 'gregorian'`, 12 měsíců, 7 dnů, Měsíc 29.5306d, 4 sezóny).
   - Set `World.defaultCalendarConfigSlug = 'gregorian'`.

V každém scénáři:
- Smaže legacy `World.calendarConfig` inline subdoc (9.2b-I konsolidace).
- Set `World.timelineEpoch = 0` (default).

## Idempotent

Re-spuštění na již migrovaném světě je no-op.

## Spuštění

**Dry-run (default):**

```bash
MONGODB_URI=mongodb://localhost:27017/ikaros \
  npx tsx scripts/backfill-multi-calendar-config-9.2b/index.ts
```

**Apply (skutečný zápis):**

```bash
MONGODB_URI=mongodb://localhost:27017/ikaros \
  npx tsx scripts/backfill-multi-calendar-config-9.2b/index.ts --apply
```

**Filtr na konkrétní svět:**

```bash
MONGODB_URI=... npx tsx scripts/.../index.ts --apply --world=<worldId>
```

## Rollback

Před produkčním `--apply`: `mongodump` kolekcí `worlds` a `world_calendar_configs`.
Pokud potřeba revert: `mongorestore` z dumpu.

## Reference

- Spec: `docs/arch/phase-9/spec-9.2b-multi-config-editor.md`
- Plan: `docs/arch/phase-9/plan-9.2b-multi-config-editor.md`
- BE template parity: `backend/src/modules/world-calendar-config/gregorian-default.ts`
- FE engine: `Projekt-ikaros-FE/src/shared/lib/calendarEngine/gregorianDefault.ts`
