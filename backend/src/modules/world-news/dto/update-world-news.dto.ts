import {
  IsString,
  IsOptional,
  IsIn,
  IsUrl,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/**
 * worldId zde NENÍ — je immutable. Pokud klient pošle, service vrátí 400.
 * createdBy také není — server-side audit field, klient nesmí nastavovat.
 */
export class UpdateWorldNewsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_UTC, { message: 'date musí být ISO 8601 v UTC' })
  date?: string;

  @IsOptional()
  @IsIn(['info', 'alert', 'system'])
  type?: 'info' | 'alert' | 'system';

  @IsOptional()
  @IsUrl({ require_protocol: true })
  link?: string;
}
