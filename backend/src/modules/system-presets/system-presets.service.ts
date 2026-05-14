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
