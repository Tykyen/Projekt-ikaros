import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

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
}
