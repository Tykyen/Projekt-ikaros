import { IsNotEmpty, IsObject } from 'class-validator';

/**
 * 8.5 D-DIARY-1 — POST /worlds/:worldId/characters/:slug/diary/remap
 *
 * Klíče mapy = staré (původní) keys v `customData`. Hodnoty = nové keys.
 * Service přejmenuje keys 1:1, nezmění hodnoty.
 */
export class RemapDiaryKeysDto {
  @IsObject() @IsNotEmpty() mapping: Record<string, string>;
}
