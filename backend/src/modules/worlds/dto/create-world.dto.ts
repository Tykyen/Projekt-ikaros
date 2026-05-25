import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateWorldCalendarConfigDto } from '../../world-calendar-config/dto/create-world-calendar-config.dto';

export class CreateWorldDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsString() @MinLength(2) @MaxLength(40) slug: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() genre?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tones?: string[];
  @IsOptional() @IsString() @MaxLength(500) playersWanted?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dice?: string[];
  @IsOptional()
  @IsString()
  @IsIn(['public', 'open', 'private', 'closed'])
  accessMode?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsNumber() playerCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999) maxPlayers?: number;
  /** Krok 5.0 — motiv světa zvolený ve wizardu tvorby. */
  @IsOptional() @IsString() @MaxLength(40) themeId?: string;

  /**
   * 9.3-F-I — Q1: volitelný seznam kalendářů k seednutí při tvorbě světa.
   *
   * `undefined` (default) → BC behavior: auto-seed Gregorian.
   * `[]` → svět vznikne **bez kalendáře** (PJ vytvoří později ručně).
   * `[c1, c2, ...]` → seedne každý preset (FE pošle full template z `presets/`).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateWorldCalendarConfigDto)
  calendars?: CreateWorldCalendarConfigDto[];

  /**
   * 9.3-F-I — Q1: který z `calendars` má být ⭐ default svět
   * (`world.defaultCalendarConfigSlug`). Pokud chybí, použije se `calendars[0].slug`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'defaultCalendarSlug musí být kebab-case',
  })
  defaultCalendarSlug?: string;
}
