import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 8.5-BE-3 — DTO pro PATCH /worlds/:worldId/characters/:slug/diary.
 *
 * Předtím tento endpoint přijímal `Record<string, unknown>` bez jakékoliv
 * validace — PJ-only akce, ale stále tichý risk. Teď whitelistujeme:
 *   - `personalDiarySchema` (volitelný per-postava override; `null` = reset
 *     na svět-level schéma)
 *   - `customData` (hodnoty bloků; service je dál filtruje proti aktivnímu
 *     schématu — viz 8.5-BE-4 coerce)
 *   - `sections` (textové sekce, free shape — sjednotí se s `pages` později)
 */

const DIARY_BLOCK_TYPES = [
  'stat',
  'bar',
  'list',
  'text',
  'number',
  'textarea',
  // D-DIARY-3 — image / relation / formula typy; viz CreateDiarySchemaVersionDto.
  'image',
  'relation',
  'formula',
] as const;

export class CustomDiaryBlockDto {
  @IsString() @IsNotEmpty() @MaxLength(64) id: string;
  @IsString() @IsIn([...DIARY_BLOCK_TYPES]) type: string;
  @IsString() @IsNotEmpty() @MaxLength(120) label: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() maxValue?: number;
  @IsOptional() @IsNumber() minValue?: number;
  @IsOptional() @IsString() @MaxLength(32) color?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) options?: string[];
  @IsInt() @Min(0) order: number;
  @IsOptional() @IsString() @MaxLength(64) layoutArea?: string;
}

export class UpdateCharacterDiaryDto {
  /**
   * `null` (explicitní) = reset overridu, deník se vrátí k schématu světa.
   * `undefined` (chybí v body) = ponech beze změny.
   * Pole bloků = nahradí override za nový.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CustomDiaryBlockDto)
  personalDiarySchema?: CustomDiaryBlockDto[] | null;

  /**
   * **Deprecated** (2026-05-24, BUG: D-040-followup data loss).
   * Plně nahrazuje `customData` v DB — způsobí ztrátu klíčů které FE momentálně
   * nedrží (např. po system switchi). Zůstává pro backward compat se starým FE.
   * **Nový kód musí používat `customDataPatch`** (delta merge).
   */
  @IsOptional() @IsObject() customData?: Record<string, unknown>;

  /**
   * 2026-05-24 — delta merge customData. FE pošle jen změněné keys; BE provede
   * per-key `$set: { 'customData.<key>': value }` → ostatní keys (např. z jiných
   * system presetů po switchi) zůstanou nedotčené. Coerce schématu se aplikuje
   * jen na keys v patchi.
   *
   * Hodnota `null` u konkrétního key = `$unset` (smazat jen tento key).
   */
  @IsOptional() @IsObject() customDataPatch?: Record<string, unknown>;

  @IsOptional() @IsArray() sections?: unknown[];
}
