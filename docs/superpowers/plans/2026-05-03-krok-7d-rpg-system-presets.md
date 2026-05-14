# Krok 7d — RPG System Presets — Implementační plán (Fáze 3.4)

> **Datum vzniku:** 2026-05-03
> **Aktualizováno:** 2026-05-06 (revize během brainstormingu Fáze 3.4 — detailní presety + auth pattern konzistence)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementovat `SystemPresetsModule` se 16 detailními RPG presety (D&D 5e/2e/3+, DrD Hero, 5x DrD16, GURPS, Call of Cthulhu, Fate, Shadowrun, Jad, Pi, Matrix custom) + `DiarySchemaVersion` archivační kolekci. Auto-seed `WorldSettings.diarySchema` při create světa; archive + re-seed při změně `World.system`.

**Architecture:** `SystemPresetsModule` (standalone, ne `@Global()`) drží 16 statických TS presetů; žádná DB. Exportuje `SystemPresetsService`. `WorldsModule` rozšíří `WorldsService` o injekci `SystemPresetsService` + `IDiarySchemaVersionsRepository`. `WorldsController` dostane 2 nové GET endpointy (auth-required). Žádné cyklické závislosti.

**Tech Stack:** NestJS 11, Mongoose 9, class-validator, Jest, TypeScript strict.

**Závislosti:** `WorldsModule`, `CharactersModule` (pro `SchemaBlock` interface).

**Spec:** [2026-05-03-krok-7d-rpg-system-presets-design.md](../specs/2026-05-03-krok-7d-rpg-system-presets-design.md)

---

## File Structure

```
backend/src/modules/system-presets/                  # NEW MODULE
├── system-presets.module.ts
├── system-presets.controller.ts
├── system-presets.service.ts
├── system-presets.service.spec.ts
├── interfaces/
│   └── system-preset.interface.ts
└── presets/
    ├── index.ts                                     # exportuje SYSTEM_PRESETS pole
    ├── dnd5e.preset.ts
    ├── dnd2e.preset.ts
    ├── dnd3plus.preset.ts
    ├── drd-hero.preset.ts
    ├── drd16-warrior.preset.ts
    ├── drd16-wizard.preset.ts
    ├── drd16-thief.preset.ts
    ├── drd16-ranger.preset.ts
    ├── drd16-alchemy.preset.ts
    ├── gurps.preset.ts
    ├── call-of-cthulhu.preset.ts
    ├── fate.preset.ts
    ├── shadowrun.preset.ts
    ├── jad.preset.ts
    ├── pi.preset.ts
    └── matrix-custom.preset.ts

backend/src/modules/worlds/diary-schema-versions/   # NEW SUBFOLDER
├── diary-schema-version.interface.ts
├── diary-schema-versions-repository.interface.ts
├── diary-schema-versions.repository.ts
└── diary-schema-versions.schema.ts

# MODIFIED:
backend/src/modules/worlds/worlds.service.ts        # rozšíření create() a update()
backend/src/modules/worlds/worlds.service.spec.ts   # nové testy
backend/src/modules/worlds/worlds.controller.ts     # 2 nové GET endpointy
backend/src/modules/worlds/worlds.module.ts         # registrace + import SystemPresetsModule
backend/src/app.module.ts                           # import SystemPresetsModule
docs/roadmap2.md                                    # 3.4 → splněno
```

---

## Pre-flight checks

- [ ] **Step 0.1:** Baseline

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check 2>&1 | tail -5
```

Expected: PASS, ~658 testů.

---

## Task 1: SystemPreset interface + presets/index.ts kostra

**Files:**
- Create: `backend/src/modules/system-presets/interfaces/system-preset.interface.ts`
- Create: `backend/src/modules/system-presets/presets/index.ts` (zatím prázdné pole, naplníme v Task 2-5)

- [ ] **Step 1.1:** Interface

`backend/src/modules/system-presets/interfaces/system-preset.interface.ts`:
```ts
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface SystemPreset {
  system: string;        // unikátní identifikátor (lowercase-kebab)
  displayName: string;   // zobrazované jméno
  schema: SchemaBlock[];
}
```

- [ ] **Step 1.2:** Index registr (zatím prázdný — naplníme v Task 2-5)

`backend/src/modules/system-presets/presets/index.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

// Tasks 2-5 přidají importy a položky do tohoto pole.
export const SYSTEM_PRESETS: SystemPreset[] = [];
```

- [ ] **Step 1.3:** Verify

```bash
cd backend && npm run typecheck
```

Expected: PASS.

- [ ] **Step 1.4:** Commit

```bash
git add backend/src/modules/system-presets
git commit -m "feat(system-presets): interface + prázdný registr (kostra)"
```

---

## Task 2: D&D rodina presety (3 systémy)

**Files:**
- Create: `backend/src/modules/system-presets/presets/dnd5e.preset.ts`
- Create: `backend/src/modules/system-presets/presets/dnd2e.preset.ts`
- Create: `backend/src/modules/system-presets/presets/dnd3plus.preset.ts`
- Modify: `backend/src/modules/system-presets/presets/index.ts`

- [ ] **Step 2.1:** D&D 5e

`backend/src/modules/system-presets/presets/dnd5e.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const dnd5ePreset: SystemPreset = {
  system: 'dnd5e',
  displayName: 'D&D 5e',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'subclass', label: 'Podpovolání', type: 'text', order: 3 },
    { key: 'race', label: 'Rasa', type: 'text', order: 4 },
    { key: 'background', label: 'Zázemí', type: 'text', order: 5 },
    { key: 'alignment', label: 'Přesvědčení', type: 'text', order: 6 },
    { key: 'hpMax', label: 'Životy max', type: 'number', order: 7 },
    { key: 'hpCurrent', label: 'Životy aktuální', type: 'number', order: 8 },
    { key: 'ac', label: 'AC (Armor Class)', type: 'number', order: 9 },
    { key: 'speed', label: 'Rychlost (ft)', type: 'number', order: 10 },
    { key: 'initiative', label: 'Iniciativa', type: 'number', order: 11 },
    { key: 'proficiencyBonus', label: 'Proficiency Bonus', type: 'number', order: 12 },
    { key: 'str', label: 'Síla (STR)', type: 'number', order: 13 },
    { key: 'dex', label: 'Obratnost (DEX)', type: 'number', order: 14 },
    { key: 'con', label: 'Odolnost (CON)', type: 'number', order: 15 },
    { key: 'int', label: 'Inteligence (INT)', type: 'number', order: 16 },
    { key: 'wis', label: 'Moudrost (WIS)', type: 'number', order: 17 },
    { key: 'cha', label: 'Charisma (CHA)', type: 'number', order: 18 },
    { key: 'savingThrows', label: 'Záchranné hody', type: 'textarea', order: 19 },
    { key: 'skills', label: 'Dovednosti', type: 'textarea', order: 20 },
    { key: 'languages', label: 'Jazyky', type: 'textarea', order: 21 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 22 },
    { key: 'spells', label: 'Kouzla', type: 'textarea', order: 23 },
    { key: 'features', label: 'Vlastnosti & rysy', type: 'textarea', order: 24 },
    { key: 'notes', label: 'Poznámky', type: 'textarea', order: 25 },
  ],
};
```

- [ ] **Step 2.2:** D&D 2e

`backend/src/modules/system-presets/presets/dnd2e.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const dnd2ePreset: SystemPreset = {
  system: 'dnd2e',
  displayName: 'D&D 2e',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'alignment', label: 'Přesvědčení', type: 'text', order: 4 },
    { key: 'hpMax', label: 'Životy max', type: 'number', order: 5 },
    { key: 'hpCurrent', label: 'Životy aktuální', type: 'number', order: 6 },
    { key: 'ac', label: 'AC (descending)', type: 'number', order: 7 },
    { key: 'thac0', label: 'THAC0', type: 'number', order: 8 },
    { key: 'hitDice', label: 'Hit Dice', type: 'text', order: 9 },
    { key: 'str', label: 'Síla', type: 'number', order: 10 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 11 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 12 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 13 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 14 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 15 },
    { key: 'savingParalyze', label: 'Save: Paralyze/Death', type: 'number', order: 16 },
    { key: 'savingRod', label: 'Save: Rod/Staff/Wand', type: 'number', order: 17 },
    { key: 'savingPetrify', label: 'Save: Petrification', type: 'number', order: 18 },
    { key: 'savingBreath', label: 'Save: Breath Weapon', type: 'number', order: 19 },
    { key: 'savingSpell', label: 'Save: Spell', type: 'number', order: 20 },
    { key: 'languages', label: 'Jazyky', type: 'textarea', order: 21 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 22 },
    { key: 'notes', label: 'Poznámky', type: 'textarea', order: 23 },
  ],
};
```

- [ ] **Step 2.3:** D&D 3+

`backend/src/modules/system-presets/presets/dnd3plus.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const dnd3plusPreset: SystemPreset = {
  system: 'dnd3plus',
  displayName: 'D&D 3+ (3e/3.5/Pathfinder)',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'alignment', label: 'Přesvědčení', type: 'text', order: 4 },
    { key: 'hpMax', label: 'Životy max', type: 'number', order: 5 },
    { key: 'hpCurrent', label: 'Životy aktuální', type: 'number', order: 6 },
    { key: 'ac', label: 'AC', type: 'number', order: 7 },
    { key: 'acTouch', label: 'AC Touch', type: 'number', order: 8 },
    { key: 'acFlatFooted', label: 'AC Flat-Footed', type: 'number', order: 9 },
    { key: 'bab', label: 'BAB (Base Attack Bonus)', type: 'number', order: 10 },
    { key: 'savingFort', label: 'Save: Fortitude', type: 'number', order: 11 },
    { key: 'savingRef', label: 'Save: Reflex', type: 'number', order: 12 },
    { key: 'savingWill', label: 'Save: Will', type: 'number', order: 13 },
    { key: 'str', label: 'Síla', type: 'number', order: 14 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 15 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 16 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 17 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 18 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 19 },
    { key: 'skills', label: 'Dovednosti & body', type: 'textarea', order: 20 },
    { key: 'feats', label: 'Feats', type: 'textarea', order: 21 },
    { key: 'languages', label: 'Jazyky', type: 'textarea', order: 22 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 23 },
    { key: 'notes', label: 'Poznámky', type: 'textarea', order: 24 },
  ],
};
```

- [ ] **Step 2.4:** Update index.ts

`backend/src/modules/system-presets/presets/index.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';
import { dnd5ePreset } from './dnd5e.preset';
import { dnd2ePreset } from './dnd2e.preset';
import { dnd3plusPreset } from './dnd3plus.preset';

export const SYSTEM_PRESETS: SystemPreset[] = [
  dnd5ePreset,
  dnd2ePreset,
  dnd3plusPreset,
];
```

- [ ] **Step 2.5:** Verify

```bash
cd backend && npm run typecheck && npm run lint:check
```

Expected: PASS.

- [ ] **Step 2.6:** Commit

```bash
git add backend/src/modules/system-presets/presets
git commit -m "feat(system-presets): D&D rodina (5e, 2e, 3+) — 3 detailní presety"
```

---

## Task 3: DrD rodina presety (6 systémů)

**Files:**
- Create: `drd-hero.preset.ts`, `drd16-warrior.preset.ts`, `drd16-wizard.preset.ts`, `drd16-thief.preset.ts`, `drd16-ranger.preset.ts`, `drd16-alchemy.preset.ts`
- Modify: `presets/index.ts`

- [ ] **Step 3.1:** DrD Hero

`backend/src/modules/system-presets/presets/drd-hero.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drdHeroPreset: SystemPreset = {
  system: 'drd-hero',
  displayName: 'DrD Hero',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'sila', label: 'Síla', type: 'number', order: 4 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 5 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 6 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 7 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 8 },
    { key: 'bystrost', label: 'Bystrost', type: 'number', order: 9 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 10 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 11 },
    { key: 'magenergie', label: 'Magenergie', type: 'number', order: 12 },
    { key: 'utok', label: 'Útok', type: 'number', order: 13 },
    { key: 'obrana', label: 'Obrana', type: 'number', order: 14 },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 15 },
    { key: 'zkusenosti', label: 'Zkušenosti', type: 'number', order: 16 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 17 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 18 },
  ],
};
```

- [ ] **Step 3.2:** DrD 16 Warrior

`backend/src/modules/system-presets/presets/drd16-warrior.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16WarriorPreset: SystemPreset = {
  system: 'drd16-warrior',
  displayName: 'DrD 16 — Bojovník',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'sila', label: 'Síla', type: 'number', order: 3 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 4 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 5 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'unava', label: 'Únava', type: 'number', order: 10 },
    { key: 'bojoveStyly', label: 'Bojové styly', type: 'textarea', order: 11 },
    { key: 'zbranovaSpec', label: 'Zbraňová specializace', type: 'textarea', order: 12 },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 13 },
    { key: 'vyzkum', label: 'Výzkum', type: 'textarea', order: 14 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 15 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 16 },
  ],
};
```

- [ ] **Step 3.3:** DrD 16 Wizard

`backend/src/modules/system-presets/presets/drd16-wizard.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16WizardPreset: SystemPreset = {
  system: 'drd16-wizard',
  displayName: 'DrD 16 — Čaroděj',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'sila', label: 'Síla', type: 'number', order: 3 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 4 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 5 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'magenergieMax', label: 'Magenergie max', type: 'number', order: 10 },
    { key: 'magenergieCurrent', label: 'Magenergie aktuální', type: 'number', order: 11 },
    { key: 'sfera', label: 'Sféra', type: 'text', order: 12 },
    { key: 'naucenaKouzla', label: 'Naučená kouzla', type: 'textarea', order: 13 },
    { key: 'komponenty', label: 'Komponenty', type: 'textarea', order: 14 },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 15 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 16 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 17 },
  ],
};
```

- [ ] **Step 3.4:** DrD 16 Thief

`backend/src/modules/system-presets/presets/drd16-thief.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16ThiefPreset: SystemPreset = {
  system: 'drd16-thief',
  displayName: 'DrD 16 — Zloděj',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'sila', label: 'Síla', type: 'number', order: 3 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 4 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 5 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'unava', label: 'Únava', type: 'number', order: 10 },
    { key: 'zlodejskeDovednosti', label: 'Zlodějské dovednosti', type: 'textarea', order: 11 },
    { key: 'skryse', label: 'Skrýše', type: 'textarea', order: 12 },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 13 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 14 },
    { key: 'kontakty', label: 'Kontakty', type: 'textarea', order: 15 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 16 },
  ],
};
```

- [ ] **Step 3.5:** DrD 16 Ranger

`backend/src/modules/system-presets/presets/drd16-ranger.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16RangerPreset: SystemPreset = {
  system: 'drd16-ranger',
  displayName: 'DrD 16 — Hraničář',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'sila', label: 'Síla', type: 'number', order: 3 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 4 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 5 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'unava', label: 'Únava', type: 'number', order: 10 },
    { key: 'loveckeDovednosti', label: 'Lovecké dovednosti', type: 'textarea', order: 11 },
    { key: 'stopovani', label: 'Stopování', type: 'textarea', order: 12 },
    { key: 'spolecnik', label: 'Společník (zvíře)', type: 'textarea', order: 13 },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 14 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 15 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 16 },
  ],
};
```

- [ ] **Step 3.6:** DrD 16 Alchemy

`backend/src/modules/system-presets/presets/drd16-alchemy.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16AlchemyPreset: SystemPreset = {
  system: 'drd16-alchemy',
  displayName: 'DrD 16 — Alchymista',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'sila', label: 'Síla', type: 'number', order: 3 },
    { key: 'obratnost', label: 'Obratnost', type: 'number', order: 4 },
    { key: 'odolnost', label: 'Odolnost', type: 'number', order: 5 },
    { key: 'inteligence', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'magenergie', label: 'Magenergie', type: 'number', order: 10 },
    { key: 'receptury', label: 'Známé receptury', type: 'textarea', order: 11 },
    { key: 'komponenty', label: 'Komponenty (zásoby)', type: 'textarea', order: 12 },
    { key: 'laborator', label: 'Laboratoř (vybavení)', type: 'textarea', order: 13 },
    { key: 'cestaHrdiny', label: 'Cesta hrdiny', type: 'textarea', order: 14 },
    { key: 'vybaveni', label: 'Osobní vybavení', type: 'textarea', order: 15 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 16 },
  ],
};
```

- [ ] **Step 3.7:** Update index.ts — přidat 6 importů a položek

```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';
import { dnd5ePreset } from './dnd5e.preset';
import { dnd2ePreset } from './dnd2e.preset';
import { dnd3plusPreset } from './dnd3plus.preset';
import { drdHeroPreset } from './drd-hero.preset';
import { drd16WarriorPreset } from './drd16-warrior.preset';
import { drd16WizardPreset } from './drd16-wizard.preset';
import { drd16ThiefPreset } from './drd16-thief.preset';
import { drd16RangerPreset } from './drd16-ranger.preset';
import { drd16AlchemyPreset } from './drd16-alchemy.preset';

export const SYSTEM_PRESETS: SystemPreset[] = [
  dnd5ePreset,
  dnd2ePreset,
  dnd3plusPreset,
  drdHeroPreset,
  drd16WarriorPreset,
  drd16WizardPreset,
  drd16ThiefPreset,
  drd16RangerPreset,
  drd16AlchemyPreset,
];
```

- [ ] **Step 3.8:** Verify + commit

```bash
cd backend && npm run typecheck && npm run lint:check
git add backend/src/modules/system-presets/presets
git commit -m "feat(system-presets): DrD rodina (Hero + 5x DrD16) — 6 detailních presetů"
```

---

## Task 4: Mainstream RPG presety (4 systémy)

**Files:**
- Create: `gurps.preset.ts`, `call-of-cthulhu.preset.ts`, `fate.preset.ts`, `shadowrun.preset.ts`
- Modify: `presets/index.ts`

> **Konvence labelů (rozhodnutí 2026-05-06):** Mezinárodní RPG (GURPS, CoC, Fate, Shadowrun) si zachovají **anglické labely** (např. "Body", "Agility", "Sanity", "Edge", "Essence"). Termíny jsou součástí komunitního jazyka; čeští hráči s anglickými pravidly očekávají originální názvosloví. **CZ-specifické systémy** (Dračí doupě, ASF) zůstávají v češtině s diakritikou. Per dluhy.md final code review Fáze 3.4.

- [ ] **Step 4.1:** GURPS

`backend/src/modules/system-presets/presets/gurps.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const gurpsPreset: SystemPreset = {
  system: 'gurps',
  displayName: 'GURPS',
  schema: [
    { key: 'pointsTotal', label: 'Body celkem', type: 'number', order: 1 },
    { key: 'pointsSpent', label: 'Body utracené', type: 'number', order: 2 },
    { key: 'st', label: 'ST (Strength)', type: 'number', order: 3 },
    { key: 'dx', label: 'DX (Dexterity)', type: 'number', order: 4 },
    { key: 'iq', label: 'IQ (Intelligence)', type: 'number', order: 5 },
    { key: 'ht', label: 'HT (Health)', type: 'number', order: 6 },
    { key: 'hp', label: 'HP', type: 'number', order: 7 },
    { key: 'fp', label: 'FP (Fatigue Points)', type: 'number', order: 8 },
    { key: 'will', label: 'Will', type: 'number', order: 9 },
    { key: 'per', label: 'Per (Perception)', type: 'number', order: 10 },
    { key: 'speed', label: 'Speed', type: 'number', order: 11 },
    { key: 'move', label: 'Move', type: 'number', order: 12 },
    { key: 'advantages', label: 'Advantages', type: 'textarea', order: 13 },
    { key: 'disadvantages', label: 'Disadvantages', type: 'textarea', order: 14 },
    { key: 'quirks', label: 'Quirks', type: 'textarea', order: 15 },
    { key: 'skills', label: 'Skills', type: 'textarea', order: 16 },
    { key: 'languages', label: 'Languages', type: 'textarea', order: 17 },
    { key: 'equipment', label: 'Equipment', type: 'textarea', order: 18 },
    { key: 'notes', label: 'Notes', type: 'textarea', order: 19 },
  ],
};
```

- [ ] **Step 4.2:** Call of Cthulhu (7e)

`backend/src/modules/system-presets/presets/call-of-cthulhu.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const callOfCthulhuPreset: SystemPreset = {
  system: 'call-of-cthulhu',
  displayName: 'Call of Cthulhu (7e)',
  schema: [
    { key: 'occupation', label: 'Occupation', type: 'text', order: 1 },
    { key: 'age', label: 'Age', type: 'number', order: 2 },
    { key: 'str', label: 'STR (Strength)', type: 'number', order: 3 },
    { key: 'con', label: 'CON (Constitution)', type: 'number', order: 4 },
    { key: 'siz', label: 'SIZ (Size)', type: 'number', order: 5 },
    { key: 'dex', label: 'DEX (Dexterity)', type: 'number', order: 6 },
    { key: 'app', label: 'APP (Appearance)', type: 'number', order: 7 },
    { key: 'int', label: 'INT (Intelligence)', type: 'number', order: 8 },
    { key: 'pow', label: 'POW (Power)', type: 'number', order: 9 },
    { key: 'edu', label: 'EDU (Education)', type: 'number', order: 10 },
    { key: 'hp', label: 'HP', type: 'number', order: 11 },
    { key: 'mp', label: 'MP (Magic Points)', type: 'number', order: 12 },
    { key: 'sanity', label: 'Sanity', type: 'number', order: 13 },
    { key: 'luck', label: 'Luck', type: 'number', order: 14 },
    { key: 'move', label: 'Move Rate', type: 'number', order: 15 },
    { key: 'build', label: 'Build', type: 'number', order: 16 },
    { key: 'damageBonus', label: 'Damage Bonus', type: 'text', order: 17 },
    { key: 'occupationSkills', label: 'Occupation Skills', type: 'textarea', order: 18 },
    { key: 'personalSkills', label: 'Personal Skills', type: 'textarea', order: 19 },
    { key: 'backstory', label: 'Backstory', type: 'textarea', order: 20 },
    { key: 'equipment', label: 'Equipment', type: 'textarea', order: 21 },
    { key: 'notes', label: 'Notes', type: 'textarea', order: 22 },
  ],
};
```

- [ ] **Step 4.3:** Fate Core

`backend/src/modules/system-presets/presets/fate.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const fatePreset: SystemPreset = {
  system: 'fate',
  displayName: 'Fate Core',
  schema: [
    { key: 'highConcept', label: 'High Concept', type: 'text', order: 1 },
    { key: 'trouble', label: 'Trouble', type: 'text', order: 2 },
    { key: 'aspect1', label: 'Aspect 1', type: 'text', order: 3 },
    { key: 'aspect2', label: 'Aspect 2', type: 'text', order: 4 },
    { key: 'aspect3', label: 'Aspect 3', type: 'text', order: 5 },
    { key: 'refresh', label: 'Refresh', type: 'number', order: 6 },
    { key: 'fatePoints', label: 'Fate Points', type: 'number', order: 7 },
    { key: 'skills', label: 'Skills (Pyramid)', type: 'textarea', order: 8 },
    { key: 'stunts', label: 'Stunts', type: 'textarea', order: 9 },
    { key: 'physicalStress', label: 'Physical Stress', type: 'text', order: 10 },
    { key: 'mentalStress', label: 'Mental Stress', type: 'text', order: 11 },
    { key: 'mildConsequence', label: 'Mild Consequence', type: 'text', order: 12 },
    { key: 'moderateConsequence', label: 'Moderate Consequence', type: 'text', order: 13 },
    { key: 'severeConsequence', label: 'Severe Consequence', type: 'text', order: 14 },
    { key: 'extras', label: 'Extras', type: 'textarea', order: 15 },
    { key: 'notes', label: 'Notes', type: 'textarea', order: 16 },
  ],
};
```

- [ ] **Step 4.4:** Shadowrun

`backend/src/modules/system-presets/presets/shadowrun.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const shadowrunPreset: SystemPreset = {
  system: 'shadowrun',
  displayName: 'Shadowrun',
  schema: [
    { key: 'metatype', label: 'Metatype', type: 'text', order: 1 },
    { key: 'archetype', label: 'Archetype', type: 'text', order: 2 },
    { key: 'body', label: 'Body', type: 'number', order: 3 },
    { key: 'agility', label: 'Agility', type: 'number', order: 4 },
    { key: 'reaction', label: 'Reaction', type: 'number', order: 5 },
    { key: 'strength', label: 'Strength', type: 'number', order: 6 },
    { key: 'willpower', label: 'Willpower', type: 'number', order: 7 },
    { key: 'logic', label: 'Logic', type: 'number', order: 8 },
    { key: 'intuition', label: 'Intuition', type: 'number', order: 9 },
    { key: 'charisma', label: 'Charisma', type: 'number', order: 10 },
    { key: 'edge', label: 'Edge', type: 'number', order: 11 },
    { key: 'essence', label: 'Essence', type: 'number', order: 12 },
    { key: 'initiative', label: 'Initiative', type: 'text', order: 13 },
    { key: 'physicalLimit', label: 'Physical Limit', type: 'number', order: 14 },
    { key: 'mentalLimit', label: 'Mental Limit', type: 'number', order: 15 },
    { key: 'socialLimit', label: 'Social Limit', type: 'number', order: 16 },
    { key: 'skills', label: 'Skills', type: 'textarea', order: 17 },
    { key: 'qualities', label: 'Qualities', type: 'textarea', order: 18 },
    { key: 'magicResonance', label: 'Magic / Resonance', type: 'textarea', order: 19 },
    { key: 'cyberware', label: 'Cyberware', type: 'textarea', order: 20 },
    { key: 'lifestyle', label: 'Lifestyle', type: 'text', order: 21 },
    { key: 'notes', label: 'Notes', type: 'textarea', order: 22 },
  ],
};
```

- [ ] **Step 4.5:** Update index.ts

```ts
// ... předchozí importy ...
import { gurpsPreset } from './gurps.preset';
import { callOfCthulhuPreset } from './call-of-cthulhu.preset';
import { fatePreset } from './fate.preset';
import { shadowrunPreset } from './shadowrun.preset';

export const SYSTEM_PRESETS: SystemPreset[] = [
  // ... předchozí ...
  gurpsPreset,
  callOfCthulhuPreset,
  fatePreset,
  shadowrunPreset,
];
```

- [ ] **Step 4.6:** Verify + commit

```bash
cd backend && npm run typecheck && npm run lint:check
git add backend/src/modules/system-presets/presets
git commit -m "feat(system-presets): mainstream RPG (GURPS, CoC, Fate, Shadowrun) — 4 detailní presety"
```

---

## Task 5: Originální systémy presety (3 systémy)

**Files:**
- Create: `jad.preset.ts`, `pi.preset.ts`, `matrix-custom.preset.ts`
- Modify: `presets/index.ts`

> Pozn.: Jad, Pi, Matrix custom jsou domain-specific systémy bez veřejných referencí. Implementujeme **generické scaffold bloky** s poznámkou, že PJ může editovat přes `PUT /api/worlds/:id/settings`.

- [ ] **Step 5.1:** Jad

`backend/src/modules/system-presets/presets/jad.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const jadPreset: SystemPreset = {
  system: 'jad',
  displayName: 'Jad',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'class', label: 'Povolání', type: 'text', order: 3 },
    { key: 'attribute1', label: 'Atribut 1', type: 'number', order: 4 },
    { key: 'attribute2', label: 'Atribut 2', type: 'number', order: 5 },
    { key: 'attribute3', label: 'Atribut 3', type: 'number', order: 6 },
    { key: 'attribute4', label: 'Atribut 4', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 10 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 11 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 12 },
  ],
};
```

- [ ] **Step 5.2:** Pi

`backend/src/modules/system-presets/presets/pi.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const piPreset: SystemPreset = {
  system: 'pi',
  displayName: 'Pi',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'race', label: 'Rasa', type: 'text', order: 2 },
    { key: 'class', label: 'Povolání', type: 'text', order: 3 },
    { key: 'attribute1', label: 'Atribut 1', type: 'number', order: 4 },
    { key: 'attribute2', label: 'Atribut 2', type: 'number', order: 5 },
    { key: 'attribute3', label: 'Atribut 3', type: 'number', order: 6 },
    { key: 'attribute4', label: 'Atribut 4', type: 'number', order: 7 },
    { key: 'zivotyMax', label: 'Životy max', type: 'number', order: 8 },
    { key: 'zivotyCurrent', label: 'Životy aktuální', type: 'number', order: 9 },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 10 },
    { key: 'vybaveni', label: 'Vybavení', type: 'textarea', order: 11 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 12 },
  ],
};
```

- [ ] **Step 5.3:** Matrix custom

`backend/src/modules/system-presets/presets/matrix-custom.preset.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const matrixCustomPreset: SystemPreset = {
  system: 'matrix-custom',
  displayName: 'Matrix custom',
  schema: [
    { key: 'jmeno', label: 'Jméno', type: 'text', order: 1 },
    { key: 'rasa', label: 'Rasa', type: 'text', order: 2 },
    { key: 'povolani', label: 'Povolání', type: 'text', order: 3 },
    { key: 'atributy', label: 'Atributy (custom)', type: 'textarea', order: 4 },
    { key: 'zivoty', label: 'Životy', type: 'text', order: 5 },
    { key: 'dovednosti', label: 'Dovednosti', type: 'textarea', order: 6 },
    { key: 'inventar', label: 'Inventář', type: 'textarea', order: 7 },
    { key: 'pribeh', label: 'Příběh', type: 'textarea', order: 8 },
    { key: 'poznamky', label: 'Poznámky', type: 'textarea', order: 9 },
  ],
};
```

- [ ] **Step 5.4:** Update index.ts (final, all 16)

`backend/src/modules/system-presets/presets/index.ts`:
```ts
import type { SystemPreset } from '../interfaces/system-preset.interface';
import { dnd5ePreset } from './dnd5e.preset';
import { dnd2ePreset } from './dnd2e.preset';
import { dnd3plusPreset } from './dnd3plus.preset';
import { drdHeroPreset } from './drd-hero.preset';
import { drd16WarriorPreset } from './drd16-warrior.preset';
import { drd16WizardPreset } from './drd16-wizard.preset';
import { drd16ThiefPreset } from './drd16-thief.preset';
import { drd16RangerPreset } from './drd16-ranger.preset';
import { drd16AlchemyPreset } from './drd16-alchemy.preset';
import { gurpsPreset } from './gurps.preset';
import { callOfCthulhuPreset } from './call-of-cthulhu.preset';
import { fatePreset } from './fate.preset';
import { shadowrunPreset } from './shadowrun.preset';
import { jadPreset } from './jad.preset';
import { piPreset } from './pi.preset';
import { matrixCustomPreset } from './matrix-custom.preset';

export const SYSTEM_PRESETS: SystemPreset[] = [
  dnd5ePreset,
  dnd2ePreset,
  dnd3plusPreset,
  drdHeroPreset,
  drd16WarriorPreset,
  drd16WizardPreset,
  drd16ThiefPreset,
  drd16RangerPreset,
  drd16AlchemyPreset,
  gurpsPreset,
  callOfCthulhuPreset,
  fatePreset,
  shadowrunPreset,
  jadPreset,
  piPreset,
  matrixCustomPreset,
];
```

- [ ] **Step 5.5:** Verify + commit

```bash
cd backend && npm run typecheck && npm run lint:check
git add backend/src/modules/system-presets/presets
git commit -m "feat(system-presets): originální systémy (Jad, Pi, Matrix custom) + finální index 16/16"
```

---

## Task 6: SystemPresetsService + Controller + Module (TDD)

**Files:**
- Create: `system-presets.service.ts`, `system-presets.service.spec.ts`, `system-presets.controller.ts`, `system-presets.module.ts`

- [ ] **Step 6.1:** Spec FIRST

`backend/src/modules/system-presets/system-presets.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { SystemPresetsService } from './system-presets.service';

describe('SystemPresetsService', () => {
  let service: SystemPresetsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SystemPresetsService],
    }).compile();
    service = module.get(SystemPresetsService);
  });

  describe('findAll', () => {
    it('vrátí 16 systémů', () => {
      expect(service.findAll()).toHaveLength(16);
    });

    it('položky obsahují system + displayName, ne schema (úspora bandwidth)', () => {
      const result = service.findAll();
      for (const item of result) {
        expect(typeof item.system).toBe('string');
        expect(typeof item.displayName).toBe('string');
        expect(item).not.toHaveProperty('schema');
      }
    });

    it('všechny system identifikátory jsou unikátní', () => {
      const systems = service.findAll().map((p) => p.system);
      expect(new Set(systems).size).toBe(systems.length);
    });
  });

  describe('findOne', () => {
    it('vrátí dnd5e s plným schématem', () => {
      const result = service.findOne('dnd5e');
      expect(result).not.toBeNull();
      expect(result!.system).toBe('dnd5e');
      expect(result!.displayName).toBe('D&D 5e');
      expect(result!.schema.length).toBeGreaterThan(0);
    });

    it('každý SchemaBlock má povinné fieldy', () => {
      const result = service.findOne('dnd5e');
      for (const block of result!.schema) {
        expect(typeof block.key).toBe('string');
        expect(typeof block.label).toBe('string');
        expect(typeof block.type).toBe('string');
        expect(typeof block.order).toBe('number');
      }
    });

    it('orders jsou unique a vzestupné v dnd5e', () => {
      const orders = service.findOne('dnd5e')!.schema.map((b) => b.order);
      expect(new Set(orders).size).toBe(orders.length);
    });

    it('vrátí null pro neexistující systém', () => {
      expect(service.findOne('neexistujici')).toBeNull();
    });

    it('všech 16 systémů je dohledatelných', () => {
      const expected = [
        'dnd5e', 'dnd2e', 'dnd3plus',
        'drd-hero', 'drd16-warrior', 'drd16-wizard', 'drd16-thief', 'drd16-ranger', 'drd16-alchemy',
        'gurps', 'call-of-cthulhu', 'fate', 'shadowrun',
        'jad', 'pi', 'matrix-custom',
      ];
      for (const sys of expected) {
        expect(service.findOne(sys)).not.toBeNull();
      }
    });
  });
});
```

- [ ] **Step 6.2:** Spusť — RED

```bash
cd backend && npx jest system-presets.service.spec --no-coverage
```

Expected: FAIL — `Cannot find module './system-presets.service'`.

- [ ] **Step 6.3:** Implementace

`backend/src/modules/system-presets/system-presets.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import type { SystemPreset } from './interfaces/system-preset.interface';
import { SYSTEM_PRESETS } from './presets';

export interface SystemPresetMeta {
  system: string;
  displayName: string;
}

@Injectable()
export class SystemPresetsService {
  findAll(): SystemPresetMeta[] {
    return SYSTEM_PRESETS.map((p) => ({
      system: p.system,
      displayName: p.displayName,
    }));
  }

  findOne(system: string): SystemPreset | null {
    return SYSTEM_PRESETS.find((p) => p.system === system) ?? null;
  }
}
```

- [ ] **Step 6.4:** Spusť — GREEN

```bash
cd backend && npx jest system-presets.service.spec --no-coverage
```

Expected: vše PASS.

- [ ] **Step 6.5:** Controller

`backend/src/modules/system-presets/system-presets.controller.ts`:
```ts
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemPresetsService } from './system-presets.service';

@ApiTags('System Presets')
@Controller('system-presets')
export class SystemPresetsController {
  constructor(private readonly service: SystemPresetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Seznam všech systémů (anonymní, bez schema[] pro úsporu bandwidth)',
  })
  @ApiResponse({ status: 200 })
  findAll() {
    return this.service.findAll();
  }

  @Get(':system')
  @ApiOperation({ summary: 'Detail presetu (anonymní) — plné schema[]' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('system') system: string) {
    const preset = this.service.findOne(system);
    if (!preset) throw new NotFoundException('Systém nenalezen');
    return preset;
  }
}
```

- [ ] **Step 6.6:** Module

`backend/src/modules/system-presets/system-presets.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SystemPresetsController } from './system-presets.controller';
import { SystemPresetsService } from './system-presets.service';

@Module({
  controllers: [SystemPresetsController],
  providers: [SystemPresetsService],
  exports: [SystemPresetsService],
})
export class SystemPresetsModule {}
```

> Pozn.: NE `@Global()` — standardní explicit import do `WorldsModule` a `AppModule`.

- [ ] **Step 6.7:** Verify + commit

```bash
cd backend && npm run typecheck && npm run lint:check && npx jest system-presets --no-coverage
git add backend/src/modules/system-presets
git commit -m "feat(system-presets): service + controller + module (TDD, 16 systémů)"
```

---

## Task 7: DiarySchemaVersion — interface, schema, repository

**Files:**
- Create: `diary-schema-version.interface.ts`, `diary-schema-versions-repository.interface.ts`, `diary-schema-versions.schema.ts`, `diary-schema-versions.repository.ts`

- [ ] **Step 7.1:** Entity interface

`backend/src/modules/worlds/diary-schema-versions/diary-schema-version.interface.ts`:
```ts
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface DiarySchemaVersion {
  id: string;
  worldId: string;
  version: number;
  system: string;
  schema: SchemaBlock[];
  archivedAt: Date;
}

export interface DiarySchemaVersionMeta {
  version: number;
  system: string;
  archivedAt: Date;
}
```

- [ ] **Step 7.2:** Repository interface

`backend/src/modules/worlds/diary-schema-versions/diary-schema-versions-repository.interface.ts`:
```ts
import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-version.interface';

export interface IDiarySchemaVersionsRepository {
  findMetaByWorldId(worldId: string): Promise<DiarySchemaVersionMeta[]>;
  findByWorldIdAndVersion(
    worldId: string,
    version: number,
  ): Promise<DiarySchemaVersion | null>;
  findLastVersion(worldId: string): Promise<number>;
  create(
    data: Omit<DiarySchemaVersion, 'id'>,
  ): Promise<DiarySchemaVersion>;
}
```

- [ ] **Step 7.3:** Mongoose schema

`backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.schema.ts`:
```ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DiarySchemaVersionDocument =
  HydratedDocument<DiarySchemaVersionSchemaClass>;

@Schema({ timestamps: false, collection: 'diary_schema_versions' })
export class DiarySchemaVersionSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true, min: 1 }) version: number;
  @Prop({ required: true }) system: string;
  @Prop({ type: [Object], default: [] }) schema: Record<string, unknown>[];
  @Prop({ required: true, default: () => new Date() }) archivedAt: Date;
}

export const DiarySchemaVersionSchema = SchemaFactory.createForClass(
  DiarySchemaVersionSchemaClass,
);
DiarySchemaVersionSchema.index(
  { worldId: 1, version: 1 },
  { unique: true },
);
DiarySchemaVersionSchema.index({ worldId: 1, version: -1 });
```

- [ ] **Step 7.4:** Repository

`backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.repository.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiarySchemaVersionSchemaClass } from './diary-schema-versions.schema';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions-repository.interface';
import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-version.interface';
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

@Injectable()
export class MongoDiarySchemaVersionsRepository
  implements IDiarySchemaVersionsRepository
{
  constructor(
    @InjectModel(DiarySchemaVersionSchemaClass.name)
    private readonly model: Model<DiarySchemaVersionSchemaClass>,
  ) {}

  async findMetaByWorldId(
    worldId: string,
  ): Promise<DiarySchemaVersionMeta[]> {
    const docs = await this.model
      .find({ worldId })
      .sort({ version: -1 })
      .select({ version: 1, system: 1, archivedAt: 1 })
      .lean()
      .exec();
    return docs.map((d) => ({
      version: d.version as number,
      system: d.system as string,
      archivedAt: d.archivedAt as Date,
    }));
  }

  async findByWorldIdAndVersion(
    worldId: string,
    version: number,
  ): Promise<DiarySchemaVersion | null> {
    const doc = await this.model.findOne({ worldId, version }).lean().exec();
    if (!doc) return null;
    return this.toEntity(doc as unknown as Record<string, unknown>);
  }

  async findLastVersion(worldId: string): Promise<number> {
    const doc = await this.model
      .findOne({ worldId })
      .sort({ version: -1 })
      .select({ version: 1 })
      .lean()
      .exec();
    return (doc?.version as number) ?? 0;
  }

  async create(
    data: Omit<DiarySchemaVersion, 'id'>,
  ): Promise<DiarySchemaVersion> {
    const doc = await this.model.create(data);
    return this.toEntity(doc.toObject() as unknown as Record<string, unknown>);
  }

  private toEntity(doc: Record<string, unknown>): DiarySchemaVersion {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      version: doc.version as number,
      system: doc.system as string,
      schema: (doc.schema as SchemaBlock[]) ?? [],
      archivedAt: doc.archivedAt as Date,
    };
  }
}
```

- [ ] **Step 7.5:** Verify + commit

```bash
cd backend && npm run typecheck && npm run lint:check
git add backend/src/modules/worlds/diary-schema-versions
git commit -m "feat(worlds): DiarySchemaVersion interface + schema + repository"
```

---

## Task 8: WorldsService rozšíření (TDD)

**Files:**
- Modify: `worlds.service.ts`, `worlds.service.spec.ts`

> Cíl: rozšířit existující `create()` o auto-seed a `update()` o archivace + re-seed při změně `system`. Nezasahovat do dosavadní logiky, jen přidat.

- [ ] **Step 8.1:** Failing testy v `worlds.service.spec.ts`

Najdi existující `describe('WorldsService', ...)` a přidej **na konec** (před zavírací `});` outer describe):

```ts
  describe('create — auto-seed diarySchema dle systému', () => {
    it('známý systém → seedne diarySchema z presetu', async () => {
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'dnd5e',
        displayName: 'D&D 5e',
        schema: [{ key: 'level', label: 'Úroveň', type: 'number', order: 1 }],
      });
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'W1', system: 'dnd5e' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);

      await service.create(
        { name: 'X', slug: 'x', system: 'dnd5e' } as never,
        'u1',
      );

      expect(mockSystemPresetsService.findOne).toHaveBeenCalledWith('dnd5e');
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({
          diarySchema: [
            { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
          ],
        }),
      );
    });

    it('neznámý systém → diarySchema = []', async () => {
      mockSystemPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'W1', system: 'custom' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockCurrenciesService.seedForWorld.mockResolvedValue(undefined);

      await service.create(
        { name: 'X', slug: 'x', system: 'custom' } as never,
        'u1',
      );

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({ diarySchema: [] }),
      );
    });
  });

  describe('update — archive + re-seed při změně system', () => {
    const Admin = { id: 'u1', role: 2, username: 'a' } as const;
    const existingWorld = {
      id: 'W1',
      system: 'dnd5e',
      ownerId: 'someone',
    };

    beforeEach(() => {
      mockWorldsRepo.findById.mockResolvedValue(existingWorld);
      mockWorldsRepo.update.mockResolvedValue({
        ...existingWorld,
        system: 'drd-hero',
      });
    });

    it('změna system + neprázdné stávající schéma → archivace + re-seed', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(0);
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
      });

      await service.update('W1', { system: 'drd-hero' } as never, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          worldId: 'W1',
          version: 1,
          system: 'dnd5e',
          schema: [{ key: 'level', label: 'Level', type: 'number', order: 1 }],
        }),
      );
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({
          diarySchema: [
            { key: 'sila', label: 'Síla', type: 'number', order: 1 },
          ],
        }),
      );
    });

    it('změna system + prázdné stávající schéma → bez archivace, jen re-seed', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [],
      });
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [{ key: 'sila', label: 'Síla', type: 'number', order: 1 }],
      });

      await service.update('W1', { system: 'drd-hero' } as never, Admin);

      expect(mockDiarySchemaVersionsRepo.create).not.toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).toHaveBeenCalled();
    });

    it('bez změny system → ani archivace, ani re-seed', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });

      await service.update(
        'W1',
        { name: 'New name' } as never, // bez system field
        Admin,
      );

      expect(mockDiarySchemaVersionsRepo.create).not.toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).not.toHaveBeenCalled();
    });

    it('změna system na neznámý → archivace + diarySchema = []', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(0);
      mockSystemPresetsService.findOne.mockReturnValue(null);

      await service.update('W1', { system: 'custom' } as never, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalled();
      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'W1',
        expect.objectContaining({ diarySchema: [] }),
      );
    });

    it('verze auto-increment per world (last=2 → next=3)', async () => {
      mockSettingsRepo.findByWorldId.mockResolvedValue({
        worldId: 'W1',
        diarySchema: [
          { key: 'level', label: 'Level', type: 'number', order: 1 },
        ],
      });
      mockDiarySchemaVersionsRepo.findLastVersion.mockResolvedValue(2);
      mockSystemPresetsService.findOne.mockReturnValue({
        system: 'drd-hero',
        displayName: 'DrD Hero',
        schema: [],
      });

      await service.update('W1', { system: 'drd-hero' } as never, Admin);

      expect(mockDiarySchemaVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3 }),
      );
    });
  });

  describe('getDiarySchemaVersions — listing meta', () => {
    const Hrac = { id: 'u1', role: 5, username: 'h' } as const;

    it('member: vrátí meta pole bez schema[]', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 0 });
      mockDiarySchemaVersionsRepo.findMetaByWorldId.mockResolvedValue([
        { version: 2, system: 'dnd5e', archivedAt: new Date() },
        { version: 1, system: 'gurps', archivedAt: new Date() },
      ]);

      const result = await service.getDiarySchemaVersions('W1', Hrac);
      expect(result).toHaveLength(2);
      expect(result[0]).not.toHaveProperty('schema');
    });

    it('non-member: 403', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue(null);
      await expect(
        service.getDiarySchemaVersions('W1', Hrac),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('neexistující svět: 404', async () => {
      mockWorldsRepo.findById.mockResolvedValue(null);
      await expect(
        service.getDiarySchemaVersions('fake', Hrac),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getDiarySchemaVersion — detail', () => {
    const Hrac = { id: 'u1', role: 5, username: 'h' } as const;

    it('member + existující verze: vrátí plný DiarySchemaVersion', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 0 });
      mockDiarySchemaVersionsRepo.findByWorldIdAndVersion.mockResolvedValue({
        id: 'v1',
        worldId: 'W1',
        version: 1,
        system: 'dnd5e',
        schema: [{ key: 'level', label: 'Level', type: 'number', order: 1 }],
        archivedAt: new Date(),
      });

      const result = await service.getDiarySchemaVersion('W1', 1, Hrac);
      expect(result.schema).toHaveLength(1);
    });

    it('member + neexistující verze: 404', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'W1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: 0 });
      mockDiarySchemaVersionsRepo.findByWorldIdAndVersion.mockResolvedValue(null);
      await expect(
        service.getDiarySchemaVersion('W1', 99, Hrac),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
```

A na **vrch** describe (s ostatními mocky), přidej:

```ts
const mockSystemPresetsService = { findOne: jest.fn(), findAll: jest.fn() };
const mockDiarySchemaVersionsRepo = {
  findMetaByWorldId: jest.fn(),
  findByWorldIdAndVersion: jest.fn(),
  findLastVersion: jest.fn(),
  create: jest.fn(),
};
```

A do `Test.createTestingModule.providers`:
```ts
{ provide: SystemPresetsService, useValue: mockSystemPresetsService },
{ provide: 'IDiarySchemaVersionsRepository', useValue: mockDiarySchemaVersionsRepo },
```

Plus import:
```ts
import { SystemPresetsService } from '../system-presets/system-presets.service';
```

- [ ] **Step 8.2:** Spusť — RED

```bash
cd backend && npx jest worlds.service.spec --no-coverage
```

Expected: většina existujících PASS, nové write/get FAIL.

- [ ] **Step 8.3:** Rozšiř `worlds.service.ts`

V `backend/src/modules/worlds/worlds.service.ts`:

1. Přidej importy:
```ts
import { SystemPresetsService } from '../system-presets/system-presets.service';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions-repository.interface';
import type {
  DiarySchemaVersion,
  DiarySchemaVersionMeta,
} from './diary-schema-versions/diary-schema-version.interface';
```

2. Přidej do constructoru (na konec):
```ts
constructor(
  // ... existující ...
  @Inject('IDiarySchemaVersionsRepository')
  private readonly diaryVersionsRepo: IDiarySchemaVersionsRepository,
  private readonly systemPresetsService: SystemPresetsService,
) {}
```

3. Rozšiř `create()` — **na konec** existujícího `create` (po `worldsRepo.save`, před `eventEmitter.emit`):

```ts
// Auto-seed diarySchema z preset (Krok 7d)
const preset = this.systemPresetsService.findOne(world.system);
await this.settingsRepo.upsert(world.id, {
  diarySchema: preset?.schema ?? [],
});
```

4. Rozšiř `update()` — najdi existující kontrolu auth (`canEditWorldData`) a po ní (před `worldsRepo.update`):

```ts
// Krok 7d: archive + re-seed při změně system
if (dto.system && dto.system !== world.system) {
  const settings = await this.settingsRepo.findByWorldId(id);
  if (settings && settings.diarySchema.length > 0) {
    const lastVersion = await this.diaryVersionsRepo.findLastVersion(id);
    await this.diaryVersionsRepo.create({
      worldId: id,
      version: lastVersion + 1,
      system: world.system,
      schema: settings.diarySchema,
      archivedAt: new Date(),
    });
  }
  const preset = this.systemPresetsService.findOne(dto.system);
  await this.settingsRepo.upsert(id, {
    diarySchema: preset?.schema ?? [],
  });
}
```

5. Přidej **nové public metody** (kdekoli mezi existujícími):

```ts
async getDiarySchemaVersions(
  worldId: string,
  requester: RequestUser,
): Promise<DiarySchemaVersionMeta[]> {
  await this.assertMember(worldId, requester);
  return this.diaryVersionsRepo.findMetaByWorldId(worldId);
}

async getDiarySchemaVersion(
  worldId: string,
  version: number,
  requester: RequestUser,
): Promise<DiarySchemaVersion> {
  await this.assertMember(worldId, requester);
  const v = await this.diaryVersionsRepo.findByWorldIdAndVersion(worldId, version);
  if (!v) throw new NotFoundException('Verze nenalezena');
  return v;
}

private async assertMember(
  worldId: string,
  requester: RequestUser,
): Promise<void> {
  // UserRole.Superadmin = 1, Admin = 2 (lower = higher)
  if (requester.role <= UserRole.Admin) return;
  const world = await this.worldsRepo.findById(worldId);
  if (!world) throw new NotFoundException('Svět nenalezen');
  const membership = await this.membershipRepo.findByUserAndWorld(
    requester.id,
    worldId,
  );
  if (!membership) throw new ForbiddenException('Nejsi členem tohoto světa');
  if (membership.role < WorldRole.Hrac) {
    throw new ForbiddenException('Pending členství nemá přístup');
  }
}
```

> Pozn.: `UserRole` je už importován; `WorldRole` taky. Pokud ne, doplň import.

- [ ] **Step 8.4:** Spusť — GREEN

```bash
cd backend && npx jest worlds.service.spec --no-coverage
```

Expected: vše PASS.

- [ ] **Step 8.5:** Commit

```bash
git add backend/src/modules/worlds/worlds.service.ts backend/src/modules/worlds/worlds.service.spec.ts
git commit -m "feat(worlds): rozšíření create()/update() o diarySchema seed/archive + GET versions"
```

---

## Task 9: WorldsController endpointy + WorldsModule + AppModule

**Files:**
- Modify: `worlds.controller.ts`, `worlds.module.ts`, `app.module.ts`

- [ ] **Step 9.1:** Controller — 2 nové GET endpointy

V `backend/src/modules/worlds/worlds.controller.ts`, přidej (kdekoli mezi existujícími @Get/@Post/atd.):

```ts
@Get(':id/diary-schema-versions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Seznam verzí diary schématu (member)' })
@ApiResponse({ status: 200 })
@ApiResponse({ status: 403 })
@ApiResponse({ status: 404 })
getDiarySchemaVersions(
  @Param('id') id: string,
  @CurrentUser() user: RequestUser,
) {
  return this.worldsService.getDiarySchemaVersions(id, user);
}

@Get(':id/diary-schema-versions/:version')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiOperation({ summary: 'Detail verze diary schématu (member)' })
@ApiResponse({ status: 200 })
@ApiResponse({ status: 403 })
@ApiResponse({ status: 404 })
getDiarySchemaVersion(
  @Param('id') id: string,
  @Param('version') version: string,
  @CurrentUser() user: RequestUser,
) {
  const v = parseInt(version, 10);
  if (Number.isNaN(v) || v < 1) {
    throw new BadRequestException('version musí být kladné celé číslo');
  }
  return this.worldsService.getDiarySchemaVersion(id, v, user);
}
```

> Pozn.: `BadRequestException` se importuje z `@nestjs/common` pokud ještě není.

- [ ] **Step 9.2:** WorldsModule — registrace schémy + repo + import SystemPresetsModule

V `backend/src/modules/worlds/worlds.module.ts`:

1. Přidej importy:
```ts
import {
  DiarySchemaVersionSchemaClass,
  DiarySchemaVersionSchema,
} from './diary-schema-versions/diary-schema-versions.schema';
import { MongoDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions.repository';
import { SystemPresetsModule } from '../system-presets/system-presets.module';
```

2. Do `MongooseModule.forFeature` přidej `DiarySchemaVersionSchemaClass`:
```ts
MongooseModule.forFeature([
  // existující ...
  {
    name: DiarySchemaVersionSchemaClass.name,
    schema: DiarySchemaVersionSchema,
  },
]),
```

3. Do `imports` přidej `SystemPresetsModule`.

4. Do `providers` přidej:
```ts
{
  provide: 'IDiarySchemaVersionsRepository',
  useClass: MongoDiarySchemaVersionsRepository,
},
```

- [ ] **Step 9.3:** AppModule — registrace SystemPresetsModule

V `backend/src/app.module.ts`:

1. Najdi import `WorldCalendarConfigModule` (Fáze 4.1) a přidej **pod něj**:
```ts
import { SystemPresetsModule } from './modules/system-presets/system-presets.module';
```

2. V `imports[]` array vlož `SystemPresetsModule,` **za** `WorldCalendarConfigModule,`.

- [ ] **Step 9.4:** Verify

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check 2>&1 | tail -5
```

Expected: PASS, count by měl narůst (~658 + ~6-7 system-presets + ~10 worlds nových = ~675).

- [ ] **Step 9.5:** Commit

```bash
git add backend/src/modules/worlds/worlds.controller.ts backend/src/modules/worlds/worlds.module.ts backend/src/app.module.ts
git commit -m "feat(worlds): GET endpointy pro diary-schema-versions + SystemPresetsModule wire"
```

---

## Task 10: Final verification + roadmap update

- [ ] **Step 10.1:** Plný test run + production build

```bash
cd backend && npm run typecheck && npm run lint:check && npm test -- --testPathIgnorePatterns=parity-check && npm run build
```

Expected: vše PASS.

- [ ] **Step 10.2:** Roadmap

V `docs/roadmap2.md`:

1. Najdi `### 3.4 RPG System Presets (Krok 7d)` a označ jako `✅ **(hotovo 2026-05-06)**`. Změň všechny `- [ ]` na `- [x]`.
2. V tabulce "Pořadí prací" najdi řádek `| 8 | Fáze 3.4 — RPG System Presets | ... | 2–3 dny |` a přepiš na `| ✅ | Fáze 3.4 — RPG System Presets | hotovo (2026-05-06) | — |`.

- [ ] **Step 10.3:** Commit

```bash
git add docs/roadmap2.md
git commit -m "docs(roadmap): Fáze 3.4 RPG System Presets — splněno"
```

- [ ] **Step 10.4:** Verify state

```bash
git log --oneline | head -15
git status
```

Expected: ~10 commitů od plánu, čistý working tree.

---

## Mimo scope (per spec)

- **Validace `schema[]`** při manuálním PUT `/api/worlds/:id/settings` — PJ může editovat
- **Migrace `Character.diaryData`** při změně systému (klíče zůstávají)
- **Pojmenované verze** (jen číslo)
- **Diff mezi verzemi** (frontend záležitost)
- **Strict enum pro `SchemaBlock.type`** (frontend renderer rozhoduje)
