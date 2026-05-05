# Krok 7d — RPG System Presets — Implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systém presetů CharacterSheet šablon per RPG systém — auto-seed `WorldSettings.diarySchema` při vytvoření světa, archivace + re-seed při změně systému, endpointy pro historické verze schémat.

**Architecture:** Nový `SystemPresetsModule` (@Global) drží 16 statických TS presetů; žádná DB. `WorldsService` rozšíří `create()` o seed a `update()` o archivaci + re-seed přes nový `IDiarySchemaVersionsRepository` uvnitř `WorldsModule`. Controller vystaví GET endpointy pro historické verze.

**Tech Stack:** NestJS, Mongoose, TypeScript, Jest

---

## Mapa souborů

**Nové soubory:**
- `backend/src/modules/system-presets/interfaces/system-preset.interface.ts`
- `backend/src/modules/system-presets/presets/dnd5e.preset.ts`
- `backend/src/modules/system-presets/presets/dnd2e.preset.ts`
- `backend/src/modules/system-presets/presets/dnd3plus.preset.ts`
- `backend/src/modules/system-presets/presets/drd-hero.preset.ts`
- `backend/src/modules/system-presets/presets/drd16-warrior.preset.ts`
- `backend/src/modules/system-presets/presets/drd16-wizard.preset.ts`
- `backend/src/modules/system-presets/presets/drd16-thief.preset.ts`
- `backend/src/modules/system-presets/presets/drd16-ranger.preset.ts`
- `backend/src/modules/system-presets/presets/drd16-alchemy.preset.ts`
- `backend/src/modules/system-presets/presets/gurps.preset.ts`
- `backend/src/modules/system-presets/presets/call-of-cthulhu.preset.ts`
- `backend/src/modules/system-presets/presets/fate.preset.ts`
- `backend/src/modules/system-presets/presets/shadowrun.preset.ts`
- `backend/src/modules/system-presets/presets/jad.preset.ts`
- `backend/src/modules/system-presets/presets/pi.preset.ts`
- `backend/src/modules/system-presets/presets/matrix-custom.preset.ts`
- `backend/src/modules/system-presets/presets/index.ts`
- `backend/src/modules/system-presets/system-presets.service.ts`
- `backend/src/modules/system-presets/system-presets.service.spec.ts`
- `backend/src/modules/system-presets/system-presets.controller.ts`
- `backend/src/modules/system-presets/system-presets.module.ts`
- `backend/src/modules/worlds/diary-schema-versions/diary-schema-version.interface.ts`
- `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions-repository.interface.ts`
- `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.schema.ts`
- `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.repository.ts`

**Upravované soubory:**
- `backend/src/modules/worlds/worlds.service.ts` — inject SystemPresetsService + IDiarySchemaVersionsRepository, rozšíření create() a update()
- `backend/src/modules/worlds/worlds.service.spec.ts` — nové testy
- `backend/src/modules/worlds/worlds.controller.ts` — nové GET endpointy pro verze
- `backend/src/modules/worlds/worlds.module.ts` — registrace nové schémy + repository + import SystemPresetsModule
- `backend/src/app.module.ts` — import SystemPresetsModule

---

## Task 1: SystemPreset interface + všechny preset soubory

**Files:**
- Create: `backend/src/modules/system-presets/interfaces/system-preset.interface.ts`
- Create: `backend/src/modules/system-presets/presets/dnd5e.preset.ts`
- Create: `backend/src/modules/system-presets/presets/dnd2e.preset.ts`
- Create: `backend/src/modules/system-presets/presets/dnd3plus.preset.ts`
- Create: `backend/src/modules/system-presets/presets/drd-hero.preset.ts`
- Create: `backend/src/modules/system-presets/presets/drd16-warrior.preset.ts`
- Create: `backend/src/modules/system-presets/presets/drd16-wizard.preset.ts`
- Create: `backend/src/modules/system-presets/presets/drd16-thief.preset.ts`
- Create: `backend/src/modules/system-presets/presets/drd16-ranger.preset.ts`
- Create: `backend/src/modules/system-presets/presets/drd16-alchemy.preset.ts`
- Create: `backend/src/modules/system-presets/presets/gurps.preset.ts`
- Create: `backend/src/modules/system-presets/presets/call-of-cthulhu.preset.ts`
- Create: `backend/src/modules/system-presets/presets/fate.preset.ts`
- Create: `backend/src/modules/system-presets/presets/shadowrun.preset.ts`
- Create: `backend/src/modules/system-presets/presets/jad.preset.ts`
- Create: `backend/src/modules/system-presets/presets/pi.preset.ts`
- Create: `backend/src/modules/system-presets/presets/matrix-custom.preset.ts`
- Create: `backend/src/modules/system-presets/presets/index.ts`

- [ ] **Step 1.1: Vytvoř interface**

```typescript
// backend/src/modules/system-presets/interfaces/system-preset.interface.ts
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

export interface SystemPreset {
  system: string;
  displayName: string;
  schema: SchemaBlock[];
}
```

- [ ] **Step 1.2: Vytvoř preset D&D 5e**

```typescript
// backend/src/modules/system-presets/presets/dnd5e.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const dnd5ePreset: SystemPreset = {
  system: 'dnd5e',
  displayName: 'D&D 5e',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'background', label: 'Zázemí', type: 'text', order: 4 },
    { key: 'str', label: 'Síla', type: 'number', order: 5 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 6 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 7 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 8 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 9 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 10 },
    { key: 'hp', label: 'Životy', type: 'number', order: 11 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 12 },
    { key: 'ac', label: 'Obranné číslo', type: 'number', order: 13 },
    { key: 'speed', label: 'Rychlost', type: 'number', order: 14 },
    { key: 'proficiencyBonus', label: 'Zdatnostní bonus', type: 'number', order: 15 },
    { key: 'savingThrows', label: 'Záchranné hody', type: 'tagvalue', order: 16 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 17 },
    { key: 'features', label: 'Schopnosti a rysy', type: 'textarea', order: 18 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 19 },
    { key: 'spells', label: 'Kouzla', type: 'textarea', order: 20 },
  ],
};
```

- [ ] **Step 1.3: Vytvoř preset D&D 2e**

```typescript
// backend/src/modules/system-presets/presets/dnd2e.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const dnd2ePreset: SystemPreset = {
  system: 'dnd2e',
  displayName: 'D&D 2e',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'str', label: 'Síla', type: 'number', order: 4 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 5 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 6 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 7 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 8 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 9 },
    { key: 'hp', label: 'Životy', type: 'number', order: 10 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 11 },
    { key: 'ac', label: 'Obranné číslo', type: 'number', order: 12 },
    { key: 'thac0', label: 'THAC0', type: 'number', order: 13 },
    { key: 'savingThrows', label: 'Záchranné hody', type: 'tagvalue', order: 14 },
    { key: 'proficiencies', label: 'Zdatnosti', type: 'tagvalue', order: 15 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 16 },
    { key: 'spells', label: 'Kouzla', type: 'textarea', order: 17 },
  ],
};
```

- [ ] **Step 1.4: Vytvoř preset D&D 3+**

```typescript
// backend/src/modules/system-presets/presets/dnd3plus.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const dnd3plusPreset: SystemPreset = {
  system: 'dnd3plus',
  displayName: 'D&D 3+',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'str', label: 'Síla', type: 'number', order: 4 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 5 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 6 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 7 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 8 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 9 },
    { key: 'hp', label: 'Životy', type: 'number', order: 10 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 11 },
    { key: 'ac', label: 'Obranné číslo', type: 'number', order: 12 },
    { key: 'bab', label: 'Základní útočný bonus', type: 'number', order: 13 },
    { key: 'fortSave', label: 'Odolnost (záchrana)', type: 'number', order: 14 },
    { key: 'refSave', label: 'Reflexy (záchrana)', type: 'number', order: 15 },
    { key: 'willSave', label: 'Vůle (záchrana)', type: 'number', order: 16 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 17 },
    { key: 'feats', label: 'Talenty', type: 'tagvalue', order: 18 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 19 },
    { key: 'spells', label: 'Kouzla', type: 'textarea', order: 20 },
  ],
};
```

- [ ] **Step 1.5: Vytvoř preset DrD Hero**

```typescript
// backend/src/modules/system-presets/presets/drd-hero.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drdHeroPreset: SystemPreset = {
  system: 'drd-hero',
  displayName: 'DrD Hero',
  schema: [
    { key: 'abilityPoints', label: 'Body schopností', type: 'number', order: 1 },
    { key: 'fatePoints', label: 'Body osudu', type: 'number', order: 2 },
    { key: 'health', label: 'Životy', type: 'number', order: 3 },
    { key: 'magicHealth', label: 'Magické životy', type: 'number', order: 4 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 5 },
    { key: 'tiredness', label: 'Únava', type: 'number', order: 6 },
    { key: 'overPressurePhysical', label: 'Přetlak fyzický', type: 'number', order: 7 },
    { key: 'overPressureMagical', label: 'Přetlak magický', type: 'number', order: 8 },
    { key: 'overPressureDiplomatic', label: 'Přetlak diplomatický', type: 'number', order: 9 },
    { key: 'overPressureTechnical', label: 'Přetlak technický', type: 'number', order: 10 },
    { key: 'languages', label: 'Jazyky', type: 'tagvalue', order: 11 },
    { key: 'aspects', label: 'Aspekty', type: 'tagvalue', order: 12 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 13 },
    { key: 'inventory', label: 'Inventář', type: 'textarea', order: 14 },
  ],
};
```

- [ ] **Step 1.6: Vytvoř 5 presetů DrD 16**

```typescript
// backend/src/modules/system-presets/presets/drd16-warrior.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16WarriorPreset: SystemPreset = {
  system: 'drd16-warrior',
  displayName: 'DrD 16 — Bojovník',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'str', label: 'Síla', type: 'number', order: 2 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 3 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 4 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 5 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 6 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 7 },
    { key: 'hp', label: 'Životy', type: 'number', order: 8 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 9 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 10 },
    { key: 'initiative', label: 'Iniciativa', type: 'number', order: 11 },
    { key: 'weaponSkills', label: 'Zbraňové dovednosti', type: 'tagvalue', order: 12 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 13 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 14 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/drd16-wizard.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16WizardPreset: SystemPreset = {
  system: 'drd16-wizard',
  displayName: 'DrD 16 — Čaroděj',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'str', label: 'Síla', type: 'number', order: 2 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 3 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 4 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 5 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 6 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 7 },
    { key: 'hp', label: 'Životy', type: 'number', order: 8 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 9 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 10 },
    { key: 'mana', label: 'Mana', type: 'number', order: 11 },
    { key: 'maxMana', label: 'Max mana', type: 'number', order: 12 },
    { key: 'spells', label: 'Kouzla', type: 'tagvalue', order: 13 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 14 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 15 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/drd16-thief.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16ThiefPreset: SystemPreset = {
  system: 'drd16-thief',
  displayName: 'DrD 16 — Zloděj',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'str', label: 'Síla', type: 'number', order: 2 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 3 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 4 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 5 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 6 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 7 },
    { key: 'hp', label: 'Životy', type: 'number', order: 8 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 9 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 10 },
    { key: 'initiative', label: 'Iniciativa', type: 'number', order: 11 },
    { key: 'thiefSkills', label: 'Zlodějské dovednosti', type: 'tagvalue', order: 12 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 13 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 14 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/drd16-ranger.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16RangerPreset: SystemPreset = {
  system: 'drd16-ranger',
  displayName: 'DrD 16 — Hraničář',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'str', label: 'Síla', type: 'number', order: 2 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 3 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 4 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 5 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 6 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 7 },
    { key: 'hp', label: 'Životy', type: 'number', order: 8 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 9 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 10 },
    { key: 'initiative', label: 'Iniciativa', type: 'number', order: 11 },
    { key: 'survivalSkills', label: 'Přežití v divočině', type: 'tagvalue', order: 12 },
    { key: 'trackedPrey', label: 'Sledovaná kořist', type: 'text', order: 13 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 14 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 15 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/drd16-alchemy.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const drd16AlchemyPreset: SystemPreset = {
  system: 'drd16-alchemy',
  displayName: 'DrD 16 — Alchymista',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'str', label: 'Síla', type: 'number', order: 2 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 3 },
    { key: 'con', label: 'Odolnost', type: 'number', order: 4 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 5 },
    { key: 'wis', label: 'Moudrost', type: 'number', order: 6 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 7 },
    { key: 'hp', label: 'Životy', type: 'number', order: 8 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 9 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 10 },
    { key: 'alchemyLevel', label: 'Úroveň alchymie', type: 'number', order: 11 },
    { key: 'recipes', label: 'Recepty', type: 'tagvalue', order: 12 },
    { key: 'components', label: 'Suroviny', type: 'tagvalue', order: 13 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 14 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 15 },
  ],
};
```

- [ ] **Step 1.7: Vytvoř presety GURPS, Call of Cthulhu, Fate, Shadowrun**

```typescript
// backend/src/modules/system-presets/presets/gurps.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const gurpsPreset: SystemPreset = {
  system: 'gurps',
  displayName: 'GURPS',
  schema: [
    { key: 'points', label: 'Body postavy', type: 'number', order: 1 },
    { key: 'st', label: 'ST (Síla)', type: 'number', order: 2 },
    { key: 'dx', label: 'DX (Obratnost)', type: 'number', order: 3 },
    { key: 'iq', label: 'IQ (Inteligence)', type: 'number', order: 4 },
    { key: 'ht', label: 'HT (Zdraví)', type: 'number', order: 5 },
    { key: 'hp', label: 'Životy', type: 'number', order: 6 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 7 },
    { key: 'will', label: 'Vůle', type: 'number', order: 8 },
    { key: 'perception', label: 'Vnímání', type: 'number', order: 9 },
    { key: 'basicSpeed', label: 'Základní rychlost', type: 'number', order: 10 },
    { key: 'advantages', label: 'Výhody', type: 'tagvalue', order: 11 },
    { key: 'disadvantages', label: 'Nevýhody', type: 'tagvalue', order: 12 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 13 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 14 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/call-of-cthulhu.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const callOfCthulhuPreset: SystemPreset = {
  system: 'call-of-cthulhu',
  displayName: 'Call of Cthulhu',
  schema: [
    { key: 'occupation', label: 'Povolání', type: 'text', order: 1 },
    { key: 'age', label: 'Věk', type: 'number', order: 2 },
    { key: 'str', label: 'STR (Síla)', type: 'number', order: 3 },
    { key: 'con', label: 'CON (Odolnost)', type: 'number', order: 4 },
    { key: 'dex', label: 'DEX (Obratnost)', type: 'number', order: 5 },
    { key: 'int', label: 'INT (Inteligence)', type: 'number', order: 6 },
    { key: 'pow', label: 'POW (Síla vůle)', type: 'number', order: 7 },
    { key: 'edu', label: 'EDU (Vzdělání)', type: 'number', order: 8 },
    { key: 'hp', label: 'Životy', type: 'number', order: 9 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 10 },
    { key: 'sanity', label: 'Příčetnost', type: 'number', order: 11 },
    { key: 'luck', label: 'Štěstí', type: 'number', order: 12 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 13 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 14 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/fate.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const fatePreset: SystemPreset = {
  system: 'fate',
  displayName: 'Fate',
  schema: [
    { key: 'concept', label: 'Koncept postavy', type: 'text', order: 1 },
    { key: 'trouble', label: 'Problém', type: 'text', order: 2 },
    { key: 'aspects', label: 'Aspekty', type: 'tagvalue', order: 3 },
    { key: 'stunts', label: 'Triky', type: 'tagvalue', order: 4 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 5 },
    { key: 'fatePoints', label: 'Body osudu', type: 'number', order: 6 },
    { key: 'refresh', label: 'Obnova', type: 'number', order: 7 },
    { key: 'stress', label: 'Stres', type: 'text', order: 8 },
    { key: 'consequences', label: 'Následky', type: 'tagvalue', order: 9 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/shadowrun.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const shadowrunPreset: SystemPreset = {
  system: 'shadowrun',
  displayName: 'Shadowrun',
  schema: [
    { key: 'metatype', label: 'Metatyp', type: 'text', order: 1 },
    { key: 'archetype', label: 'Archetype', type: 'text', order: 2 },
    { key: 'bod', label: 'BOD (Tělo)', type: 'number', order: 3 },
    { key: 'agi', label: 'AGI (Hbitost)', type: 'number', order: 4 },
    { key: 'rea', label: 'REA (Reakce)', type: 'number', order: 5 },
    { key: 'str', label: 'STR (Síla)', type: 'number', order: 6 },
    { key: 'wil', label: 'WIL (Vůle)', type: 'number', order: 7 },
    { key: 'log', label: 'LOG (Logika)', type: 'number', order: 8 },
    { key: 'int', label: 'INT (Intuice)', type: 'number', order: 9 },
    { key: 'cha', label: 'CHA (Charisma)', type: 'number', order: 10 },
    { key: 'ess', label: 'ESS (Esence)', type: 'number', order: 11 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 12 },
    { key: 'nuyen', label: 'Nuyen', type: 'number', order: 13 },
    { key: 'karma', label: 'Karma', type: 'number', order: 14 },
    { key: 'augmentations', label: 'Rozšíření', type: 'textarea', order: 15 },
  ],
};
```

- [ ] **Step 1.8: Vytvoř presety Jad, Pi, Matrix custom**

```typescript
// backend/src/modules/system-presets/presets/jad.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const jadPreset: SystemPreset = {
  system: 'jad',
  displayName: 'Jad',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'hp', label: 'Životy', type: 'number', order: 4 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 5 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 6 },
    { key: 'initiative', label: 'Iniciativa', type: 'number', order: 7 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 8 },
    { key: 'skills', label: 'Dovednosti', type: 'tagvalue', order: 9 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 10 },
    { key: 'notes', label: 'Poznámky', type: 'textarea', order: 11 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/pi.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const piPreset: SystemPreset = {
  system: 'pi',
  displayName: 'Pi',
  schema: [
    { key: 'level', label: 'Úroveň', type: 'number', order: 1 },
    { key: 'class', label: 'Povolání', type: 'text', order: 2 },
    { key: 'race', label: 'Rasa', type: 'text', order: 3 },
    { key: 'str', label: 'Síla', type: 'number', order: 4 },
    { key: 'dex', label: 'Obratnost', type: 'number', order: 5 },
    { key: 'int', label: 'Inteligence', type: 'number', order: 6 },
    { key: 'cha', label: 'Charisma', type: 'number', order: 7 },
    { key: 'hp', label: 'Životy', type: 'number', order: 8 },
    { key: 'maxHp', label: 'Max životy', type: 'number', order: 9 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 10 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 11 },
    { key: 'equipment', label: 'Vybavení', type: 'textarea', order: 12 },
    { key: 'notes', label: 'Poznámky', type: 'textarea', order: 13 },
  ],
};
```

```typescript
// backend/src/modules/system-presets/presets/matrix-custom.preset.ts
import type { SystemPreset } from '../interfaces/system-preset.interface';

export const matrixCustomPreset: SystemPreset = {
  system: 'matrix-custom',
  displayName: 'Matrix custom',
  schema: [
    { key: 'abilityPoints', label: 'Body schopností', type: 'number', order: 1 },
    { key: 'fatePoints', label: 'Body osudu', type: 'number', order: 2 },
    { key: 'health', label: 'Životy', type: 'number', order: 3 },
    { key: 'magicHealth', label: 'Magické životy', type: 'number', order: 4 },
    { key: 'armor', label: 'Brnění', type: 'number', order: 5 },
    { key: 'tiredness', label: 'Únava', type: 'number', order: 6 },
    { key: 'overPressurePhysical', label: 'Přetlak fyzický', type: 'number', order: 7 },
    { key: 'overPressureMagical', label: 'Přetlak magický', type: 'number', order: 8 },
    { key: 'overPressureDiplomatic', label: 'Přetlak diplomatický', type: 'number', order: 9 },
    { key: 'overPressureTechnical', label: 'Přetlak technický', type: 'number', order: 10 },
    { key: 'magicGene', label: 'Magický gen', type: 'text', order: 11 },
    { key: 'bornWhere', label: 'Místo narození', type: 'text', order: 12 },
    { key: 'languages', label: 'Jazyky', type: 'tagvalue', order: 13 },
    { key: 'aspects', label: 'Aspekty', type: 'tagvalue', order: 14 },
    { key: 'abilities', label: 'Schopnosti', type: 'tagvalue', order: 15 },
    { key: 'inventory', label: 'Inventář', type: 'textarea', order: 16 },
  ],
};
```

- [ ] **Step 1.9: Vytvoř registry index.ts**

```typescript
// backend/src/modules/system-presets/presets/index.ts
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

- [ ] **Step 1.10: Commit**

```bash
cd backend
git add src/modules/system-presets/
git commit -m "feat(7d): přidat SystemPreset interface a všechny preset soubory (16 systémů)"
```

---

## Task 2: SystemPresetsService (TDD) + Controller + Module

**Files:**
- Create: `backend/src/modules/system-presets/system-presets.service.spec.ts`
- Create: `backend/src/modules/system-presets/system-presets.service.ts`
- Create: `backend/src/modules/system-presets/system-presets.controller.ts`
- Create: `backend/src/modules/system-presets/system-presets.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 2.1: Napiš failing testy**

```typescript
// backend/src/modules/system-presets/system-presets.service.spec.ts
import { SystemPresetsService } from './system-presets.service';

describe('SystemPresetsService', () => {
  let service: SystemPresetsService;

  beforeEach(() => {
    service = new SystemPresetsService();
  });

  describe('findAll', () => {
    it('vrátí seznam všech systémů s system a displayName', () => {
      const result = service.findAll();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('system');
      expect(result[0]).toHaveProperty('displayName');
      expect(result[0]).not.toHaveProperty('schema');
    });

    it('vrátí 16 systémů', () => {
      const result = service.findAll();
      expect(result).toHaveLength(16);
    });

    it('obsahuje dnd5e', () => {
      const result = service.findAll();
      expect(result.some((p) => p.system === 'dnd5e')).toBe(true);
    });
  });

  describe('findOne', () => {
    it('vrátí kompletní preset se schema[] pro existující systém', () => {
      const result = service.findOne('dnd5e');
      expect(result).not.toBeNull();
      expect(result!.system).toBe('dnd5e');
      expect(result!.displayName).toBe('D&D 5e');
      expect(result!.schema.length).toBeGreaterThan(0);
      expect(result!.schema[0]).toHaveProperty('key');
      expect(result!.schema[0]).toHaveProperty('label');
      expect(result!.schema[0]).toHaveProperty('type');
      expect(result!.schema[0]).toHaveProperty('order');
    });

    it('vrátí null pro neexistující systém', () => {
      const result = service.findOne('neexistujici-system');
      expect(result).toBeNull();
    });

    it('vrátí DrD Hero preset', () => {
      const result = service.findOne('drd-hero');
      expect(result).not.toBeNull();
      expect(result!.displayName).toBe('DrD Hero');
    });
  });
});
```

- [ ] **Step 2.2: Spusť testy — ověř že failují**

```bash
cd backend
npx jest --testPathPattern=system-presets.service.spec --no-coverage
```

Očekávaný výstup: `Cannot find module './system-presets.service'`

- [ ] **Step 2.3: Implementuj service**

```typescript
// backend/src/modules/system-presets/system-presets.service.ts
import { Injectable } from '@nestjs/common';
import type { SystemPreset } from './interfaces/system-preset.interface';
import { SYSTEM_PRESETS } from './presets/index';

@Injectable()
export class SystemPresetsService {
  private readonly presets: SystemPreset[] = SYSTEM_PRESETS;

  findAll(): Pick<SystemPreset, 'system' | 'displayName'>[] {
    return this.presets.map(({ system, displayName }) => ({ system, displayName }));
  }

  findOne(system: string): SystemPreset | null {
    return this.presets.find((p) => p.system === system) ?? null;
  }
}
```

- [ ] **Step 2.4: Spusť testy — ověř že prochází**

```bash
cd backend
npx jest --testPathPattern=system-presets.service.spec --no-coverage
```

Očekávaný výstup: `3 passed` (nebo víc — všechny testy z describe bloků)

- [ ] **Step 2.5: Vytvoř controller**

```typescript
// backend/src/modules/system-presets/system-presets.controller.ts
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { SystemPresetsService } from './system-presets.service';

@Controller('system-presets')
export class SystemPresetsController {
  constructor(private readonly service: SystemPresetsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':system')
  findOne(@Param('system') system: string) {
    const preset = this.service.findOne(system);
    if (!preset) throw new NotFoundException(`Preset pro systém '${system}' nenalezen`);
    return preset;
  }
}
```

- [ ] **Step 2.6: Vytvoř modul (@Global)**

```typescript
// backend/src/modules/system-presets/system-presets.module.ts
import { Global, Module } from '@nestjs/common';
import { SystemPresetsService } from './system-presets.service';
import { SystemPresetsController } from './system-presets.controller';

@Global()
@Module({
  controllers: [SystemPresetsController],
  providers: [SystemPresetsService],
  exports: [SystemPresetsService],
})
export class SystemPresetsModule {}
```

- [ ] **Step 2.7: Registruj modul v AppModule**

Do `backend/src/app.module.ts` přidej import `SystemPresetsModule` před `WorldsModule`:

```typescript
import { SystemPresetsModule } from './modules/system-presets/system-presets.module';

// V imports[] přidej:
SystemPresetsModule,
```

- [ ] **Step 2.8: Ověř kompilaci**

```bash
cd backend
npx nest build 2>&1 | head -20
```

Očekávaný výstup: žádné chyby.

- [ ] **Step 2.9: Commit**

```bash
git add src/modules/system-presets/system-presets.service.ts \
        src/modules/system-presets/system-presets.service.spec.ts \
        src/modules/system-presets/system-presets.controller.ts \
        src/modules/system-presets/system-presets.module.ts \
        src/app.module.ts
git commit -m "feat(7d): přidat SystemPresetsService, Controller, Module a registraci v AppModule"
```

---

## Task 3: DiarySchemaVersion — interface, schema, repository interface + implementace

**Files:**
- Create: `backend/src/modules/worlds/diary-schema-versions/diary-schema-version.interface.ts`
- Create: `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions-repository.interface.ts`
- Create: `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.schema.ts`
- Create: `backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.repository.ts`

- [ ] **Step 3.1: Vytvoř interface entity**

```typescript
// backend/src/modules/worlds/diary-schema-versions/diary-schema-version.interface.ts
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
  id: string;
  worldId: string;
  version: number;
  system: string;
  archivedAt: Date;
}
```

- [ ] **Step 3.2: Vytvoř repository interface**

```typescript
// backend/src/modules/worlds/diary-schema-versions/diary-schema-versions-repository.interface.ts
import type { DiarySchemaVersion, DiarySchemaVersionMeta } from './diary-schema-version.interface';

export interface IDiarySchemaVersionsRepository {
  findMetaByWorld(worldId: string): Promise<DiarySchemaVersionMeta[]>;
  findByWorldAndVersion(worldId: string, version: number): Promise<DiarySchemaVersion | null>;
  getMaxVersion(worldId: string): Promise<number>;
  create(data: Omit<DiarySchemaVersion, 'id'>): Promise<DiarySchemaVersion>;
}
```

- [ ] **Step 3.3: Vytvoř Mongoose schema**

```typescript
// backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DiarySchemaVersionDocument = HydratedDocument<DiarySchemaVersionSchemaClass>;

@Schema({ collection: 'diarySchemaVersions' })
export class DiarySchemaVersionSchemaClass {
  @Prop({ required: true }) worldId: string;
  @Prop({ required: true }) version: number;
  @Prop({ required: true }) system: string;
  @Prop({ type: [Object], default: [] }) schema: Record<string, unknown>[];
  @Prop({ default: Date.now }) archivedAt: Date;
}

export const DiarySchemaVersionSchema = SchemaFactory.createForClass(DiarySchemaVersionSchemaClass);
DiarySchemaVersionSchema.index({ worldId: 1, version: 1 }, { unique: true });
```

- [ ] **Step 3.4: Implementuj MongoDB repository**

```typescript
// backend/src/modules/worlds/diary-schema-versions/diary-schema-versions.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiarySchemaVersionSchemaClass } from './diary-schema-versions.schema';
import type { DiarySchemaVersion, DiarySchemaVersionMeta } from './diary-schema-version.interface';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions-repository.interface';
import type { SchemaBlock } from '../../characters/interfaces/character.interface';

@Injectable()
export class MongoDiarySchemaVersionsRepository implements IDiarySchemaVersionsRepository {
  constructor(
    @InjectModel(DiarySchemaVersionSchemaClass.name)
    private readonly model: Model<DiarySchemaVersionSchemaClass>,
  ) {}

  async findMetaByWorld(worldId: string): Promise<DiarySchemaVersionMeta[]> {
    const docs = await this.model
      .find({ worldId }, { schema: 0 })
      .sort({ version: 1 })
      .lean()
      .exec();
    return docs.map((doc) => this.toMeta(doc as unknown as Record<string, unknown>));
  }

  async findByWorldAndVersion(worldId: string, version: number): Promise<DiarySchemaVersion | null> {
    const doc = await this.model.findOne({ worldId, version }).lean().exec();
    return doc ? this.toEntity(doc as unknown as Record<string, unknown>) : null;
  }

  async getMaxVersion(worldId: string): Promise<number> {
    const doc = await this.model
      .findOne({ worldId })
      .sort({ version: -1 })
      .select('version')
      .lean()
      .exec();
    return doc ? (doc as unknown as Record<string, unknown>).version as number : 0;
  }

  async create(data: Omit<DiarySchemaVersion, 'id'>): Promise<DiarySchemaVersion> {
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

  private toMeta(doc: Record<string, unknown>): DiarySchemaVersionMeta {
    return {
      id: String(doc._id),
      worldId: doc.worldId as string,
      version: doc.version as number,
      system: doc.system as string,
      archivedAt: doc.archivedAt as Date,
    };
  }
}
```

- [ ] **Step 3.5: Commit**

```bash
git add src/modules/worlds/diary-schema-versions/
git commit -m "feat(7d): přidat DiarySchemaVersion interface, schema a MongoDiarySchemaVersionsRepository"
```

---

## Task 4: WorldsService — TDD rozšíření pro create() a update()

**Files:**
- Modify: `backend/src/modules/worlds/worlds.service.spec.ts`
- Modify: `backend/src/modules/worlds/worlds.service.ts`

- [ ] **Step 4.1: Přidej failing testy na konec worlds.service.spec.ts**

Otevři `backend/src/modules/worlds/worlds.service.spec.ts`. Na konec souboru (před poslední `}`) přidej:

```typescript
  describe('create — diarySchema seed', () => {
    const mockDiaryVersionsRepo = {
      findMetaByWorld: jest.fn(),
      findByWorldAndVersion: jest.fn(),
      getMaxVersion: jest.fn(),
      create: jest.fn(),
    };

    const mockPresetsService = {
      findOne: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const module = await Test.createTestingModule({
        providers: [
          WorldsService,
          { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
          { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
          { provide: 'IWorldSettingsRepository', useValue: mockSettingsRepo },
          { provide: 'IDiarySchemaVersionsRepository', useValue: mockDiaryVersionsRepo },
          { provide: SystemPresetsService, useValue: mockPresetsService },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();
      service = module.get(WorldsService);
    });

    it('seeduje diarySchema z presetu pokud systém existuje', async () => {
      const fakeSchema = [{ key: 'hp', label: 'Životy', type: 'number', order: 1 }];
      mockPresetsService.findOne.mockReturnValue({ system: 'dnd5e', displayName: 'D&D 5e', schema: fakeSchema });
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'w1', system: 'dnd5e', slug: 'test', ownerId: 'u1' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockSettingsRepo.upsert.mockResolvedValue({});

      await service.create({ name: 'Test', slug: 'test', system: 'dnd5e' } as any, 'u1');

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ diarySchema: fakeSchema }),
      );
    });

    it('seeduje prázdné diarySchema pokud preset neexistuje', async () => {
      mockPresetsService.findOne.mockReturnValue(null);
      mockWorldsRepo.existsBySlug.mockResolvedValue(false);
      mockWorldsRepo.save.mockResolvedValue({ id: 'w1', system: 'neznamy', slug: 'test', ownerId: 'u1' });
      mockMembershipRepo.save.mockResolvedValue({});
      mockSettingsRepo.upsert.mockResolvedValue({});

      await service.create({ name: 'Test', slug: 'test', system: 'neznamy' } as any, 'u1');

      expect(mockSettingsRepo.upsert).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ diarySchema: [] }),
      );
    });
  });

  describe('update — archivace diarySchema při změně systému', () => {
    const mockDiaryVersionsRepo = {
      findMetaByWorld: jest.fn(),
      findByWorldAndVersion: jest.fn(),
      getMaxVersion: jest.fn(),
      create: jest.fn(),
    };

    const mockPresetsService = {
      findOne: jest.fn(),
    };

    const mockSettingsRepoForUpdate = {
      findByWorldId: jest.fn(),
      upsert: jest.fn(),
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      const module = await Test.createTestingModule({
        providers: [
          WorldsService,
          { provide: 'IWorldsRepository', useValue: mockWorldsRepo },
          { provide: 'IWorldMembershipRepository', useValue: mockMembershipRepo },
          { provide: 'IWorldSettingsRepository', useValue: mockSettingsRepoForUpdate },
          { provide: 'IDiarySchemaVersionsRepository', useValue: mockDiaryVersionsRepo },
          { provide: SystemPresetsService, useValue: mockPresetsService },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        ],
      }).compile();
      service = module.get(WorldsService);
    });

    it('archivuje staré schéma a seeduje nové při změně systému', async () => {
      const oldSchema = [{ key: 'hp', label: 'Životy', type: 'number', order: 1 }];
      const newSchema = [{ key: 'level', label: 'Úroveň', type: 'number', order: 1 }];
      mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', system: 'dnd5e', ownerId: 'u1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockWorldsRepo.update.mockResolvedValue({ id: 'w1', system: 'drd-hero' });
      mockSettingsRepoForUpdate.findByWorldId.mockResolvedValue({ diarySchema: oldSchema });
      mockDiaryVersionsRepo.getMaxVersion.mockResolvedValue(0);
      mockDiaryVersionsRepo.create.mockResolvedValue({});
      mockPresetsService.findOne.mockReturnValue({ system: 'drd-hero', displayName: 'DrD Hero', schema: newSchema });
      mockSettingsRepoForUpdate.upsert.mockResolvedValue({});

      await service.update('w1', { system: 'drd-hero' } as any, { id: 'u1', role: UserRole.User, username: 'pj' });

      expect(mockDiaryVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'w1', version: 1, system: 'dnd5e', schema: oldSchema }),
      );
      expect(mockSettingsRepoForUpdate.upsert).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ diarySchema: newSchema }),
      );
    });

    it('nearchivuje pokud stávající schéma je prázdné', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', system: 'dnd5e', ownerId: 'u1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockWorldsRepo.update.mockResolvedValue({ id: 'w1', system: 'gurps' });
      mockSettingsRepoForUpdate.findByWorldId.mockResolvedValue({ diarySchema: [] });
      mockPresetsService.findOne.mockReturnValue({ system: 'gurps', displayName: 'GURPS', schema: [] });
      mockSettingsRepoForUpdate.upsert.mockResolvedValue({});

      await service.update('w1', { system: 'gurps' } as any, { id: 'u1', role: UserRole.User, username: 'pj' });

      expect(mockDiaryVersionsRepo.create).not.toHaveBeenCalled();
    });

    it('archivuje a nastaví prázdné schéma pokud nový preset neexistuje', async () => {
      const oldSchema = [{ key: 'hp', label: 'Životy', type: 'number', order: 1 }];
      mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', system: 'dnd5e', ownerId: 'u1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockWorldsRepo.update.mockResolvedValue({ id: 'w1', system: 'vlastni-system' });
      mockSettingsRepoForUpdate.findByWorldId.mockResolvedValue({ diarySchema: oldSchema });
      mockDiaryVersionsRepo.getMaxVersion.mockResolvedValue(2);
      mockDiaryVersionsRepo.create.mockResolvedValue({});
      mockPresetsService.findOne.mockReturnValue(null);
      mockSettingsRepoForUpdate.upsert.mockResolvedValue({});

      await service.update('w1', { system: 'vlastni-system' } as any, { id: 'u1', role: UserRole.User, username: 'pj' });

      expect(mockDiaryVersionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ worldId: 'w1', version: 3 }),
      );
      expect(mockSettingsRepoForUpdate.upsert).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({ diarySchema: [] }),
      );
    });

    it('neprovede archivaci ani seed pokud se system nemění', async () => {
      mockWorldsRepo.findById.mockResolvedValue({ id: 'w1', system: 'dnd5e', ownerId: 'u1' });
      mockMembershipRepo.findByUserAndWorld.mockResolvedValue({ role: WorldRole.PJ });
      mockWorldsRepo.update.mockResolvedValue({ id: 'w1', system: 'dnd5e' });

      await service.update('w1', { name: 'Nový název' } as any, { id: 'u1', role: UserRole.User, username: 'pj' });

      expect(mockDiaryVersionsRepo.create).not.toHaveBeenCalled();
      expect(mockSettingsRepoForUpdate.upsert).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 4.2: Aktualizuj importy a outer beforeEach v spec souboru**

Na začátek `worlds.service.spec.ts` přidej:
```typescript
import { SystemPresetsService } from '../system-presets/system-presets.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
```

**DŮLEŽITÉ:** Outer `beforeEach` (ten co existoval před tímto krokem) musí dostat mock pro nové deps, jinak všechny existující testy přestanou fungovat. Uprav providers array v outer `beforeEach` — přidej na konec:
```typescript
{ provide: 'IDiarySchemaVersionsRepository', useValue: { findMetaByWorld: jest.fn(), findByWorldAndVersion: jest.fn(), getMaxVersion: jest.fn(), create: jest.fn() } },
{ provide: SystemPresetsService, useValue: { findOne: jest.fn() } },
```

- [ ] **Step 4.3: Spusť nové testy — ověř že failují**

```bash
cd backend
npx jest --testPathPattern=worlds.service.spec --no-coverage 2>&1 | tail -20
```

Očekávaný výstup: testy ze Step 4.1 failují (`Cannot inject IDiarySchemaVersionsRepository` nebo `SystemPresetsService` není injektovatelná).

- [ ] **Step 4.4: Přidej injekce a importy do WorldsService**

Do `backend/src/modules/worlds/worlds.service.ts` přidej importy na začátek:

```typescript
import { SystemPresetsService } from '../system-presets/system-presets.service';
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions-repository.interface';
```

Konstruktor nahraď za:

```typescript
constructor(
  @Inject('IWorldsRepository') private readonly worldsRepo: IWorldsRepository,
  @Inject('IWorldMembershipRepository') private readonly membershipRepo: IWorldMembershipRepository,
  @Inject('IWorldSettingsRepository') private readonly settingsRepo: IWorldSettingsRepository,
  @Inject('IDiarySchemaVersionsRepository') private readonly diaryVersionsRepo: IDiarySchemaVersionsRepository,
  private readonly systemPresetsService: SystemPresetsService,
  private readonly eventEmitter: EventEmitter2,
) {}
```

- [ ] **Step 4.5: Uprav metodu create() — seed diarySchema**

V metodě `create()` nahraď volání `settingsRepo.upsert`:

```typescript
// Nahradit:
const currencies = this.getCurrenciesForGenre(dto.genre);
await this.settingsRepo.upsert(world.id, { currencies });

// Za:
const currencies = this.getCurrenciesForGenre(dto.genre);
const preset = this.systemPresetsService.findOne(dto.system ?? '');
const diarySchema = preset?.schema ?? [];
await this.settingsRepo.upsert(world.id, { currencies, diarySchema });
```

- [ ] **Step 4.6: Uprav metodu update() — archivace + re-seed**

V metodě `update()`, za `const updated = await this.worldsRepo.update(id, dto);` přidej:

```typescript
if (dto.system !== undefined && dto.system !== world.system) {
  const settings = await this.settingsRepo.findByWorldId(id);
  if (settings && settings.diarySchema.length > 0) {
    const maxVersion = await this.diaryVersionsRepo.getMaxVersion(id);
    await this.diaryVersionsRepo.create({
      worldId: id,
      version: maxVersion + 1,
      system: world.system,
      schema: settings.diarySchema,
      archivedAt: new Date(),
    });
  }
  const newPreset = this.systemPresetsService.findOne(dto.system);
  await this.settingsRepo.upsert(id, { diarySchema: newPreset?.schema ?? [] });
}
```

- [ ] **Step 4.7: Spusť testy — ověř že prochází**

```bash
cd backend
npx jest --testPathPattern=worlds.service.spec --no-coverage 2>&1 | tail -20
```

Očekávaný výstup: všechny testy prochází.

- [ ] **Step 4.8: Commit**

```bash
git add src/modules/worlds/worlds.service.ts src/modules/worlds/worlds.service.spec.ts
git commit -m "feat(7d): rozšířit WorldsService o seed diarySchema při create a archivaci při změně systému"
```

---

## Task 5: DiarySchemaVersions endpointy + WorldsModule + AppModule registrace

**Files:**
- Modify: `backend/src/modules/worlds/worlds.controller.ts`
- Modify: `backend/src/modules/worlds/worlds.module.ts`

- [ ] **Step 5.1: Přidej GET endpointy do WorldsController**

Do `backend/src/modules/worlds/worlds.controller.ts` přidej import:

```typescript
import type { IDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions-repository.interface';
```

Do konstruktoru přidej:

```typescript
@Inject('IDiarySchemaVersionsRepository')
private readonly diaryVersionsRepo: IDiarySchemaVersionsRepository,
```

Na konec třídy (před poslední `}`) přidej:

```typescript
@Get(':worldId/diary-schema-versions')
@UseGuards(JwtAuthGuard)
getDiarySchemaVersions(@Param('worldId') worldId: string) {
  return this.diaryVersionsRepo.findMetaByWorld(worldId);
}

@Get(':worldId/diary-schema-versions/:version')
@UseGuards(JwtAuthGuard)
getDiarySchemaVersion(
  @Param('worldId') worldId: string,
  @Param('version') version: string,
) {
  return this.diaryVersionsRepo.findByWorldAndVersion(worldId, Number(version));
}
```

- [ ] **Step 5.2: Registruj novou schéma a repository v WorldsModule**

```typescript
// backend/src/modules/worlds/worlds.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorldSchemaClass, WorldSchema } from './schemas/world.schema';
import { WorldMembershipSchemaClass, WorldMembershipSchema } from './schemas/world-membership.schema';
import { WorldSettingsSchemaClass, WorldSettingsSchema } from './schemas/world-settings.schema';
import { DiarySchemaVersionSchemaClass, DiarySchemaVersionSchema } from './diary-schema-versions/diary-schema-versions.schema';
import { MongoWorldsRepository } from './repositories/worlds.repository';
import { MongoWorldMembershipRepository } from './repositories/world-membership.repository';
import { MongoWorldSettingsRepository } from './repositories/world-settings.repository';
import { MongoDiarySchemaVersionsRepository } from './diary-schema-versions/diary-schema-versions.repository';
import { WorldsService } from './worlds.service';
import { WorldsController } from './worlds.controller';
import { WorldsGateway } from './worlds.gateway';
import { PagesModule } from '../pages/pages.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorldSchemaClass.name, schema: WorldSchema },
      { name: WorldMembershipSchemaClass.name, schema: WorldMembershipSchema },
      { name: WorldSettingsSchemaClass.name, schema: WorldSettingsSchema },
      { name: DiarySchemaVersionSchemaClass.name, schema: DiarySchemaVersionSchema },
    ]),
    forwardRef(() => PagesModule),
  ],
  controllers: [WorldsController],
  providers: [
    WorldsService,
    { provide: 'IWorldsRepository', useClass: MongoWorldsRepository },
    { provide: 'IWorldMembershipRepository', useClass: MongoWorldMembershipRepository },
    { provide: 'IWorldSettingsRepository', useClass: MongoWorldSettingsRepository },
    { provide: 'IDiarySchemaVersionsRepository', useClass: MongoDiarySchemaVersionsRepository },
    WorldsGateway,
  ],
  exports: [WorldsService, 'IWorldsRepository', 'IWorldMembershipRepository'],
})
export class WorldsModule {}
```

- [ ] **Step 5.3: Ověř kompilaci**

```bash
cd backend
npx nest build 2>&1 | head -20
```

Očekávaný výstup: žádné chyby.

- [ ] **Step 5.4: Commit**

```bash
git add src/modules/worlds/worlds.controller.ts src/modules/worlds/worlds.module.ts
git commit -m "feat(7d): přidat diary-schema-versions endpointy a registraci v WorldsModule"
```

---

## Task 6: Finální ověření

- [ ] **Step 6.1: Spusť kompletní test suite**

```bash
cd backend
npx jest --no-coverage 2>&1 | tail -15
```

Očekávaný výstup: `Test Suites: X passed`, žádné failures.

- [ ] **Step 6.2: Ověř TypeScript kompilaci**

```bash
cd backend
npx nest build 2>&1 | head -30
```

Očekávaný výstup: `Successfully compiled`, žádné TS chyby.

- [ ] **Step 6.3: Zkontroluj strukturu souborů**

```bash
ls backend/src/modules/system-presets/presets/
ls backend/src/modules/worlds/diary-schema-versions/
```

Očekávaný výstup:
- `presets/`: 16 preset souborů + `index.ts`
- `diary-schema-versions/`: 4 soubory (interface, repo interface, schema, repository)

- [ ] **Step 6.4: Aktualizuj roadmapu**

V `docs/roadmap.md` v sekci Krok 7d:
- Záhlaví `⬜` → `✅`
- Všechny `- [ ]` → `- [x]`
- Přidej odkaz na plán: `**Plán:** [docs/superpowers/plans/2026-05-03-krok-7d-rpg-system-presets.md](superpowers/plans/2026-05-03-krok-7d-rpg-system-presets.md)`
- V tabulce přehledu: `7d | RPG System Presets | ✅`

- [ ] **Step 6.5: Finální commit**

```bash
git add docs/roadmap.md docs/superpowers/plans/2026-05-03-krok-7d-rpg-system-presets.md
git commit -m "docs: označit Krok 7d jako hotový"
```
