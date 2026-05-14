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
