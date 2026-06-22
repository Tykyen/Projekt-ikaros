import { IsBoolean, IsOptional } from 'class-validator';

/**
 * 15.9 — částečná aktualizace notifikačních preferencí (delta merge na service).
 * Všechna pole optional: pošle se jen to, co se mění; ostatní zůstanou.
 */
export class UpdateNotificationPreferencesDto {
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
  @IsOptional() @IsBoolean() worldChat?: boolean;
  @IsOptional() @IsBoolean() worldEvent?: boolean;
  @IsOptional() @IsBoolean() ownDiscussion?: boolean;
  @IsOptional() @IsBoolean() ownContent?: boolean;
  @IsOptional() @IsBoolean() worldNews?: boolean;
  @IsOptional() @IsBoolean() ikarosNews?: boolean;
  @IsOptional() @IsBoolean() hospoda?: boolean;
}
