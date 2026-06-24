import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 16.1e — přidání bojovníka do rosteru konverzace. Discriminated dle `kind`:
 *  - `character`: jen reference (`characterSlug`) — HP žije v deníku.
 *  - `bestie`: hotový snapshot z FE katalogu (`buildBestieToken` parita s mapou) —
 *    `name`/`systemStats`/`abilities`/`notes`. BE generuje `id` + gatuje PJ.
 * Tvar dle `kind` ověří service (`assertCombatantShape`).
 */
export class AddCombatantDto {
  @IsIn(['character', 'bestie']) kind: 'character' | 'bestie';
  @IsOptional() @IsNumber() initiative?: number;
  @IsOptional() @IsBoolean() inCombat?: boolean;
  @IsOptional() @IsBoolean() isNpc?: boolean;

  // kind === 'character'
  @IsOptional() @IsString() @MaxLength(256) characterSlug?: string;

  // kind === 'bestie'
  @IsOptional() @IsString() @MaxLength(256) bestieId?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(512) imageUrl?: string;
  @IsOptional() @IsObject() systemStats?: Record<string, unknown>;
  @IsOptional() @IsArray() abilities?: { name: string; description: string }[];
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

/** 16.1e — patch bojovníka (HP/iniciativa/inCombat/jméno/poznámky/staty). */
export class UpdateCombatantDto {
  @IsOptional() @IsNumber() initiative?: number;
  @IsOptional() @IsBoolean() inCombat?: boolean;
  @IsOptional() @IsBoolean() isNpc?: boolean;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(512) imageUrl?: string;
  @IsOptional() @IsObject() systemStats?: Record<string, unknown>;
  @IsOptional() @IsArray() abilities?: { name: string; description: string }[];
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
