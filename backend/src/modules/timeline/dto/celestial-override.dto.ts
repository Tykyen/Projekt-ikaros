import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { LunarPhase } from '../../world-calendar-config/interfaces/world-calendar-config.interface';

const LUNAR_PHASES: LunarPhase[] = [
  'new',
  'waxing-crescent',
  'first-quarter',
  'waxing-gibbous',
  'full',
  'waning-gibbous',
  'last-quarter',
  'waning-crescent',
];

/**
 * 9.2b — Override jedné fáze nebeského tělesa pro konkrétní timeline event.
 * Field `value` (legacy) → `phase` (8-fázový enum).
 */
export class CelestialOverrideDto {
  @IsString()
  @IsNotEmpty()
  bodyId: string;

  @IsIn(LUNAR_PHASES)
  phase: LunarPhase;
}
