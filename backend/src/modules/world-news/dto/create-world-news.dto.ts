import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsInt,
  IsUrl,
  IsNumber,
  Min,
  Max,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class FantasyDateDto {
  @IsInt() year: number;
  @IsInt() @Min(0) monthIndex: number;
  @IsInt() @Min(1) day: number;
  @IsOptional() @IsInt() @Min(0) @Max(48) hour?: number;
  @IsOptional() @IsInt() @Min(0) @Max(59) minute?: number;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export class CreateWorldNewsDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  worldId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_UTC, {
    message: 'date musí být ISO 8601 v UTC (např. 2026-05-06T10:00:00.000Z)',
  })
  date?: string;

  @IsOptional()
  @IsIn(['info', 'alert', 'system'])
  type?: 'info' | 'alert' | 'system';

  @IsOptional()
  @IsUrl({ require_protocol: true })
  link?: string;

  // 9.5 — interní link na wiki stránku světa (slug); priorita před `link`.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  linkPageSlug?: string;

  // 9.5 — hero obrázek (parita s 9.1 game events).
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/|\/)/, {
    message: 'imageUrl musí být absolutní URL nebo cesta začínající /',
  })
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number;

  // 9.5+ — zoom v procentech (25–400, default null = 100 = cover).
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(400)
  imageZoom?: number;

  // 9.5+ — fit režim ('cover' default, 'contain' = vidět celý).
  @IsOptional()
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain';

  // 9.2e — fantasy datum (slug kalendáře + structured object).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  calendarConfigId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FantasyDateDto)
  calendarDate?: FantasyDateDto;
}
