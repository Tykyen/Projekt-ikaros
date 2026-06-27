import { Injectable } from '@nestjs/common';
import type { SystemPreset } from './interfaces/system-preset.interface';
import { SYSTEM_PRESETS } from './presets';

export interface SystemPresetMeta {
  system: string;
  displayName: string;
}

/**
 * D-NEW-SYS-PRESET-SEED-DRIFT — normalizace `world.system` (FE canonical id) na
 * id BE presetu. BE presety mají historicky jinou sadu id než `world.system`
 * (`matrix-custom` vs `matrix`, `call-of-cthulhu` vs `coc`, `drd-hero` vs
 * `drdh`/`draci-hlidka`), takže `findOne(world.system)` u nich vracel `null` →
 * BE seedoval prázdné `diarySchema`. Zrcadlí FE `getDiaryPreset` (lowercase +
 * alias → lookup). Systémy bez BE presetu (`drd16` rozpadlý na 5 povolání,
 * `drd2`, `drdplus`) zůstávají `null` — jsou FE-canonical (soft-mode), schéma
 * jede přes FE sheet; doplnění plných BE presetů = samostatný krok.
 */
const SYSTEM_TO_PRESET: Record<string, string> = {
  matrix: 'matrix-custom',
  coc: 'call-of-cthulhu',
  'call-of-cthulhu': 'call-of-cthulhu',
  drdh: 'drd-hero',
  'draci-hlidka': 'drd-hero',
  dnd: 'dnd5e',
};

@Injectable()
export class SystemPresetsService {
  findAll(): SystemPresetMeta[] {
    return SYSTEM_PRESETS.map((p) => ({
      system: p.system,
      displayName: p.displayName,
    }));
  }

  findOne(system: string): SystemPreset | null {
    const key = (system ?? '').toLowerCase();
    const presetId = SYSTEM_TO_PRESET[key] ?? key;
    return SYSTEM_PRESETS.find((p) => p.system === presetId) ?? null;
  }
}
