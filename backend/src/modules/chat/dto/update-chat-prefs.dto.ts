import { IsArray, IsMongoId, IsObject, IsOptional } from 'class-validator';

/**
 * 6.7b/c — partial update osobních prefs chat sidebaru (per hráč).
 * Vše volitelné: pošle se jen to, co se právě mění (pořadí / sbalení).
 */
export class UpdateChatPrefsDto {
  /** 6.7b — osobní pořadí kanálů (`groupId` v cílovém pořadí). */
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  groupOrder?: string[];

  /** 6.7b — osobní pořadí konverzací per kanál (`groupId` → `channelId[]`). */
  @IsOptional()
  @IsObject()
  channelOrder?: Record<string, string[]>;

  /** 6.7c — `groupId` kanálů, které má hráč rozbalené. */
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  expandedGroups?: string[];

  /** D-032 — osobní pořadí připnutých konverzací (`channelId` v cílovém pořadí). */
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  pinnedOrder?: string[];
}
