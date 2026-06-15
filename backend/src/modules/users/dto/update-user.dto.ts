import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsUrl,
  Matches,
  IsObject,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { THEME_IDS } from '../constants/theme-ids';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(32) displayName?: string;
  @IsOptional() @IsUrl() avatarUrl?: string;
  @IsOptional() @Matches(/^[a-z0-9-]+\/[a-z0-9-]+$/) characterPath?: string;
  // F-23 — sjednoceno s RegisterDto + RequestUsernameChangeDto
  // (MinLength(3), MaxLength(32), /^[^@]+$/). Přímý PATCH dříno bez
  // MinLength/Matches → kratší/`@`-jméno prošlo, na rozdíl od registrace.
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[^@]+$/, { message: 'Přezdívka nesmí obsahovat @' })
  username?: string;
  @IsOptional() @IsObject() themeSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() chatPreferences?: Record<string, unknown>;
  // D-052 — privacy „neviditelný" mód (skrýt online stav)
  @IsOptional() @IsBoolean() hiddenPresence?: boolean;
  // D-045 — privacy „skrýt mě v adresáři uživatelů"
  @IsOptional() @IsBoolean() hiddenInDirectory?: boolean;
  // D-057 — friend-only privacy
  @IsOptional() @IsIn(['public', 'friends']) profileVisibility?:
    | 'public'
    | 'friends';
  // D-072 — barva chatu, hex #RRGGBB
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'chatColor musí být hex #RRGGBB' })
  chatColor?: string;

  // 1.3a BE catch-up — profilová pole
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
  @IsOptional() @IsString() @MaxLength(64) characterName?: string;
  @IsOptional() @IsString() @MaxLength(1000) characterBio?: string;
  // N-11 — validace proti seznamu platných motivů (jinak by se uložil libovolný string).
  @IsOptional()
  @IsIn(THEME_IDS, { message: 'themeId není platný motiv' })
  themeId?: string;
  @IsOptional()
  @IsIn(['male', 'female', 'being'])
  defaultAvatarType?: 'male' | 'female' | 'being';
  // characterAvatarUrl se nastavuje jen přes upload/delete endpointy (ne přes
  // PATCH body), proto bez @IsUrl — prázdný string = smazaný avatar.
  @IsOptional() @IsString() characterAvatarUrl?: string;
}
