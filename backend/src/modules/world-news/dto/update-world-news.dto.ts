import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsIn,
  IsUrl,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FantasyDateDto } from './create-world-news.dto';

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
  @ValidateIf((o: UpdateWorldNewsDto) => o.link !== null)
  @IsUrl({ require_protocol: true })
  link?: string | null;

  // 9.5 — interní link na wiki stránku světa (slug); null = odebrat.
  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.linkPageSlug !== null)
  @IsString()
  @MaxLength(120)
  linkPageSlug?: string | null;

  // 9.5 — hero obrázek + focal point. Null = odebrat.
  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.imageUrl !== null)
  @IsString()
  @MaxLength(2048)
  @Matches(/^(https?:\/\/|\/)/, {
    message: 'imageUrl musí být absolutní URL nebo cesta začínající /',
  })
  imageUrl?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.imageFocalX !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number | null;

  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.imageFocalY !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number | null;

  // 9.5+ — zoom 25–400, null = reset na default cover (100).
  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.imageZoom !== null)
  @IsNumber()
  @Min(25)
  @Max(400)
  imageZoom?: number | null;

  // 9.5+ — fit režim ('cover' default, 'contain' = vidět celý). null = reset.
  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.imageFit !== null)
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain' | null;

  // 9.2e — fantasy datum (null = reset na real-world gregorian display).
  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.calendarConfigId !== null)
  @IsString()
  @MaxLength(50)
  calendarConfigId?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateWorldNewsDto) => o.calendarDate !== null)
  @ValidateNested()
  @Type(() => FantasyDateDto)
  calendarDate?: FantasyDateDto | null;
}
