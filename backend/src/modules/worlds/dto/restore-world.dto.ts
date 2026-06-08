import { IsOptional, IsString } from 'class-validator';

/**
 * Obnova soft-smazaného světa. `newOwnerId` (volitelně) = převzetí světa —
 * Admin při obnově přiřadí nového vlastníka (např. když původní PJ odešel).
 */
export class RestoreWorldDto {
  @IsOptional()
  @IsString()
  newOwnerId?: string;
}
