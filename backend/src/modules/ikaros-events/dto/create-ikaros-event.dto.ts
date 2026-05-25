import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  Min,
  Max,
  Matches,
} from 'class-validator';

/** Spec 2.1b — POST /ikaros-events. */
export class CreateIkarosEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  /** ISO 8601 datum a čas (FE posílá z `datetime-local` pickeru). */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, {
    message: 'date musí být ISO 8601 datum a čas',
  })
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
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

  /** Default `true` (řeší service). */
  @IsOptional()
  @IsBoolean()
  confirmable?: boolean;
}
