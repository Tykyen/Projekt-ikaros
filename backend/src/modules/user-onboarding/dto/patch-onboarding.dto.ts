import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Spec 26.3 — klíče map (journeyId/stepId/milestone id) smí nést tečky
 * (`pj.create-world`), ale NE `$` (operator injection) ani `:` (rezervováno
 * pro escapování teček na service hranici). Hodnoty klíčů validuje service
 * `assertSafeKeys` — class-validator na dynamické klíče nedosáhne.
 */
export const SAFE_KEY_RE = /^[a-z0-9_.-]{1,100}$/i;

export class JourneyPatchDto {
  /** $min — první start vyhrává (re-POST idempotentní). */
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  /** first-write-wins (pipeline $ifNull) — fixace světa cesty se nemění. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contextWorldId?: string;

  /** stepId → doneAt (ISO); merge $min per step. */
  @IsOptional()
  @IsObject()
  steps?: Record<string, string>;

  /** LWW; null = zrušit pauzu. */
  @IsOptional()
  pausedAt?: string | null;

  /** LWW; null = obnovit cestu. */
  @IsOptional()
  dismissedAt?: string | null;
}

export class PatchOnboardingDto {
  @IsOptional()
  @IsIn(['pj', 'hrac', 'worldbuilder', null])
  persona?: 'pj' | 'hrac' | 'worldbuilder' | null;

  @IsOptional()
  @IsIn(['active', 'onCall'])
  mode?: 'active' | 'onCall';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastSeenChangelog?: string;

  @IsOptional()
  @IsBoolean()
  backfilled?: boolean;

  /** set-union přírůstek — routy, které uživatel poprvé viděl. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  seenRoutesAdd?: string[];

  /** set-union přírůstek — zavřené bubliny/tipy (nikdy se neopakují). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  dismissedAdd?: string[];

  /** id → dosaženo (ISO); merge $min per id. */
  @IsOptional()
  @IsObject()
  milestones?: Record<string, string>;

  @IsOptional()
  @IsObject()
  @ValidateNested({ each: true })
  @Type(() => JourneyPatchDto)
  journeys?: Record<string, JourneyPatchDto>;
}
