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
  ValidateIf,
} from 'class-validator';

/**
 * Spec 2.1b — PUT /ikaros-events/:id. Všechna pole volitelná; alespoň jedno
 * musí být přítomné (kontroluje service). `imageUrl/imageFocalX/Y` přijímají
 * `null` = odebrání obrázku / resetování focal pointu.
 */
export class UpdateIkarosEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, {
    message: 'date musí být ISO 8601 datum a čas',
  })
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @ValidateIf((o: UpdateIkarosEventDto) => o.imageUrl !== null)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateIkarosEventDto) => o.imageFocalX !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalX?: number | null;

  @IsOptional()
  @ValidateIf((o: UpdateIkarosEventDto) => o.imageFocalY !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  imageFocalY?: number | null;

  // 9.5+ — zoom 25–400, null = reset na default cover (100).
  @IsOptional()
  @ValidateIf((o: UpdateIkarosEventDto) => o.imageZoom !== null)
  @IsNumber()
  @Min(25)
  @Max(400)
  imageZoom?: number | null;

  // 9.5+ — fit režim ('cover' default, 'contain' = vidět celý). null = reset.
  @IsOptional()
  @ValidateIf((o: UpdateIkarosEventDto) => o.imageFit !== null)
  @IsIn(['cover', 'contain'])
  imageFit?: 'cover' | 'contain' | null;

  @IsOptional()
  @IsBoolean()
  confirmable?: boolean;
}
