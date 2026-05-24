import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  IsObject,
} from 'class-validator';

/**
 * Krok 9.1 (cleanup) — Update DTO pro subdoc data (diaryData/extraBlocks/
 * customData) + slug/name/userId/isNpc. Bio a accessRequirements jsou
 * v Page entity; tento DTO je už nepřijímá.
 */
export class UpdateCharacterDto {
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsBoolean() isNpc?: boolean;
  /** Spec 9.2 — viz Character.kind v interface. */
  @IsOptional() @IsIn(['persona', 'location']) kind?: 'persona' | 'location';
  @IsOptional() @IsObject() diaryData?: Record<string, unknown>;
  @IsOptional() @IsArray() extraBlocks?: Record<string, unknown>[];
  @IsOptional() @IsString() campaignSubjectId?: string;
  @IsOptional() @IsObject() customData?: Record<string, unknown>;

  /**
   * D-073 (2026-05-23) — optimistic concurrency token. Klient pošle hodnotu
   * `updatedAt` z předchozího GET; pokud server mezitím dostal jiný PATCH,
   * vrátí 409 `CHARACTER_CONFLICT`. Bez pole = update bez kontroly (legacy).
   */
  @IsOptional() @IsString() expectedUpdatedAt?: string;
}
